// ─── Shared domain types for the Mhenching POS system ───

export interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
  barcode: string | null;
  image_path?: string | null;
  pack_multiplier?: number;
}

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export type PosMode = 'quick_sale' | 'table_bill';

export type BillStatus = 'open' | 'bill_requested' | 'partially_paid' | 'paid' | 'voided';

export interface BillSession {
  id: string;
  table_or_group_name: string;
  status: BillStatus;
  total_amount: number;
  attendant_id: string | null;
  notes: string | null;
  created_at: string;
  bill_requested_at: string | null;
  closed_at: string | null;
}

export interface EmbeddedProduct {
  name: string | null;
  tier: string | null;
}

export interface BillItem {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  price_at_sale: number;
  unit_cost_at_sale: number | null;
  subtotal: number;
  voided: boolean | null;
  created_at: string;
  products: EmbeddedProduct | EmbeddedProduct[] | null;
}
