-- Existing database upgrade for restobar bills, payment tracking, utang ledger,
-- omnichannel orders, and inventory expiry/batch analytics.
-- Run this once on the existing Supabase project after database_schema.sql was applied.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bill_session_status') THEN
        CREATE TYPE bill_session_status AS ENUM ('open', 'bill_requested', 'partially_paid', 'paid', 'voided');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ar_status') THEN
        CREATE TYPE ar_status AS ENUM ('pending', 'paid', 'overdue');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_channel') THEN
        CREATE TYPE order_channel AS ENUM ('pos', 'table_bill', 'website', 'facebook', 'tiktok');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
        CREATE TYPE delivery_status AS ENUM ('pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE payment_method AS ENUM ('cash', 'gcash', 'maya_qr', 'card_terminal', 'usdt_manual', 'utang_ledger');
    END IF;
END $$;

ALTER TYPE bill_session_status ADD VALUE IF NOT EXISTS 'partially_paid';

ALTER TABLE products
ADD COLUMN IF NOT EXISTS received_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS batch_number TEXT,
ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS accounts_receivable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT NOT NULL,
    contact_info TEXT,
    source_transaction_id UUID,
    total_amount_owed NUMERIC NOT NULL CHECK (total_amount_owed >= 0),
    remaining_balance NUMERIC NOT NULL CHECK (remaining_balance >= 0),
    due_date DATE NOT NULL,
    status ar_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT accounts_receivable_balance_not_above_total
        CHECK (remaining_balance <= total_amount_owed)
);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_method payment_method NOT NULL DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC,
ADD COLUMN IF NOT EXISTS change_due NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS accounts_receivable_id UUID REFERENCES accounts_receivable(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bill_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_or_group_name TEXT NOT NULL,
    status bill_session_status NOT NULL DEFAULT 'open',
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    attendant_id TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    bill_requested_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES bill_sessions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_sale NUMERIC NOT NULL CHECK (price_at_sale >= 0),
    unit_cost_at_sale NUMERIC DEFAULT 0 CHECK (unit_cost_at_sale >= 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    voided BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_channel order_channel NOT NULL DEFAULT 'pos',
    delivery_status delivery_status NOT NULL DEFAULT 'pending',
    transaction_id UUID REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    bill_session_id UUID REFERENCES bill_sessions(id) ON DELETE SET NULL,
    accounts_receivable_id UUID REFERENCES accounts_receivable(id) ON DELETE SET NULL,
    customer_name TEXT,
    contact_info TEXT,
    delivery_address TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_expiry_date ON products(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_received_date ON products(received_date) WHERE received_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_accounts_receivable_id ON transactions(accounts_receivable_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bill_sessions_status ON bill_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bill_items_session_id ON bill_items(session_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON bill_items(product_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status_due ON accounts_receivable(status, due_date);
CREATE INDEX IF NOT EXISTS idx_orders_channel_status ON orders(order_channel, delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_transaction_id ON orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_orders_bill_session_id ON orders(bill_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_accounts_receivable_id ON orders(accounts_receivable_id);

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'products',
        'transactions',
        'transaction_items',
        'bill_sessions',
        'bill_items',
        'accounts_receivable',
        'orders'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = v_table
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', v_table);
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION process_checkout_with_payment(
    p_device_id TEXT,
    p_attendant_id TEXT,
    p_items JSONB,
    p_payment_method TEXT DEFAULT 'cash',
    p_payment_reference TEXT DEFAULT NULL,
    p_amount_received NUMERIC DEFAULT NULL,
    p_ar_customer_name TEXT DEFAULT NULL,
    p_ar_contact_info TEXT DEFAULT NULL,
    p_ar_due_date DATE DEFAULT NULL,
    p_order_channel TEXT DEFAULT 'pos'
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transaction_id UUID;
    v_accounts_receivable_id UUID;
    v_order_id UUID;
    v_total_amount NUMERIC := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_price NUMERIC;
    v_unit_cost NUMERIC;
    v_subtotal NUMERIC;
    v_stock INTEGER;
    v_payment_method payment_method := COALESCE(NULLIF(p_payment_method, ''), 'cash')::payment_method;
    v_order_channel order_channel := COALESCE(NULLIF(p_order_channel, ''), 'pos')::order_channel;
    v_amount_received NUMERIC;
    v_remaining_balance NUMERIC;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Checkout requires at least one item';
    END IF;

    IF v_payment_method = 'utang_ledger' THEN
        IF NULLIF(TRIM(COALESCE(p_ar_customer_name, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Customer name is required for utang ledger checkout';
        END IF;

        IF p_ar_due_date IS NULL THEN
            RAISE EXCEPTION 'Due date is required for utang ledger checkout';
        END IF;
    END IF;

    INSERT INTO transactions (device_id, attendant_id, total_amount, payment_method, payment_reference, amount_paid)
    VALUES (
        p_device_id,
        p_attendant_id,
        0,
        v_payment_method,
        NULLIF(TRIM(COALESCE(p_payment_reference, '')), ''),
        p_amount_received
    )
    RETURNING transaction_id INTO v_transaction_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;

        SELECT price, COALESCE(unit_cost, 0), current_stock_quantity
        INTO v_price, v_unit_cost, v_stock
        FROM products
        WHERE product_id = v_product_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_product_id;
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
        END IF;

        IF v_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
        END IF;

        v_subtotal := v_price * v_quantity;
        v_total_amount := v_total_amount + v_subtotal;

        INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, unit_cost_at_sale, subtotal)
        VALUES (v_transaction_id, v_product_id, v_quantity, v_price, v_unit_cost, v_subtotal);

        UPDATE products
        SET current_stock_quantity = current_stock_quantity - v_quantity
        WHERE product_id = v_product_id;
    END LOOP;

    v_amount_received := CASE
        WHEN v_payment_method = 'utang_ledger' THEN COALESCE(p_amount_received, 0)
        ELSE COALESCE(p_amount_received, v_total_amount)
    END;

    IF v_payment_method = 'utang_ledger' THEN
        v_remaining_balance := GREATEST(v_total_amount - v_amount_received, 0);

        INSERT INTO accounts_receivable (
            customer_name,
            contact_info,
            source_transaction_id,
            total_amount_owed,
            remaining_balance,
            due_date,
            status
        )
        VALUES (
            TRIM(p_ar_customer_name),
            NULLIF(TRIM(COALESCE(p_ar_contact_info, '')), ''),
            v_transaction_id,
            v_total_amount,
            v_remaining_balance,
            p_ar_due_date,
            CASE
                WHEN v_remaining_balance <= 0 THEN 'paid'::ar_status
                WHEN p_ar_due_date < CURRENT_DATE THEN 'overdue'::ar_status
                ELSE 'pending'::ar_status
            END
        )
        RETURNING id INTO v_accounts_receivable_id;
    END IF;

    UPDATE transactions
    SET
        total_amount = v_total_amount,
        amount_paid = v_amount_received,
        change_due = CASE
            WHEN v_payment_method = 'utang_ledger' THEN 0
            ELSE GREATEST(v_amount_received - v_total_amount, 0)
        END,
        accounts_receivable_id = v_accounts_receivable_id
    WHERE transaction_id = v_transaction_id;

    INSERT INTO orders (
        order_channel,
        delivery_status,
        transaction_id,
        accounts_receivable_id,
        customer_name,
        contact_info,
        total_amount
    )
    VALUES (
        v_order_channel,
        'delivered',
        v_transaction_id,
        v_accounts_receivable_id,
        NULLIF(TRIM(COALESCE(p_ar_customer_name, '')), ''),
        NULLIF(TRIM(COALESCE(p_ar_contact_info, '')), ''),
        v_total_amount
    )
    RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'order_id', v_order_id,
        'accounts_receivable_id', v_accounts_receivable_id,
        'total_amount', v_total_amount,
        'payment_method', v_payment_method,
        'amount_paid', v_amount_received
    );
END;
$$;

CREATE OR REPLACE FUNCTION process_checkout(
    p_device_id TEXT,
    p_attendant_id TEXT,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN process_checkout_with_payment(p_device_id, p_attendant_id, p_items, 'cash', NULL, NULL, NULL, NULL, NULL, 'pos');
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO anon, authenticated;
GRANT SELECT, INSERT ON transaction_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bill_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bill_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts_receivable TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_checkout(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_checkout_with_payment(TEXT, TEXT, JSONB, TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE, TEXT) TO anon, authenticated;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MVP clients can read products" ON products;
DROP POLICY IF EXISTS "MVP clients can insert products" ON products;
DROP POLICY IF EXISTS "MVP clients can update products" ON products;
DROP POLICY IF EXISTS "MVP clients can delete products" ON products;
DROP POLICY IF EXISTS "MVP clients can manage products" ON products;
CREATE POLICY "MVP clients can manage products" ON products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can read transactions" ON transactions;
DROP POLICY IF EXISTS "MVP clients can insert transactions" ON transactions;
DROP POLICY IF EXISTS "MVP clients can update transactions" ON transactions;
DROP POLICY IF EXISTS "MVP clients can manage transactions" ON transactions;
CREATE POLICY "MVP clients can manage transactions" ON transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can read transaction items" ON transaction_items;
DROP POLICY IF EXISTS "MVP clients can insert transaction items" ON transaction_items;
DROP POLICY IF EXISTS "MVP clients can manage transaction items" ON transaction_items;
CREATE POLICY "MVP clients can manage transaction items" ON transaction_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can manage bill sessions" ON bill_sessions;
CREATE POLICY "MVP clients can manage bill sessions" ON bill_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can manage bill items" ON bill_items;
CREATE POLICY "MVP clients can manage bill items" ON bill_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can manage accounts receivable" ON accounts_receivable;
CREATE POLICY "MVP clients can manage accounts receivable" ON accounts_receivable FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can manage orders" ON orders;
CREATE POLICY "MVP clients can manage orders" ON orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
