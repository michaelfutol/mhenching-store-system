-- Database Schema for Supabase Serverless Setup

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Products Table
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    tier TEXT DEFAULT '',
    price NUMERIC NOT NULL,
    barcode TEXT UNIQUE,
    unit_cost NUMERIC,
    markup_percentage NUMERIC,
    profit_margin NUMERIC,
    current_stock_quantity INTEGER DEFAULT 0,
    pack_multiplier INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Transactions Table
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_id TEXT NOT NULL,
    attendant_id TEXT NOT NULL,
    total_amount NUMERIC NOT NULL,
    closed BOOLEAN DEFAULT FALSE
);

-- 3. Transaction Items Table
CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    price_at_sale NUMERIC NOT NULL,
    unit_cost_at_sale NUMERIC DEFAULT 0,
    subtotal NUMERIC NOT NULL
);

-- Turn on Realtime for products to allow mobile clients to sync instantly
alter publication supabase_realtime add table products;

-- 4. Atomic Checkout RPC Function
-- This function processes a checkout server-side safely without a Node backend
CREATE OR REPLACE FUNCTION process_checkout(
    p_device_id TEXT,
    p_attendant_id TEXT,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_transaction_id UUID;
    v_total_amount NUMERIC := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_price NUMERIC;
    v_unit_cost NUMERIC;
    v_subtotal NUMERIC;
    v_stock INTEGER;
BEGIN
    -- Create the initial transaction record
    INSERT INTO transactions (device_id, attendant_id, total_amount)
    VALUES (p_device_id, p_attendant_id, 0)
    RETURNING transaction_id INTO v_transaction_id;

    -- Loop through each item in the payload
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;

        -- Get product details and lock row for update
        SELECT price, COALESCE(unit_cost, 0), current_stock_quantity
        INTO v_price, v_unit_cost, v_stock
        FROM products
        WHERE product_id = v_product_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_product_id;
        END IF;

        IF v_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
        END IF;

        v_subtotal := v_price * v_quantity;
        v_total_amount := v_total_amount + v_subtotal;

        -- Insert transaction item
        INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, unit_cost_at_sale, subtotal)
        VALUES (v_transaction_id, v_product_id, v_quantity, v_price, v_unit_cost, v_subtotal);

        -- Decrement stock
        UPDATE products
        SET current_stock_quantity = current_stock_quantity - v_quantity
        WHERE product_id = v_product_id;
    END LOOP;

    -- Update transaction with final total
    UPDATE transactions
    SET total_amount = v_total_amount
    WHERE transaction_id = v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'total_amount', v_total_amount
    );
END;
$$;
