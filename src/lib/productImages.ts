import { supabase } from '@/lib/supabase';

export const PRODUCT_IMAGE_BUCKET = 'product-images';

const SAFE_PATH_PATTERN = /[^a-zA-Z0-9._-]+/g;

export function getProductImageUrl(imagePath?: string | null) {
  if (!imagePath) return null;

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(imagePath);

  return data.publicUrl;
}

export function createProductImagePath(input: {
  barcode?: string | null;
  name?: string | null;
  fileName?: string | null;
}) {
  const identity = input.barcode || input.name || 'product';
  const safeIdentity = identity.trim().replace(SAFE_PATH_PATTERN, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'product';
  const safeFileName = (input.fileName || 'photo.jpg')
    .trim()
    .replace(SAFE_PATH_PATTERN, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'photo.jpg';

  return `products/${safeIdentity}/${Date.now()}-${safeFileName}`;
}
