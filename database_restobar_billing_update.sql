-- Restobar running bill RPCs.
-- Adds server-side operations for opening table/group bills, adding confirmed
-- items with stock decrement, requesting the bill, settling the bill, and voiding
-- an unpaid bill with optional stock restoration.

CREATE OR REPLACE FUNCTION create_bill_session(
    p_table_or_group_name TEXT,
    p_attendant_id TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id UUID;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_table_or_group_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Table or group name is required';
    END IF;

    INSERT INTO bill_sessions (table_or_group_name, attendant_id, notes)
    VALUES (
        TRIM(p_table_or_group_name),
        NULLIF(TRIM(COALESCE(p_attendant_id, '')), ''),
        NULLIF(TRIM(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', v_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION add_items_to_bill(
    p_session_id UUID,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session bill_sessions%ROWTYPE;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_price NUMERIC;
    v_unit_cost NUMERIC;
    v_subtotal NUMERIC;
    v_stock INTEGER;
    v_added_amount NUMERIC := 0;
    v_added_count INTEGER := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Bill addition requires at least one item';
    END IF;

    SELECT *
    INTO v_session
    FROM bill_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill session % not found', p_session_id;
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested') THEN
        RAISE EXCEPTION 'Cannot add items to a % bill', v_session.status;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;

        SELECT price, COALESCE(unit_cost, 0), current_stock_quantity
        INTO v_price, v_unit_cost, v_stock
        FROM products
        WHERE product_id = v_product_id
        FOR UPDATE;

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
        v_added_amount := v_added_amount + v_subtotal;
        v_added_count := v_added_count + v_quantity;

        INSERT INTO bill_items (
            session_id,
            product_id,
            quantity,
            price_at_sale,
            unit_cost_at_sale,
            subtotal
        )
        VALUES (
            p_session_id,
            v_product_id,
            v_quantity,
            v_price,
            v_unit_cost,
            v_subtotal
        );

        UPDATE products
        SET current_stock_quantity = current_stock_quantity - v_quantity
        WHERE product_id = v_product_id;
    END LOOP;

    UPDATE bill_sessions
    SET
        total_amount = total_amount + v_added_amount,
        status = 'open'
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'added_amount', v_added_amount,
        'added_count', v_added_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION request_bill(
    p_session_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status bill_session_status;
BEGIN
    SELECT status
    INTO v_status
    FROM bill_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill session % not found', p_session_id;
    END IF;

    IF v_status NOT IN ('open', 'bill_requested') THEN
        RAISE EXCEPTION 'Cannot request bill for a % session', v_status;
    END IF;

    UPDATE bill_sessions
    SET
        status = 'bill_requested',
        bill_requested_at = COALESCE(bill_requested_at, NOW())
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION settle_bill_session(
    p_session_id UUID,
    p_device_id TEXT,
    p_attendant_id TEXT,
    p_payment_method TEXT DEFAULT 'cash',
    p_payment_reference TEXT DEFAULT NULL,
    p_amount_received NUMERIC DEFAULT NULL,
    p_ar_customer_name TEXT DEFAULT NULL,
    p_ar_contact_info TEXT DEFAULT NULL,
    p_ar_due_date DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session bill_sessions%ROWTYPE;
    v_transaction_id UUID;
    v_accounts_receivable_id UUID;
    v_order_id UUID;
    v_payment_method payment_method := COALESCE(NULLIF(p_payment_method, ''), 'cash')::payment_method;
    v_amount_received NUMERIC;
    v_remaining_balance NUMERIC;
BEGIN
    SELECT *
    INTO v_session
    FROM bill_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill session % not found', p_session_id;
    END IF;

    IF v_session.status NOT IN ('open', 'bill_requested', 'partially_paid') THEN
        RAISE EXCEPTION 'Cannot settle a % bill', v_session.status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM bill_items
        WHERE session_id = p_session_id
        AND voided = FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot settle an empty bill';
    END IF;

    IF v_payment_method = 'utang_ledger' THEN
        IF NULLIF(TRIM(COALESCE(p_ar_customer_name, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Customer name is required for utang ledger checkout';
        END IF;

        IF p_ar_due_date IS NULL THEN
            RAISE EXCEPTION 'Due date is required for utang ledger checkout';
        END IF;
    END IF;

    v_amount_received := CASE
        WHEN v_payment_method = 'utang_ledger' THEN COALESCE(p_amount_received, 0)
        ELSE COALESCE(p_amount_received, v_session.total_amount)
    END;

    INSERT INTO transactions (
        device_id,
        attendant_id,
        total_amount,
        payment_method,
        payment_reference,
        amount_paid,
        change_due
    )
    VALUES (
        p_device_id,
        p_attendant_id,
        v_session.total_amount,
        v_payment_method,
        NULLIF(TRIM(COALESCE(p_payment_reference, '')), ''),
        v_amount_received,
        CASE
            WHEN v_payment_method = 'utang_ledger' THEN 0
            ELSE GREATEST(v_amount_received - v_session.total_amount, 0)
        END
    )
    RETURNING transaction_id INTO v_transaction_id;

    INSERT INTO transaction_items (
        transaction_id,
        product_id,
        quantity,
        price_at_sale,
        unit_cost_at_sale,
        subtotal
    )
    SELECT
        v_transaction_id,
        product_id,
        quantity,
        price_at_sale,
        unit_cost_at_sale,
        subtotal
    FROM bill_items
    WHERE session_id = p_session_id
    AND voided = FALSE;

    IF v_payment_method = 'utang_ledger' THEN
        v_remaining_balance := GREATEST(v_session.total_amount - v_amount_received, 0);

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
            v_session.total_amount,
            v_remaining_balance,
            p_ar_due_date,
            CASE
                WHEN v_remaining_balance <= 0 THEN 'paid'::ar_status
                WHEN p_ar_due_date < CURRENT_DATE THEN 'overdue'::ar_status
                ELSE 'pending'::ar_status
            END
        )
        RETURNING id INTO v_accounts_receivable_id;

        UPDATE transactions
        SET accounts_receivable_id = v_accounts_receivable_id
        WHERE transaction_id = v_transaction_id;
    END IF;

    UPDATE bill_sessions
    SET
        status = 'paid',
        closed_at = NOW()
    WHERE id = p_session_id;

    INSERT INTO orders (
        order_channel,
        delivery_status,
        transaction_id,
        bill_session_id,
        accounts_receivable_id,
        customer_name,
        contact_info,
        total_amount
    )
    VALUES (
        'table_bill',
        'delivered',
        v_transaction_id,
        p_session_id,
        v_accounts_receivable_id,
        COALESCE(NULLIF(TRIM(COALESCE(p_ar_customer_name, '')), ''), v_session.table_or_group_name),
        NULLIF(TRIM(COALESCE(p_ar_contact_info, '')), ''),
        v_session.total_amount
    )
    RETURNING id INTO v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'transaction_id', v_transaction_id,
        'order_id', v_order_id,
        'accounts_receivable_id', v_accounts_receivable_id,
        'total_amount', v_session.total_amount,
        'payment_method', v_payment_method,
        'amount_paid', v_amount_received
    );
END;
$$;

CREATE OR REPLACE FUNCTION void_bill_session(
    p_session_id UUID,
    p_restore_stock BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session bill_sessions%ROWTYPE;
    v_item RECORD;
BEGIN
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
            AND voided = FALSE
        LOOP
            UPDATE products
            SET current_stock_quantity = current_stock_quantity + v_item.quantity
            WHERE product_id = v_item.product_id;
        END LOOP;
    END IF;

    UPDATE bill_items
    SET voided = TRUE
    WHERE session_id = p_session_id;

    UPDATE bill_sessions
    SET
        status = 'voided',
        closed_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_bill_session(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION add_items_to_bill(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_bill(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_bill_session(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION void_bill_session(UUID, BOOLEAN) TO anon, authenticated;
