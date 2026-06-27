-- Existing database update for product photos and realtime admin views.
-- Run this once on an existing Supabase project that already applied database_schema.sql.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_path TEXT;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO anon, authenticated;
GRANT SELECT, INSERT ON transaction_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_checkout(TEXT, TEXT, JSONB) TO anon, authenticated;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MVP clients can read products" ON products;
CREATE POLICY "MVP clients can read products"
ON products
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "MVP clients can insert products" ON products;
CREATE POLICY "MVP clients can insert products"
ON products
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can update products" ON products;
CREATE POLICY "MVP clients can update products"
ON products
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can delete products" ON products;
CREATE POLICY "MVP clients can delete products"
ON products
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "MVP clients can read transactions" ON transactions;
CREATE POLICY "MVP clients can read transactions"
ON transactions
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "MVP clients can insert transactions" ON transactions;
CREATE POLICY "MVP clients can insert transactions"
ON transactions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can update transactions" ON transactions;
CREATE POLICY "MVP clients can update transactions"
ON transactions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "MVP clients can read transaction items" ON transaction_items;
CREATE POLICY "MVP clients can read transaction items"
ON transaction_items
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "MVP clients can insert transaction items" ON transaction_items;
CREATE POLICY "MVP clients can insert transaction items"
ON transaction_items
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE products;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'transaction_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE transaction_items;
    END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Product images are publicly readable" ON storage.objects;
CREATE POLICY "Product images are publicly readable"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "MVP clients can upload product images" ON storage.objects;
CREATE POLICY "MVP clients can upload product images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "MVP clients can replace product images" ON storage.objects;
CREATE POLICY "MVP clients can replace product images"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');
