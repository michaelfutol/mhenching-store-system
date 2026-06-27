-- Adds live POS cart monitoring and manager-approved void controls.
-- Run after database_restobar_billing_update.sql on existing projects.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_cart_status') THEN
        CREATE TYPE pos_cart_status AS ENUM ('active', 'checked_out', 'voided', 'abandoned');
    END IF;
END $$;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS voided BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS voided_by TEXT,
ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS voided BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS voided_by TEXT,
ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE bill_items
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS voided_by TEXT,
ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE TABLE IF NOT EXISTS pos_cart_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_key TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    attendant_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'quick_sale',
    bill_session_id UUID REFERENCES bill_sessions(id) ON DELETE SET NULL,
    status pos_cart_status NOT NULL DEFAULT 'active',
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_session_id UUID NOT NULL REFERENCES pos_cart_sessions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_tier TEXT DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_sale NUMERIC NOT NULL CHECK (price_at_sale >= 0),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (cart_session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_voided ON transactions(voided);
CREATE INDEX IF NOT EXISTS idx_transaction_items_voided ON transaction_items(voided);
CREATE INDEX IF NOT EXISTS idx_pos_cart_sessions_status_updated ON pos_cart_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_cart_sessions_attendant ON pos_cart_sessions(attendant_id);
CREATE INDEX IF NOT EXISTS idx_pos_cart_items_session_id ON pos_cart_items(cart_session_id);
CREATE INDEX IF NOT EXISTS idx_pos_cart_items_product_id ON pos_cart_items(product_id);

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['pos_cart_sessions', 'pos_cart_items']
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

CREATE OR REPLACE FUNCTION void_bill_item(
    p_item_id UUID,
    p_manager_pin TEXT,
    p_void_reason TEXT DEFAULT NULL,
    p_voided_by TEXT DEFAULT 'manager',
    p_restore_stock BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item bill_items%ROWTYPE;
    v_status bill_session_status;
    v_new_total NUMERIC;
BEGIN
    IF COALESCE(p_manager_pin, '') <> '1234' THEN
        RAISE EXCEPTION 'Invalid manager PIN';
    END IF;

    SELECT *
    INTO v_item
    FROM bill_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill item % not found', p_item_id;
    END IF;

    IF COALESCE(v_item.voided, FALSE) THEN
        RAISE EXCEPTION 'Bill item % is already voided', p_item_id;
    END IF;

    SELECT status
    INTO v_status
    FROM bill_sessions
    WHERE id = v_item.session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill session % not found', v_item.session_id;
    END IF;

    IF v_status NOT IN ('open', 'bill_requested', 'partially_paid') THEN
        RAISE EXCEPTION 'Cannot void an item from a % bill', v_status;
    END IF;

    IF p_restore_stock THEN
        UPDATE products
        SET current_stock_quantity = current_stock_quantity + v_item.quantity
        WHERE product_id = v_item.product_id;
    END IF;

    UPDATE bill_items
    SET
        voided = TRUE,
        voided_at = NOW(),
        voided_by = NULLIF(TRIM(COALESCE(p_voided_by, 'manager')), ''),
        void_reason = NULLIF(TRIM(COALESCE(p_void_reason, '')), '')
    WHERE id = p_item_id;

    SELECT COALESCE(SUM(subtotal), 0)
    INTO v_new_total
    FROM bill_items
    WHERE session_id = v_item.session_id
    AND COALESCE(voided, FALSE) = FALSE;

    UPDATE bill_sessions
    SET total_amount = v_new_total
    WHERE id = v_item.session_id;

    RETURN jsonb_build_object(
        'success', true,
        'item_id', p_item_id,
        'session_id', v_item.session_id,
        'restored_stock', p_restore_stock,
        'new_total', v_new_total
    );
END;
$$;

CREATE OR REPLACE FUNCTION void_bill_session_with_pin(
    p_session_id UUID,
    p_manager_pin TEXT,
    p_restore_stock BOOLEAN DEFAULT TRUE,
    p_void_reason TEXT DEFAULT NULL,
    p_voided_by TEXT DEFAULT 'manager'
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session bill_sessions%ROWTYPE;
    v_item RECORD;
BEGIN
    IF COALESCE(p_manager_pin, '') <> '1234' THEN
        RAISE EXCEPTION 'Invalid manager PIN';
    END IF;

    SELECT *
    INTO v_session
    FROM bill_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill session % not found', p_session_id;
    END IF;

    IF v_session.status IN ('paid', 'voided') THEN
        RAISE EXCEPTION 'Cannot void a % bill', v_session.status;
    END IF;

    IF p_restore_stock THEN
        FOR v_item IN
            SELECT product_id, quantity
            FROM bill_items
            WHERE session_id = p_session_id
            AND COALESCE(voided, FALSE) = FALSE
        LOOP
            UPDATE products
            SET current_stock_quantity = current_stock_quantity + v_item.quantity
            WHERE product_id = v_item.product_id;
        END LOOP;
    END IF;

    UPDATE bill_items
    SET
        voided = TRUE,
        voided_at = NOW(),
        voided_by = NULLIF(TRIM(COALESCE(p_voided_by, 'manager')), ''),
        void_reason = NULLIF(TRIM(COALESCE(p_void_reason, '')), '')
    WHERE session_id = p_session_id
    AND COALESCE(voided, FALSE) = FALSE;

    UPDATE bill_sessions
    SET
        status = 'voided',
        total_amount = 0,
        closed_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'restored_stock', p_restore_stock);
END;
$$;

CREATE OR REPLACE FUNCTION void_transaction(
    p_transaction_id UUID,
    p_manager_pin TEXT,
    p_void_reason TEXT DEFAULT NULL,
    p_voided_by TEXT DEFAULT 'manager',
    p_restore_stock BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transaction transactions%ROWTYPE;
    v_item RECORD;
BEGIN
    IF COALESCE(p_manager_pin, '') <> '1234' THEN
        RAISE EXCEPTION 'Invalid manager PIN';
    END IF;

    SELECT *
    INTO v_transaction
    FROM transactions
    WHERE transaction_id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
    END IF;

    IF COALESCE(v_transaction.voided, FALSE) THEN
        RAISE EXCEPTION 'Transaction % is already voided', p_transaction_id;
    END IF;

    IF p_restore_stock THEN
        FOR v_item IN
            SELECT product_id, quantity
            FROM transaction_items
            WHERE transaction_id = p_transaction_id
            AND COALESCE(voided, FALSE) = FALSE
        LOOP
            UPDATE products
            SET current_stock_quantity = current_stock_quantity + v_item.quantity
            WHERE product_id = v_item.product_id;
        END LOOP;
    END IF;

    UPDATE transaction_items
    SET
        voided = TRUE,
        voided_at = NOW(),
        voided_by = NULLIF(TRIM(COALESCE(p_voided_by, 'manager')), ''),
        void_reason = NULLIF(TRIM(COALESCE(p_void_reason, '')), '')
    WHERE transaction_id = p_transaction_id
    AND COALESCE(voided, FALSE) = FALSE;

    UPDATE transactions
    SET
        voided = TRUE,
        voided_at = NOW(),
        voided_by = NULLIF(TRIM(COALESCE(p_voided_by, 'manager')), ''),
        void_reason = NULLIF(TRIM(COALESCE(p_void_reason, '')), ''),
        closed = TRUE
    WHERE transaction_id = p_transaction_id;

    IF v_transaction.accounts_receivable_id IS NOT NULL THEN
        UPDATE accounts_receivable
        SET
            remaining_balance = 0,
            status = 'paid',
            paid_at = COALESCE(paid_at, NOW()),
            notes = COALESCE(notes || E'\n', '') || 'Voided with transaction ' || p_transaction_id::TEXT
        WHERE id = v_transaction.accounts_receivable_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'restored_stock', p_restore_stock,
        'voided_amount', v_transaction.total_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION void_bill_session(UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION void_bill_item(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION void_bill_session_with_pin(UUID, TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION void_transaction(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON pos_cart_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_cart_items TO anon, authenticated;

ALTER TABLE pos_cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MVP clients can manage POS cart sessions" ON pos_cart_sessions;
CREATE POLICY "MVP clients can manage POS cart sessions"
ON pos_cart_sessions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can manage POS cart items" ON pos_cart_items;
CREATE POLICY "MVP clients can manage POS cart items"
ON pos_cart_items
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
