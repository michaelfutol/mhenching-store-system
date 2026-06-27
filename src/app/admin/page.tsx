"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getProductImageUrl } from '@/lib/productImages';
import { getLocalDateKey, managerPin } from '@/lib/access';

interface ItemSale {
  productId: string;
  name: string;
  tier: string;
  qty: number;
  subtotal: number;
  cogs: number;
  grossProfit: number;
}

interface EODData {
  totalRevenue: number;
  totalCOGS: number;
  netProfit: number;
  totalTransactions: number;
  openTransactions: number;
  closedTransactions: number;
  itemSales: ItemSale[];
  attendantSales: Record<string, number>;
}

interface Product {
  product_id: string;
  name: string;
  tier: string;
  price: number;
  barcode: string | null;
  unit_cost: number | null;
  markup_percentage: number | null;
  profit_margin: number | null;
  image_path: string | null;
  current_stock_quantity: number;
  pack_multiplier: number;
  received_date: string | null;
  expiry_date: string | null;
  batch_number: string | null;
  is_perishable: boolean | null;
  reorder_point: number | null;
}

type ArStatus = 'pending' | 'paid' | 'overdue';
type BillStatus = 'open' | 'bill_requested' | 'partially_paid' | 'paid' | 'voided';

interface AccountsReceivable {
  id: string;
  customer_name: string;
  contact_info: string | null;
  source_transaction_id: string | null;
  total_amount_owed: number;
  remaining_balance: number;
  due_date: string;
  status: ArStatus;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
}

interface AdminBillItem {
  id: string;
  quantity: number;
  subtotal: number;
  voided: boolean | null;
  created_at: string;
}

interface AdminBillSession {
  id: string;
  table_or_group_name: string;
  status: BillStatus;
  total_amount: number;
  attendant_id: string | null;
  notes: string | null;
  created_at: string;
  bill_requested_at: string | null;
  closed_at: string | null;
  bill_items: AdminBillItem[] | null;
}

type PosCartStatus = 'active' | 'checked_out' | 'voided' | 'abandoned';

interface AdminPosCartItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_tier: string | null;
  quantity: number;
  price_at_sale: number;
  subtotal: number;
  updated_at: string;
}

interface AdminPosCartSession {
  id: string;
  session_key: string;
  device_id: string;
  attendant_id: string;
  mode: string;
  bill_session_id: string | null;
  status: PosCartStatus;
  total_amount: number;
  item_count: number;
  created_at: string;
  updated_at: string;
  pos_cart_items: AdminPosCartItem[] | null;
}

type EmbeddedProduct = {
  name: string | null;
  tier: string | null;
};

interface EODTransactionItem {
  product_id: string | null;
  quantity: number;
  price_at_sale?: number;
  unit_cost_at_sale: number | null;
  subtotal: number;
  voided?: boolean | null;
  products: EmbeddedProduct | EmbeddedProduct[] | null;
}

interface EODTransaction {
  transaction_id: string;
  timestamp?: string;
  device_id?: string;
  attendant_id: string;
  total_amount: number;
  payment_method?: string;
  closed: boolean | null;
  voided?: boolean | null;
  void_reason?: string | null;
  transaction_items: EODTransactionItem[] | null;
}

type ProductPayload = {
  name: string;
  tier: string;
  price: number;
  barcode: string | null;
  unit_cost: number | null;
  markup_percentage: number | null;
  profit_margin: number | null;
  image_path: string | null;
  current_stock_quantity: number;
  pack_multiplier: number;
  received_date: string | null;
  expiry_date: string | null;
  batch_number: string | null;
  is_perishable: boolean;
  reorder_point: number;
};

interface AnalyticsSignal {
  title: string;
  value: string;
  detail: string;
  severity: 'good' | 'watch' | 'risk' | 'neutral';
  icon: string;
}

type AdminTab = 'dashboard' | 'reports' | 'live_pos' | 'products' | 'utang' | 'bills' | 'bulk_import';
type ReportPeriod = 'daily' | 'weekly' | 'monthly';
type ReplenishmentUrgency = 'ok' | 'watch' | 'reorder' | 'critical';

interface FastMovingInventoryItem {
  productId: string;
  name: string;
  tier: string;
  sku: string;
  soldQty: number;
  currentStock: number;
  reorderPoint: number;
  unitCost: number;
  revenue: number;
  grossProfit: number;
  suggestedReplenishQty: number;
  estimatedCapitalNeeded: number;
  coverageUnits: number;
  urgency: ReplenishmentUrgency;
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const emptyProduct = (): Partial<Product> => ({
  tier: '',
  barcode: '',
  unit_cost: null,
  markup_percentage: null,
  profit_margin: null,
  image_path: null,
  current_stock_quantity: 0,
  pack_multiplier: 1,
  received_date: null,
  expiry_date: null,
  batch_number: '',
  is_perishable: false,
  reorder_point: 0,
});

const parseOptionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRequiredNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToTwoDecimals = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const roundToFourDecimals = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

const formatCurrency = (value: number) => currencyFormatter.format(value);

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const requestManagerPin = (action: string) => {
  const pin = window.prompt(`Manager PIN required to ${action}.`);

  if (pin === null) return null;

  if (pin !== managerPin) {
    alert('Incorrect manager PIN.');
    return null;
  }

  return pin;
};

const getAnalyticsSeverityClasses = (severity: AnalyticsSignal['severity']) => {
  if (severity === 'good') return 'border-secondary/40 bg-secondary-container/30 text-secondary';
  if (severity === 'risk') return 'border-error/40 bg-error-container/40 text-error';
  if (severity === 'watch') return 'border-tertiary/40 bg-tertiary-fixed/40 text-tertiary';
  return 'border-surface-variant bg-surface-container-low text-on-surface-variant';
};

const getReplenishmentUrgencyClasses = (urgency: ReplenishmentUrgency) => {
  if (urgency === 'critical') return 'bg-error-container text-error border-error/30';
  if (urgency === 'reorder') return 'bg-tertiary-fixed text-on-tertiary-fixed border-tertiary/30';
  if (urgency === 'watch') return 'bg-primary-fixed text-on-primary-fixed border-primary/30';
  return 'bg-secondary-container text-on-secondary-container border-secondary/30';
};

const getReplenishmentUrgencyLabel = (urgency: ReplenishmentUrgency) => {
  if (urgency === 'critical') return 'Critical';
  if (urgency === 'reorder') return 'Reorder';
  if (urgency === 'watch') return 'Watch';
  return 'OK';
};

const getDateOnlyTime = (value: string | null | undefined) => {
  if (!value) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const getTodayTime = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
};

const getEffectiveArStatus = (record: AccountsReceivable): ArStatus => {
  if (record.status === 'paid' || Number(record.remaining_balance) <= 0) return 'paid';

  const dueTime = getDateOnlyTime(record.due_date);
  if (dueTime !== null && dueTime < getTodayTime()) return 'overdue';

  return record.status;
};

const getArStatusClasses = (status: ArStatus) => {
  if (status === 'paid') return 'bg-secondary-container text-on-secondary-container border-secondary/30';
  if (status === 'overdue') return 'bg-error-container text-error border-error/30';
  return 'bg-tertiary-fixed text-on-tertiary-fixed border-tertiary/30';
};

const getBillStatusLabel = (status: BillStatus) => {
  if (status === 'bill_requested') return 'Bill Requested';
  if (status === 'partially_paid') return 'Partially Paid';
  if (status === 'paid') return 'Paid';
  if (status === 'voided') return 'Voided';
  return 'Open';
};

const getBillStatusClasses = (status: BillStatus) => {
  if (status === 'bill_requested') return 'bg-tertiary-fixed text-on-tertiary-fixed border-tertiary/30';
  if (status === 'partially_paid') return 'bg-primary-fixed text-on-primary-fixed border-primary/30';
  if (status === 'paid') return 'bg-secondary-container text-on-secondary-container border-secondary/30';
  if (status === 'voided') return 'bg-error-container text-error border-error/30';
  return 'bg-surface-container text-on-surface-variant border-surface-variant';
};

const formatAge = (value: string | null | undefined) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDashboardDate = (value: Date) => (
  value.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
);

const formatDashboardTime = (value: Date) => (
  value.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
);

const escapeHtml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
);

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const rowsToCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\n');

const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.href = href;
  downloadAnchorNode.download = fileName;
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  URL.revokeObjectURL(href);
};

const printTextReport = (title: string, body: string) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    alert('Print window was blocked. Use Download Text instead.');
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 32px; line-height: 1.45; }
          h1 { font-size: 24px; margin: 0 0 16px; }
          pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 13px; }
          @media print { body { padding: 12mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <pre>${escapeHtml(body)}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

const buildClosedEODTextReport = (report: EODData) => {
  const lines = [
    'Mhenching Store System - Closed EOD Report',
    `Report Date: ${getLocalDateKey()}`,
    `Generated: ${new Date().toLocaleString('en-PH')}`,
    '',
    'Closed EOD Summary:',
    `- Revenue: ${formatCurrency(report.totalRevenue)}`,
    `- COGS: ${formatCurrency(report.totalCOGS)}`,
    `- Net Profit: ${formatCurrency(report.netProfit)}`,
    `- Closed Transactions: ${report.totalTransactions}`,
    '',
    'Item Breakdown:',
    ...(report.itemSales.length > 0
      ? report.itemSales.map((item, index) => `${index + 1}. ${item.name}${item.tier ? ` (${item.tier})` : ''} | Qty ${item.qty} | Revenue ${formatCurrency(item.subtotal)} | COGS ${formatCurrency(item.cogs)} | Profit ${formatCurrency(item.grossProfit)}`)
      : ['- No closed item sales for this date.']),
    '',
    'Sales By Attendant:',
    ...(Object.entries(report.attendantSales).length > 0
      ? Object.entries(report.attendantSales)
        .sort(([, a], [, b]) => b - a)
        .map(([attendant, total]) => `- ${attendant}: ${formatCurrency(total)}`)
      : ['- No closed attendant sales for this date.']),
  ];

  return lines.join('\n');
};

const buildAggregateTextReport = (
  report: EODData,
  title: string,
  periodLabel: string,
  fastMovingPlan: FastMovingInventoryItem[] = [],
) => {
  const lines = [
    `Mhenching Store System - ${title} Sales Report`,
    `Period: ${periodLabel}`,
    `Generated: ${new Date().toLocaleString('en-PH')}`,
    '',
    'Aggregate Summary:',
    `- Revenue: ${formatCurrency(report.totalRevenue)}`,
    `- COGS: ${formatCurrency(report.totalCOGS)}`,
    `- Net Profit: ${formatCurrency(report.netProfit)}`,
    `- Transactions: ${report.totalTransactions}`,
    `- Open: ${report.openTransactions}`,
    `- Closed: ${report.closedTransactions}`,
    '',
    'Top Items:',
    ...(report.itemSales.length > 0
      ? report.itemSales.map((item, index) => `${index + 1}. ${item.name}${item.tier ? ` (${item.tier})` : ''} | Qty ${item.qty} | Revenue ${formatCurrency(item.subtotal)} | COGS ${formatCurrency(item.cogs)} | Profit ${formatCurrency(item.grossProfit)}`)
      : ['- No item sales for this period.']),
    '',
    'Sales By Attendant:',
    ...(Object.entries(report.attendantSales).length > 0
      ? Object.entries(report.attendantSales)
        .sort(([, a], [, b]) => b - a)
        .map(([attendant, total]) => `- ${attendant}: ${formatCurrency(total)}`)
      : ['- No attendant sales for this period.']),
    '',
    'Top 10 Fast-Moving Replenishment:',
    ...(fastMovingPlan.length > 0
      ? [
        `- Estimated capital needed: ${formatCurrency(sumCapitalNeeded(fastMovingPlan))}`,
        ...fastMovingPlan.map((item, index) => `${index + 1}. ${item.name}${item.tier ? ` (${item.tier})` : ''} | SKU ${item.sku} | Sold ${item.soldQty} | Stock ${item.currentStock} | Suggest buy ${item.suggestedReplenishQty} | Capital ${formatCurrency(item.estimatedCapitalNeeded)} | ${getReplenishmentUrgencyLabel(item.urgency)}`),
      ]
      : ['- No fast-moving sales for this period.']),
  ];

  return lines.join('\n');
};

const toDateInputValue = (value: string | null | undefined) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
};

const toTimestampOrNull = (value: string | null | undefined) => {
  if (!value) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getDaysUntil = (value: string | null | undefined) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
};

const getDayBounds = () => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return {
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString(),
  };
};

const parseDateKeyAsLocalDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const getReportPeriodBounds = (period: ReportPeriod, anchorDateKey: string) => {
  const anchor = parseDateKeyAsLocalDate(anchorDateKey);
  let start = new Date(anchor);
  let end = new Date(anchor);

  if (period === 'weekly') {
    const dayOffsetFromMonday = (anchor.getDay() + 6) % 7;
    start = new Date(anchor);
    start.setDate(anchor.getDate() - dayOffsetFromMonday);
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'monthly') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  const label = period === 'weekly'
    ? `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`
    : period === 'monthly'
      ? start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
      : formatDate(start.toISOString());

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label,
  };
};

const getReportPeriodTitle = (period: ReportPeriod) => {
  if (period === 'weekly') return 'Weekly';
  if (period === 'monthly') return 'Monthly';
  return 'Daily';
};

const buildEODReport = (transactions: EODTransaction[]): EODData => {
  let totalRevenue = 0;
  let totalCOGS = 0;
  const itemSales: Record<string, ItemSale> = {};
  const attendantSales: Record<string, number> = {};

  transactions.forEach((tx) => {
    if (tx.voided) return;

    const transactionTotal = Number(tx.total_amount) || 0;
    totalRevenue += transactionTotal;
    attendantSales[tx.attendant_id] = (attendantSales[tx.attendant_id] || 0) + transactionTotal;

    (tx.transaction_items || []).forEach((item) => {
      if (item.voided) return;

      const quantity = Number(item.quantity) || 0;
      const subtotal = Number(item.subtotal) || 0;
      const unitCostAtSale = Number(item.unit_cost_at_sale) || 0;
      const itemCOGS = unitCostAtSale * quantity;
      const productId = item.product_id || 'unknown-product';
      const product = Array.isArray(item.products) ? item.products[0] : item.products;

      totalCOGS += itemCOGS;

      if (!itemSales[productId]) {
        itemSales[productId] = {
          productId,
          name: product?.name || 'Unknown item',
          tier: product?.tier || '',
          qty: 0,
          subtotal: 0,
          cogs: 0,
          grossProfit: 0,
        };
      }

      itemSales[productId].qty += quantity;
      itemSales[productId].subtotal += subtotal;
      itemSales[productId].cogs += itemCOGS;
      itemSales[productId].grossProfit += subtotal - itemCOGS;
    });
  });

  return {
    totalRevenue,
    totalCOGS,
    netProfit: totalRevenue - totalCOGS,
    totalTransactions: transactions.filter((tx) => !tx.voided).length,
    openTransactions: transactions.filter((tx) => !tx.voided && !tx.closed).length,
    closedTransactions: transactions.filter((tx) => !tx.voided && !!tx.closed).length,
    itemSales: Object.values(itemSales).sort((a, b) => b.subtotal - a.subtotal),
    attendantSales,
  };
};

const buildFastMovingInventoryPlan = (
  itemSales: ItemSale[],
  products: Product[],
  limit = 10,
): FastMovingInventoryItem[] => {
  const productsById = new Map(products.map((product) => [product.product_id, product]));

  return itemSales
    .filter((item) => item.qty > 0)
    .slice()
    .sort((a, b) => b.qty - a.qty || b.subtotal - a.subtotal)
    .slice(0, limit)
    .map((item) => {
      const product = productsById.get(item.productId);
      const currentStock = Number(product?.current_stock_quantity) || 0;
      const reorderPoint = Math.max(Number(product?.reorder_point) || 0, 5);
      const unitCost = Number(product?.unit_cost) || (item.qty > 0 ? item.cogs / item.qty : 0);
      const targetStock = Math.max(reorderPoint, item.qty * 2, 5);
      const suggestedReplenishQty = Math.max(0, Math.ceil(targetStock - currentStock));
      const coverageUnits = item.qty > 0 ? roundToTwoDecimals(currentStock / item.qty) : 0;
      const estimatedCapitalNeeded = roundToTwoDecimals(suggestedReplenishQty * unitCost);
      const urgency: ReplenishmentUrgency = currentStock <= 0
        ? 'critical'
        : currentStock <= reorderPoint
          ? 'reorder'
          : currentStock <= item.qty
            ? 'watch'
            : 'ok';

      return {
        productId: item.productId,
        name: item.name,
        tier: item.tier,
        sku: product?.barcode || '-',
        soldQty: item.qty,
        currentStock,
        reorderPoint,
        unitCost,
        revenue: item.subtotal,
        grossProfit: item.grossProfit,
        suggestedReplenishQty,
        estimatedCapitalNeeded,
        coverageUnits,
        urgency,
      };
    });
};

const sumCapitalNeeded = (items: FastMovingInventoryItem[]) => (
  items.reduce((sum, item) => sum + item.estimatedCapitalNeeded, 0)
);

const buildTop10AnalyticsReport = (products: Product[], liveData: EODData | null): AnalyticsSignal[] => {
  const soldProductIds = new Set((liveData?.itemSales || []).map((item) => item.productId));
  const bestSeller = liveData?.itemSales[0] || null;
  const profitLeader = (liveData?.itemSales || []).slice().sort((a, b) => b.grossProfit - a.grossProfit)[0] || null;
  const lowMarginItem = (liveData?.itemSales || [])
    .filter((item) => item.subtotal > 0)
    .slice()
    .sort((a, b) => (a.grossProfit / a.subtotal) - (b.grossProfit / b.subtotal))[0] || null;
  const lowStock = products
    .filter((product) => product.current_stock_quantity <= Math.max(Number(product.reorder_point) || 0, 5))
    .sort((a, b) => a.current_stock_quantity - b.current_stock_quantity)[0] || null;
  const expiring = products
    .map((product) => ({ product, days: getDaysUntil(product.expiry_date) }))
    .filter((entry): entry is { product: Product; days: number } => entry.days !== null && entry.days <= 14)
    .sort((a, b) => a.days - b.days)[0] || null;
  const slowMoving = products
    .filter((product) => product.current_stock_quantity > 0 && !soldProductIds.has(product.product_id))
    .sort((a, b) => b.current_stock_quantity - a.current_stock_quantity)[0] || null;
  const fifoPriority = products
    .filter((product) => product.current_stock_quantity > 0 && (product.received_date || product.expiry_date))
    .sort((a, b) => {
      const aTime = new Date(a.expiry_date || a.received_date || '').getTime();
      const bTime = new Date(b.expiry_date || b.received_date || '').getTime();
      return (Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime) - (Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime);
    })[0] || null;
  const inventoryValue = products.reduce((sum, product) => sum + ((Number(product.unit_cost) || 0) * (Number(product.current_stock_quantity) || 0)), 0);
  const deadStockCount = products.filter((product) => product.current_stock_quantity > 0 && !soldProductIds.has(product.product_id)).length;

  return [
    {
      title: 'Sales / Net Profit',
      value: liveData ? `${formatCurrency(liveData.totalRevenue)} / ${formatCurrency(liveData.netProfit)}` : '-',
      detail: `${liveData?.openTransactions || 0} open, ${liveData?.closedTransactions || 0} closed transactions today.`,
      severity: liveData && liveData.netProfit > 0 ? 'good' : 'neutral',
      icon: 'monitoring',
    },
    {
      title: 'Best Seller vs Stock',
      value: bestSeller ? `${bestSeller.name} (${bestSeller.qty})` : 'No seller yet',
      detail: bestSeller ? `Remaining stock: ${products.find((product) => product.product_id === bestSeller.productId)?.current_stock_quantity ?? 'unknown'}.` : 'No live item sales loaded.',
      severity: bestSeller ? 'good' : 'neutral',
      icon: 'star',
    },
    {
      title: 'Highest Profit Item',
      value: profitLeader ? profitLeader.name : 'No profit leader',
      detail: profitLeader ? `${formatCurrency(profitLeader.grossProfit)} gross profit today.` : 'Needs live sales.',
      severity: profitLeader ? 'good' : 'neutral',
      icon: 'trending_up',
    },
    {
      title: 'Low Margin Watch',
      value: lowMarginItem ? lowMarginItem.name : 'No low-margin signal',
      detail: lowMarginItem ? `${formatCurrency(lowMarginItem.grossProfit)} profit from ${formatCurrency(lowMarginItem.subtotal)} revenue.` : 'Needs sales and cost data.',
      severity: lowMarginItem ? 'watch' : 'neutral',
      icon: 'percent',
    },
    {
      title: 'Stockout Risk',
      value: lowStock ? lowStock.name : 'No low stock',
      detail: lowStock ? `${lowStock.current_stock_quantity} left. Reorder point: ${lowStock.reorder_point || 5}.` : 'No product is below the default threshold.',
      severity: lowStock ? 'risk' : 'good',
      icon: 'production_quantity_limits',
    },
    {
      title: 'Slow Moving',
      value: slowMoving ? slowMoving.name : 'No slow-mover today',
      detail: slowMoving ? `${slowMoving.current_stock_quantity} in stock with no sales today. Weekly history will refine this.` : 'No unsold stocked product detected today.',
      severity: slowMoving ? 'watch' : 'good',
      icon: 'hourglass_empty',
    },
    {
      title: 'Expiry / FIFO Priority',
      value: expiring ? expiring.product.name : (fifoPriority ? fifoPriority.name : 'No expiry risk'),
      detail: expiring ? `${expiring.days} day${expiring.days === 1 ? '' : 's'} until expiry. Batch: ${expiring.product.batch_number || '-'}.` : (fifoPriority ? `Sell first. Received: ${formatDate(fifoPriority.received_date)}.` : 'No expiry or received-date signals.'),
      severity: expiring ? 'risk' : (fifoPriority ? 'watch' : 'good'),
      icon: 'event_busy',
    },
    {
      title: 'Inventory Cost Exposure',
      value: formatCurrency(inventoryValue),
      detail: 'Current stock multiplied by unit cost. This becomes sharper with stock lots.',
      severity: inventoryValue > 0 ? 'neutral' : 'watch',
      icon: 'inventory',
    },
    {
      title: 'Payment Mix Placeholder',
      value: 'Payment fields ready',
      detail: 'Cash, GCash, Maya QR, card, USDT manual, and utang ledger are captured after SQL upgrade.',
      severity: 'neutral',
      icon: 'payments',
    },
    {
      title: 'Shelf Review Queue',
      value: `${deadStockCount} item${deadStockCount === 1 ? '' : 's'}`,
      detail: 'Candidates are stocked items with no live sales today; weekly reports will decide removal.',
      severity: deadStockCount > 0 ? 'watch' : 'good',
      icon: 'rule',
    },
  ];
};

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [eodData, setEodData] = useState<EODData | null>(null);
  const [liveData, setLiveData] = useState<EODData | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [now, setNow] = useState(() => new Date());
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('daily');
  const [reportAnchorDate, setReportAnchorDate] = useState(() => getLocalDateKey());
  const [historicalReport, setHistoricalReport] = useState<EODData | null>(null);
  const [historicalReportLoading, setHistoricalReportLoading] = useState(false);
  const [historicalReportError, setHistoricalReportError] = useState<string | null>(null);

  // Product Management State
  const [products, setProducts] = useState<Product[]>([]);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>(emptyProduct());
  const [showRestockHelper, setShowRestockHelper] = useState(false);
  const [restockQtyInput, setRestockQtyInput] = useState('');
  const [restockUnitType, setRestockUnitType] = useState<'units' | 'packs'>('units');
  const [restockCostInput, setRestockCostInput] = useState('');
  const [restockCostMode, setRestockCostMode] = useState<'unit' | 'total'>('unit');
  const [restockBatchNum, setRestockBatchNum] = useState('');
  const [restockExpiryDate, setRestockExpiryDate] = useState('');

  // CSV Bulk Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsedRows, setCsvParsedRows] = useState<any[]>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{
    total: number;
    success: number;
    failed: number;
    inserted: number;
    updated: number;
    errors: string[];
  } | null>(null);

  // Accounts Receivable / Utang Ledger State
  const [utangRecords, setUtangRecords] = useState<AccountsReceivable[]>([]);
  const [utangLoading, setUtangLoading] = useState(false);
  const [utangError, setUtangError] = useState<string | null>(null);

  // Restobar Running Bills State
  const [adminBillSessions, setAdminBillSessions] = useState<AdminBillSession[]>([]);
  const [adminBillsLoading, setAdminBillsLoading] = useState(false);
  const [adminBillsError, setAdminBillsError] = useState<string | null>(null);

  // Live POS Monitoring State
  const [livePosCarts, setLivePosCarts] = useState<AdminPosCartSession[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<EODTransaction[]>([]);
  const [livePosLoading, setLivePosLoading] = useState(false);
  const [livePosError, setLivePosError] = useState<string | null>(null);

  const productMetrics = useMemo(() => {
    const retailPrice = parseOptionalNumber(currentProduct.price);
    const unitCost = parseOptionalNumber(currentProduct.unit_cost);
    const markup = parseOptionalNumber(currentProduct.markup_percentage);
    const markupPrice = unitCost !== null && markup !== null
      ? roundToTwoDecimals(unitCost * (1 + markup / 100))
      : null;
    const unitProfit = retailPrice !== null && unitCost !== null
      ? roundToTwoDecimals(retailPrice - unitCost)
      : null;
    const profitMargin = retailPrice !== null && unitCost !== null && retailPrice > 0
      ? roundToFourDecimals(((retailPrice - unitCost) / retailPrice) * 100)
      : null;

    return {
      markupPrice,
      unitProfit,
      profitMargin,
    };
  }, [currentProduct.markup_percentage, currentProduct.price, currentProduct.unit_cost]);

  const restockMetrics = useMemo(() => {
    const qtyAddedRaw = Number(restockQtyInput) || 0;
    const multiplier = restockUnitType === 'packs' ? (currentProduct.pack_multiplier || 1) : 1;
    const totalUnitsAdded = qtyAddedRaw * multiplier;

    const costRaw = Number(restockCostInput) || 0;
    let unitCostNew = 0;
    if (totalUnitsAdded > 0) {
      unitCostNew = restockCostMode === 'total' ? (costRaw / totalUnitsAdded) : costRaw;
    } else {
      unitCostNew = costRaw;
    }

    // Current metrics before restock
    const oldPrice = currentProduct.price || 0;
    const oldCost = currentProduct.unit_cost || 0;
    const oldMarginPercent = oldPrice > 0 ? ((oldPrice - oldCost) / oldPrice) * 100 : 0;
    const oldProfitAmt = oldPrice - oldCost;

    // Suggested Pricing options based on unitCostNew
    // Option A: Keep current price
    const marginA = oldPrice > 0 ? ((oldPrice - unitCostNew) / oldPrice) * 100 : 0;
    const profitA = oldPrice - unitCostNew;

    // Option B: Maintain Margin %
    const targetPriceB = oldMarginPercent < 100 ? (unitCostNew / (1 - (oldMarginPercent / 100))) : unitCostNew;
    const profitB = targetPriceB - unitCostNew;

    // Option C: Maintain Profit Amount
    const targetPriceC = unitCostNew + (oldProfitAmt > 0 ? oldProfitAmt : 0);
    const marginC = targetPriceC > 0 ? ((targetPriceC - unitCostNew) / targetPriceC) * 100 : 0;

    return {
      totalUnitsAdded,
      unitCostNew: Math.round((unitCostNew + Number.EPSILON) * 100) / 100,
      oldPrice,
      oldCost,
      oldMarginPercent,
      oldProfitAmt,
      optionA: { price: oldPrice, margin: marginA, profit: profitA },
      optionB: { price: Math.round((targetPriceB + Number.EPSILON) * 100) / 100, margin: oldMarginPercent, profit: profitB },
      optionC: { price: Math.round((targetPriceC + Number.EPSILON) * 100) / 100, margin: marginC, profit: oldProfitAmt }
    };
  }, [restockQtyInput, restockUnitType, restockCostInput, restockCostMode, currentProduct.pack_multiplier, currentProduct.price, currentProduct.unit_cost]);

  const currentProductImageUrl = useMemo(
    () => getProductImageUrl(currentProduct.image_path),
    [currentProduct.image_path],
  );

  const analyticsSignals = useMemo(
    () => buildTop10AnalyticsReport(products, liveData),
    [liveData, products],
  );

  const liveFastMovingPlan = useMemo(
    () => buildFastMovingInventoryPlan(liveData?.itemSales || [], products),
    [liveData?.itemSales, products],
  );

  const utangSummary = useMemo(() => {
    const todayTime = getTodayTime();

    return utangRecords.reduce(
      (summary, record) => {
        const balance = Number(record.remaining_balance) || 0;
        const effectiveStatus = getEffectiveArStatus(record);
        const dueTime = getDateOnlyTime(record.due_date);

        if (effectiveStatus === 'paid') {
          summary.paidCount += 1;
          summary.paidAmount += Number(record.total_amount_owed) || 0;
        } else {
          summary.openCount += 1;
          summary.openAmount += balance;

          if (effectiveStatus === 'overdue') {
            summary.overdueCount += 1;
            summary.overdueAmount += balance;
          } else if (dueTime === todayTime) {
            summary.dueTodayCount += 1;
            summary.dueTodayAmount += balance;
          } else {
            summary.upcomingCount += 1;
          }
        }

        return summary;
      },
      {
        openCount: 0,
        openAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        dueTodayCount: 0,
        dueTodayAmount: 0,
        upcomingCount: 0,
        paidCount: 0,
        paidAmount: 0,
      },
    );
  }, [utangRecords]);

  const billSummary = useMemo(() => {
    return adminBillSessions.reduce(
      (summary, bill) => {
        const total = Number(bill.total_amount) || 0;
        const itemCount = (bill.bill_items || []).reduce((sum, item) => sum + (item.voided ? 0 : Number(item.quantity) || 0), 0);
        const createdTime = new Date(bill.created_at).getTime();

        summary.openCount += 1;
        summary.openAmount += total;
        summary.itemCount += itemCount;

        if (bill.status === 'bill_requested') {
          summary.requestedCount += 1;
          summary.requestedAmount += total;
        }

        if (!Number.isNaN(createdTime)) {
          summary.oldestCreatedAt = summary.oldestCreatedAt === null
            ? bill.created_at
            : (createdTime < new Date(summary.oldestCreatedAt).getTime() ? bill.created_at : summary.oldestCreatedAt);
        }

        return summary;
      },
      {
        openCount: 0,
        openAmount: 0,
        requestedCount: 0,
        requestedAmount: 0,
        itemCount: 0,
        oldestCreatedAt: null as string | null,
      },
    );
  }, [adminBillSessions]);

  const livePosSummary = useMemo(() => {
    return livePosCarts.reduce(
      (summary, cart) => {
        const updatedTime = new Date(cart.updated_at).getTime();

        summary.activeCarts += 1;
        summary.totalAmount += Number(cart.total_amount) || 0;
        summary.itemCount += Number(cart.item_count) || 0;

        if (!Number.isNaN(updatedTime)) {
          summary.latestUpdatedAt = summary.latestUpdatedAt === null
            ? cart.updated_at
            : (updatedTime > new Date(summary.latestUpdatedAt).getTime() ? cart.updated_at : summary.latestUpdatedAt);
        }

        return summary;
      },
      {
        activeCarts: 0,
        totalAmount: 0,
        itemCount: 0,
        latestUpdatedAt: null as string | null,
      },
    );
  }, [livePosCarts]);

  const historicalReportBounds = useMemo(
    () => getReportPeriodBounds(reportPeriod, reportAnchorDate),
    [reportAnchorDate, reportPeriod],
  );

  const historicalFastMovingPlan = useMemo(
    () => buildFastMovingInventoryPlan(historicalReport?.itemSales || [], products),
    [historicalReport?.itemSales, products],
  );

  const advisorPayload = useMemo(() => {
    const expiringItems = products
      .map((product) => ({ product, days: getDaysUntil(product.expiry_date) }))
      .filter((entry): entry is { product: Product; days: number } => entry.days !== null && entry.days <= 14)
      .map((entry) => ({
        name: entry.product.name,
        sku: entry.product.barcode,
        stock: entry.product.current_stock_quantity,
        batch: entry.product.batch_number,
        expiry_date: entry.product.expiry_date,
        days_until_expiry: entry.days,
      }));
    const lowStockItems = products
      .filter((product) => product.current_stock_quantity <= Math.max(Number(product.reorder_point) || 0, 5))
      .map((product) => ({
        name: product.name,
        sku: product.barcode,
        stock: product.current_stock_quantity,
        reorder_point: product.reorder_point || 5,
      }));

    return {
      generated_at: new Date().toISOString(),
      report_date: new Date().toISOString().split('T')[0],
      instruction_for_ai_advisor: 'Review this small store/restobar report. Identify the highest-impact actions for tomorrow and this week. Prioritize restocking, repricing, FIFO/expiry actions, slow-moving removals, and utang/payment risk.',
      live_today: liveData,
      closed_eod: eodData,
      top_10_report: analyticsSignals,
      inventory_watchlists: {
        total_skus: products.length,
        expiring_within_14_days: expiringItems,
        low_stock: lowStockItems,
        fast_moving_replenishment: liveFastMovingPlan,
        fast_moving_capital_needed: sumCapitalNeeded(liveFastMovingPlan),
      },
      utang_watchlist: {
        open_count: utangSummary.openCount,
        open_amount: utangSummary.openAmount,
        due_today_count: utangSummary.dueTodayCount,
        due_today_amount: utangSummary.dueTodayAmount,
        overdue_count: utangSummary.overdueCount,
        overdue_amount: utangSummary.overdueAmount,
      },
      restobar_bills: {
        open_count: billSummary.openCount,
        open_amount: billSummary.openAmount,
        requested_count: billSummary.requestedCount,
        requested_amount: billSummary.requestedAmount,
        open_item_count: billSummary.itemCount,
        oldest_open_age: formatAge(billSummary.oldestCreatedAt),
      },
    };
  }, [analyticsSignals, billSummary, eodData, liveData, liveFastMovingPlan, products, utangSummary]);

  const advisorBriefText = useMemo(() => {
    const lines = [
      'Mhenching Store System - AI Advisor Brief',
      `Generated: ${new Date(advisorPayload.generated_at).toLocaleString('en-PH')}`,
      '',
      'Instruction:',
      advisorPayload.instruction_for_ai_advisor,
      '',
      'Live Today:',
      `- Revenue: ${formatCurrency(advisorPayload.live_today?.totalRevenue || 0)}`,
      `- COGS: ${formatCurrency(advisorPayload.live_today?.totalCOGS || 0)}`,
      `- Net Profit: ${formatCurrency(advisorPayload.live_today?.netProfit || 0)}`,
      `- Transactions: ${advisorPayload.live_today?.totalTransactions || 0} (${advisorPayload.live_today?.openTransactions || 0} open, ${advisorPayload.live_today?.closedTransactions || 0} closed)`,
      '',
      'Closed EOD:',
      `- Revenue: ${formatCurrency(advisorPayload.closed_eod?.totalRevenue || 0)}`,
      `- COGS: ${formatCurrency(advisorPayload.closed_eod?.totalCOGS || 0)}`,
      `- Net Profit: ${formatCurrency(advisorPayload.closed_eod?.netProfit || 0)}`,
      '',
      'Top 10 Report Cards:',
      ...advisorPayload.top_10_report.map((signal, index) => `${index + 1}. ${signal.title}: ${signal.value} - ${signal.detail}`),
      '',
      'Inventory Watchlists:',
      `- Total SKUs: ${advisorPayload.inventory_watchlists.total_skus}`,
      `- Expiring within 14 days: ${advisorPayload.inventory_watchlists.expiring_within_14_days.length}`,
      `- Low stock: ${advisorPayload.inventory_watchlists.low_stock.length}`,
      `- Fast-moving replenish capital: ${formatCurrency(advisorPayload.inventory_watchlists.fast_moving_capital_needed)}`,
      ...advisorPayload.inventory_watchlists.fast_moving_replenishment.map((item, index) => `${index + 1}. ${item.name}${item.tier ? ` (${item.tier})` : ''}: sold ${item.soldQty}, stock ${item.currentStock}, suggest buy ${item.suggestedReplenishQty}, capital ${formatCurrency(item.estimatedCapitalNeeded)}, urgency ${getReplenishmentUrgencyLabel(item.urgency)}`),
      '',
      'Utang Watchlist:',
      `- Open balance: ${formatCurrency(advisorPayload.utang_watchlist.open_amount)} from ${advisorPayload.utang_watchlist.open_count} account(s)`,
      `- Due today: ${formatCurrency(advisorPayload.utang_watchlist.due_today_amount)} from ${advisorPayload.utang_watchlist.due_today_count} account(s)`,
      `- Overdue: ${formatCurrency(advisorPayload.utang_watchlist.overdue_amount)} from ${advisorPayload.utang_watchlist.overdue_count} account(s)`,
      '',
      'Restobar Running Bills:',
      `- Open bills: ${advisorPayload.restobar_bills.open_count}`,
      `- Open bill value: ${formatCurrency(advisorPayload.restobar_bills.open_amount)}`,
      `- Bill requested: ${advisorPayload.restobar_bills.requested_count}`,
      `- Oldest open bill age: ${advisorPayload.restobar_bills.oldest_open_age}`,
    ];

    return lines.join('\n');
  }, [advisorPayload]);

  const eodSpreadsheetCsv = useMemo(() => {
    const rows: unknown[][] = [
      ['Mhenching Store System - EOD Spreadsheet Export'],
      ['Report Date', advisorPayload.report_date],
      ['Generated', new Date(advisorPayload.generated_at).toLocaleString('en-PH')],
      [],
      ['Summary Metric', 'Live Today', 'Closed EOD'],
      ['Revenue', advisorPayload.live_today?.totalRevenue || 0, advisorPayload.closed_eod?.totalRevenue || 0],
      ['COGS', advisorPayload.live_today?.totalCOGS || 0, advisorPayload.closed_eod?.totalCOGS || 0],
      ['Net Profit', advisorPayload.live_today?.netProfit || 0, advisorPayload.closed_eod?.netProfit || 0],
      ['Transactions', advisorPayload.live_today?.totalTransactions || 0, advisorPayload.closed_eod?.totalTransactions || 0],
      ['Open Transactions', advisorPayload.live_today?.openTransactions || 0, advisorPayload.closed_eod?.openTransactions || 0],
      ['Closed Transactions', advisorPayload.live_today?.closedTransactions || 0, advisorPayload.closed_eod?.closedTransactions || 0],
      [],
      ['Top 10 Analytics Report'],
      ['Rank', 'Signal', 'Value', 'Detail', 'Severity'],
      ...advisorPayload.top_10_report.map((signal, index) => [
        index + 1,
        signal.title,
        signal.value,
        signal.detail,
        signal.severity,
      ]),
      [],
      ['Live Item Breakdown'],
      ['Item', 'Tier', 'Qty', 'Revenue', 'COGS', 'Profit'],
      ...((advisorPayload.live_today?.itemSales || []).map((item) => [
        item.name,
        item.tier,
        item.qty,
        item.subtotal,
        item.cogs,
        item.grossProfit,
      ])),
      [],
      ['Live Sales By Attendant'],
      ['Attendant', 'Revenue'],
      ...Object.entries(advisorPayload.live_today?.attendantSales || {})
        .sort(([, a], [, b]) => b - a)
        .map(([attendant, total]) => [attendant, total]),
      [],
      ['Inventory Watchlists'],
      ['Metric', 'Value'],
      ['Total SKUs', advisorPayload.inventory_watchlists.total_skus],
      ['Expiring within 14 days', advisorPayload.inventory_watchlists.expiring_within_14_days.length],
      ['Low stock count', advisorPayload.inventory_watchlists.low_stock.length],
      [],
      ['Expiring Within 14 Days'],
      ['Name', 'SKU', 'Stock', 'Batch', 'Expiry Date', 'Days Until Expiry'],
      ...advisorPayload.inventory_watchlists.expiring_within_14_days.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.batch,
        item.expiry_date,
        item.days_until_expiry,
      ]),
      [],
      ['Low Stock'],
      ['Name', 'SKU', 'Stock', 'Reorder Point'],
      ...advisorPayload.inventory_watchlists.low_stock.map((item) => [
        item.name,
        item.sku,
        item.stock,
        item.reorder_point,
      ]),
      [],
      ['Top 10 Fast Moving Replenishment'],
      ['Rank', 'Name', 'Tier', 'SKU', 'Sold Qty', 'Current Stock', 'Reorder Point', 'Suggested Buy Qty', 'Unit Cost', 'Estimated Capital', 'Revenue', 'Gross Profit', 'Coverage Units', 'Urgency'],
      ...advisorPayload.inventory_watchlists.fast_moving_replenishment.map((item, index) => [
        index + 1,
        item.name,
        item.tier,
        item.sku,
        item.soldQty,
        item.currentStock,
        item.reorderPoint,
        item.suggestedReplenishQty,
        item.unitCost,
        item.estimatedCapitalNeeded,
        item.revenue,
        item.grossProfit,
        item.coverageUnits,
        getReplenishmentUrgencyLabel(item.urgency),
      ]),
      ['Total Estimated Capital', '', '', '', '', '', '', '', '', advisorPayload.inventory_watchlists.fast_moving_capital_needed],
      [],
      ['Utang Watchlist'],
      ['Metric', 'Count', 'Amount'],
      ['Open', advisorPayload.utang_watchlist.open_count, advisorPayload.utang_watchlist.open_amount],
      ['Due Today', advisorPayload.utang_watchlist.due_today_count, advisorPayload.utang_watchlist.due_today_amount],
      ['Overdue', advisorPayload.utang_watchlist.overdue_count, advisorPayload.utang_watchlist.overdue_amount],
      [],
      ['Restobar Running Bills'],
      ['Metric', 'Value'],
      ['Open Count', advisorPayload.restobar_bills.open_count],
      ['Open Amount', advisorPayload.restobar_bills.open_amount],
      ['Bill Requested Count', advisorPayload.restobar_bills.requested_count],
      ['Bill Requested Amount', advisorPayload.restobar_bills.requested_amount],
      ['Open Item Count', advisorPayload.restobar_bills.open_item_count],
      ['Oldest Open Age', advisorPayload.restobar_bills.oldest_open_age],
    ];

    return rowsToCsv(rows);
  }, [advisorPayload]);

  const historicalReportText = useMemo(() => (
    historicalReport
      ? buildAggregateTextReport(
        historicalReport,
        getReportPeriodTitle(reportPeriod),
        historicalReportBounds.label,
        historicalFastMovingPlan,
      )
      : ''
  ), [historicalFastMovingPlan, historicalReport, historicalReportBounds.label, reportPeriod]);

  const historicalReportCsv = useMemo(() => {
    if (!historicalReport) return '';

    const rows: unknown[][] = [
      [`Mhenching Store System - ${getReportPeriodTitle(reportPeriod)} Sales Report`],
      ['Period', historicalReportBounds.label],
      ['Generated', new Date().toLocaleString('en-PH')],
      [],
      ['Summary Metric', 'Value'],
      ['Revenue', historicalReport.totalRevenue],
      ['COGS', historicalReport.totalCOGS],
      ['Net Profit', historicalReport.netProfit],
      ['Transactions', historicalReport.totalTransactions],
      ['Open Transactions', historicalReport.openTransactions],
      ['Closed Transactions', historicalReport.closedTransactions],
      [],
      ['Item Breakdown'],
      ['Item', 'Tier', 'Qty', 'Revenue', 'COGS', 'Profit'],
      ...historicalReport.itemSales.map((item) => [
        item.name,
        item.tier,
        item.qty,
        item.subtotal,
        item.cogs,
        item.grossProfit,
      ]),
      [],
      ['Sales By Attendant'],
      ['Attendant', 'Revenue'],
      ...Object.entries(historicalReport.attendantSales)
        .sort(([, a], [, b]) => b - a)
        .map(([attendant, total]) => [attendant, total]),
      [],
      ['Top 10 Fast Moving Replenishment'],
      ['Rank', 'Name', 'Tier', 'SKU', 'Sold Qty', 'Current Stock', 'Reorder Point', 'Suggested Buy Qty', 'Unit Cost', 'Estimated Capital', 'Revenue', 'Gross Profit', 'Coverage Units', 'Urgency'],
      ...historicalFastMovingPlan.map((item, index) => [
        index + 1,
        item.name,
        item.tier,
        item.sku,
        item.soldQty,
        item.currentStock,
        item.reorderPoint,
        item.suggestedReplenishQty,
        item.unitCost,
        item.estimatedCapitalNeeded,
        item.revenue,
        item.grossProfit,
        item.coverageUnits,
        getReplenishmentUrgencyLabel(item.urgency),
      ]),
      ['Total Estimated Capital', '', '', '', '', '', '', '', '', sumCapitalNeeded(historicalFastMovingPlan)],
    ];

    return rowsToCsv(rows);
  }, [historicalFastMovingPlan, historicalReport, historicalReportBounds.label, reportPeriod]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Restore authentication state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = window.localStorage.getItem('mhenching-admin-auth');
      if (isAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Update current admin route path in localStorage when authenticated
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      window.localStorage.setItem('mhenching-last-admin-route', '/admin/');
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === managerPin) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('mhenching-admin-auth', 'true');
        window.localStorage.setItem('mhenching-last-admin-route', '/admin/');
      }
      fetchEODData();
      fetchHistoricalReport();
      fetchProducts();
      fetchUtangLedger();
      fetchAdminBills();
      fetchLivePos();
    } else {
      alert('Incorrect PIN');
    }
  };

  const handleExitAdmin = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mhenching-last-admin-route', '/');
    }
    router.push('/');
  };

  const fetchProducts = useCallback(async () => {
    const productSelect = 'product_id,name,tier,price,barcode,unit_cost,markup_percentage,profit_margin,image_path,current_stock_quantity,pack_multiplier,received_date,expiry_date,batch_number,is_perishable,reorder_point';
    const legacyProductSelect = 'product_id,name,tier,price,barcode,unit_cost,markup_percentage,profit_margin,image_path,current_stock_quantity,pack_multiplier';
    const normalizeProducts = (data: Partial<Product>[] | null) => (data || []).map((product) => ({
      ...product,
      received_date: product.received_date ?? null,
      expiry_date: product.expiry_date ?? null,
      batch_number: product.batch_number ?? null,
      is_perishable: product.is_perishable ?? false,
      reorder_point: product.reorder_point ?? 0,
    })) as Product[];

    const { data, error } = await supabase
      .from('products')
      .select(productSelect)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Product analytics columns are unavailable; falling back to legacy product shape:', error.message);
      const fallback = await supabase
        .from('products')
        .select(legacyProductSelect)
        .order('name', { ascending: true });

      if (fallback.error) {
        console.error('Error fetching products:', fallback.error);
        return;
      }

      setProducts(normalizeProducts(fallback.data as Partial<Product>[]));
      return;
    }

    setProducts(normalizeProducts(data as Partial<Product>[]));
  }, []);

  const fetchUtangLedger = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setUtangLoading(true);
    }

    const { data, error } = await supabase
      .from('accounts_receivable')
      .select('id,customer_name,contact_info,source_transaction_id,total_amount_owed,remaining_balance,due_date,status,notes,created_at,paid_at')
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      const message = error.message || 'Unable to load utang ledger.';
      console.warn('Utang ledger unavailable:', message);
      setUtangError(message);
      setUtangRecords([]);
    } else {
      setUtangError(null);
      setUtangRecords((data || []) as AccountsReceivable[]);
    }

    if (!silent) {
      setUtangLoading(false);
    }
  }, []);

  const fetchAdminBills = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setAdminBillsLoading(true);
    }

    const { data, error } = await supabase
      .from('bill_sessions')
      .select(`
        id,
        table_or_group_name,
        status,
        total_amount,
        attendant_id,
        notes,
        created_at,
        bill_requested_at,
        closed_at,
        bill_items (
          id,
          quantity,
          subtotal,
          voided,
          created_at
        )
      `)
      .in('status', ['open', 'bill_requested', 'partially_paid'])
      .order('created_at', { ascending: false });

    if (error) {
      const message = error.message || 'Unable to load running bills.';
      console.warn('Running bills unavailable:', message);
      setAdminBillsError(message);
      setAdminBillSessions([]);
    } else {
      setAdminBillsError(null);
      setAdminBillSessions((data || []) as AdminBillSession[]);
    }

    if (!silent) {
      setAdminBillsLoading(false);
    }
  }, []);

  const fetchLivePos = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLivePosLoading(true);
    }

    const { startOfDay, endOfDay } = getDayBounds();

    const [cartsResult, transactionsResult] = await Promise.all([
      supabase
        .from('pos_cart_sessions')
        .select(`
          id,
          session_key,
          device_id,
          attendant_id,
          mode,
          bill_session_id,
          status,
          total_amount,
          item_count,
          created_at,
          updated_at,
          pos_cart_items (
            id,
            product_id,
            product_name,
            product_tier,
            quantity,
            price_at_sale,
            subtotal,
            updated_at
          )
        `)
        .eq('status', 'active')
        .gt('item_count', 0)
        .order('updated_at', { ascending: false }),
      supabase
        .from('transactions')
        .select(`
          transaction_id,
          timestamp,
          device_id,
          attendant_id,
          total_amount,
          payment_method,
          closed,
          voided,
          void_reason,
          transaction_items (
            product_id,
            quantity,
            price_at_sale,
            unit_cost_at_sale,
            subtotal,
            voided,
            products (
              name,
              tier
            )
          )
        `)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .order('timestamp', { ascending: false })
        .limit(20),
    ]);

    if (cartsResult.error || transactionsResult.error) {
      const message = cartsResult.error?.message || transactionsResult.error?.message || 'Unable to load live POS monitor.';
      console.warn('Live POS monitor unavailable:', message);
      setLivePosError(message);
      setLivePosCarts([]);
      setRecentTransactions([]);
    } else {
      setLivePosError(null);
      setLivePosCarts((cartsResult.data || []) as AdminPosCartSession[]);
      setRecentTransactions((transactionsResult.data || []) as EODTransaction[]);
    }

    if (!silent) {
      setLivePosLoading(false);
    }
  }, []);

  const scrollToForm = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const element = document.getElementById('product-form-container');
        element?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleStartNewProduct = () => {
    setCurrentProduct(emptyProduct());
    setIsEditingProduct(true);
    scrollToForm();
  };

  const handleEditProduct = (product: Product) => {
    setCurrentProduct(product);
    setIsEditingProduct(true);
    scrollToForm();
  };

  const createProductPayload = (productToUse = currentProduct): ProductPayload | null => {
    const name = (productToUse.name || '').trim();
    const tier = (productToUse.tier || '').trim();
    const barcode = (productToUse.barcode || '').trim() || null;
    const price = parseRequiredNumber(productToUse.price);
    const unitCost = parseOptionalNumber(productToUse.unit_cost);
    const markupPercentage = parseOptionalNumber(productToUse.markup_percentage);
    const stockQuantity = parseRequiredNumber(productToUse.current_stock_quantity);
    const packMultiplier = parseRequiredNumber(productToUse.pack_multiplier);
    const reorderPoint = parseRequiredNumber(productToUse.reorder_point);

    if (!name) {
      alert('Product name is required.');
      return null;
    }

    if (price === null || price < 0) {
      alert('Retail price must be a valid zero-or-higher amount.');
      return null;
    }

    if (unitCost !== null && unitCost < 0) {
      alert('Unit cost must be zero or higher.');
      return null;
    }

    if (markupPercentage !== null && markupPercentage < 0) {
      alert('Markup rate must be zero or higher.');
      return null;
    }

    if (stockQuantity === null || stockQuantity < 0 || !Number.isInteger(stockQuantity)) {
      alert('Stock quantity must be a whole number of zero or higher.');
      return null;
    }

    if (packMultiplier === null || packMultiplier < 1 || !Number.isInteger(packMultiplier)) {
      alert('Pack multiplier must be a whole number of one or higher.');
      return null;
    }

    if (reorderPoint === null || reorderPoint < 0 || !Number.isInteger(reorderPoint)) {
      alert('Reorder point must be a whole number of zero or higher.');
      return null;
    }

    return {
      name,
      tier,
      price,
      barcode,
      unit_cost: unitCost,
      markup_percentage: markupPercentage,
      profit_margin: unitCost !== null && price > 0
        ? roundToFourDecimals(((price - unitCost) / price) * 100)
        : null,
      image_path: productToUse.image_path || null,
      current_stock_quantity: stockQuantity,
      pack_multiplier: packMultiplier,
      received_date: toTimestampOrNull(productToUse.received_date),
      expiry_date: toTimestampOrNull(productToUse.expiry_date),
      batch_number: (productToUse.batch_number || '').trim() || null,
      is_perishable: !!productToUse.is_perishable,
      reorder_point: reorderPoint,
    };
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    let tempProduct = { ...currentProduct };
    if (showRestockHelper && Number(restockQtyInput) > 0) {
      tempProduct.current_stock_quantity = (tempProduct.current_stock_quantity || 0) + restockMetrics.totalUnitsAdded;
      tempProduct.unit_cost = restockMetrics.unitCostNew;
      tempProduct.batch_number = restockBatchNum.trim() || null;
      tempProduct.received_date = new Date().toISOString();
      tempProduct.expiry_date = restockExpiryDate ? new Date(restockExpiryDate).toISOString() : null;

      // Re-calculate margins/markup for the updated values
      const price = tempProduct.price || 0;
      const cost = tempProduct.unit_cost || 0;
      tempProduct.profit_margin = cost !== null && price > 0
        ? roundToFourDecimals(((price - cost) / price) * 100)
        : null;

      if (cost > 0) {
        tempProduct.markup_percentage = roundToTwoDecimals(((price - cost) / cost) * 100);
      }
    }

    const payload = createProductPayload(tempProduct);
    if (!payload) return;

    setSavingProduct(true);
    const isUpdate = !!currentProduct.product_id;

    try {
      const { error } = isUpdate
        ? await supabase
          .from('products')
          .update(payload)
          .eq('product_id', currentProduct.product_id)
        : await supabase
          .from('products')
          .insert(payload);

      if (error) throw error;

      setIsEditingProduct(false);
      setCurrentProduct(emptyProduct());

      // Reset restock helper states
      setRestockQtyInput('');
      setRestockCostInput('');
      setRestockBatchNum('');
      setRestockExpiryDate('');
      setShowRestockHelper(false);

      await fetchProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save product.';
      alert(`Product save failed: ${message}`);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    const { error } = await supabase.from('products').delete().eq('product_id', id);
    if (error) {
      alert('Error deleting product. It might be tied to existing transactions: ' + error.message);
    } else {
      if (currentProduct.product_id === id) {
        setIsEditingProduct(false);
        setCurrentProduct(emptyProduct());
      }
      fetchProducts();
    }
  };

  const fetchEODData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const { startOfDay, endOfDay } = getDayBounds();

      const selectClause = `
        transaction_id,
        attendant_id,
        total_amount,
        closed,
        voided,
        transaction_items (
          product_id,
          quantity,
          unit_cost_at_sale,
          subtotal,
          voided,
          products (
            name,
            tier
          )
        )
      `;

      const liveQuery = supabase
        .from('transactions')
        .select(selectClause)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .or('voided.is.null,voided.eq.false');

      const closedQuery = supabase
        .from('transactions')
        .select(selectClause)
        .eq('closed', true)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .or('voided.is.null,voided.eq.false');

      const [liveResult, closedResult] = await Promise.all([liveQuery, closedQuery]);

      if (liveResult.error) throw liveResult.error;
      if (closedResult.error) throw closedResult.error;

      const liveReport = buildEODReport((liveResult.data || []) as EODTransaction[]);
      const closedReport = buildEODReport((closedResult.data || []) as EODTransaction[]);

      setLiveData(liveReport);
      setEodData(closedReport);
      return closedReport;
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      alert('Failed to load dashboard data');
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const fetchHistoricalReport = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setHistoricalReportLoading(true);
    }
    setHistoricalReportError(null);

    try {
      const selectClause = `
        transaction_id,
        timestamp,
        attendant_id,
        total_amount,
        closed,
        voided,
        transaction_items (
          product_id,
          quantity,
          unit_cost_at_sale,
          subtotal,
          voided,
          products (
            name,
            tier
          )
        )
      `;

      const { data, error } = await supabase
        .from('transactions')
        .select(selectClause)
        .gte('timestamp', historicalReportBounds.startIso)
        .lte('timestamp', historicalReportBounds.endIso)
        .or('voided.is.null,voided.eq.false')
        .order('timestamp', { ascending: true })
        .range(0, 4999);

      if (error) throw error;

      setHistoricalReport(buildEODReport((data || []) as EODTransaction[]));
    } catch (error) {
      const message = getErrorMessage(error, 'Could not load report history.');
      console.error('Historical report load failed:', error);
      setHistoricalReport(null);
      setHistoricalReportError(message);
    } finally {
      if (!silent) {
        setHistoricalReportLoading(false);
      }
    }
  }, [historicalReportBounds.endIso, historicalReportBounds.startIso]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void fetchProducts();
    void fetchEODData();
    void fetchHistoricalReport();
    void fetchUtangLedger();
    void fetchAdminBills();
    void fetchLivePos();

    const inventoryChannel = supabase
      .channel('admin-products-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          void fetchProducts();
          void fetchEODData({ silent: true });
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('Product realtime subscription failed:', status, error);
        }
      });

    const financialChannel = supabase
      .channel('admin-eod-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          void fetchEODData({ silent: true });
          void fetchHistoricalReport({ silent: true });
          void fetchLivePos({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transaction_items' },
        () => {
          void fetchEODData({ silent: true });
          void fetchHistoricalReport({ silent: true });
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('EOD realtime subscription failed:', status, error);
        }
      });

    const utangChannel = supabase
      .channel('admin-utang-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts_receivable' },
        () => {
          void fetchUtangLedger({ silent: true });
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('Utang ledger realtime subscription failed:', status, error);
        }
      });

    const billsChannel = supabase
      .channel('admin-bills-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bill_sessions' },
        () => {
          void fetchAdminBills({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bill_items' },
        () => {
          void fetchAdminBills({ silent: true });
          void fetchProducts();
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('Running bills realtime subscription failed:', status, error);
        }
      });

    const livePosChannel = supabase
      .channel('admin-live-pos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_cart_sessions' },
        () => {
          void fetchLivePos({ silent: true });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_cart_items' },
        () => {
          void fetchLivePos({ silent: true });
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('Live POS realtime subscription failed:', status, error);
        }
      });

    return () => {
      void supabase.removeChannel(inventoryChannel);
      void supabase.removeChannel(financialChannel);
      void supabase.removeChannel(utangChannel);
      void supabase.removeChannel(billsChannel);
      void supabase.removeChannel(livePosChannel);
    };
  }, [fetchAdminBills, fetchEODData, fetchHistoricalReport, fetchLivePos, fetchProducts, fetchUtangLedger, isAuthenticated]);

  const exportEODReport = (report: EODData) => {
    downloadTextFile(
      `eod_report_${getLocalDateKey()}.txt`,
      buildClosedEODTextReport(report),
      'text/plain;charset=utf-8',
    );
  };

  const copyAdvisorBrief = async () => {
    try {
      await navigator.clipboard.writeText(advisorBriefText);
      alert('Advisor brief copied. Paste it to your AI advisor.');
    } catch (error) {
      console.error('Advisor brief copy failed:', error);
      alert('Copy failed. Use Download Text instead.');
    }
  };

  const downloadAdvisorBrief = () => {
    downloadTextFile(
      `advisor_brief_${advisorPayload.report_date}.txt`,
      advisorBriefText,
      'text/plain;charset=utf-8',
    );
  };

  const downloadSpreadsheetCsv = () => {
    downloadTextFile(
      `mhenching_eod_spreadsheet_${advisorPayload.report_date}.csv`,
      eodSpreadsheetCsv,
      'text/csv;charset=utf-8',
    );
  };

  const printAdvisorBrief = () => {
    printTextReport(
      `Mhenching Store System EOD Report - ${advisorPayload.report_date}`,
      advisorBriefText,
    );
  };

  const downloadHistoricalCsv = () => {
    if (!historicalReportCsv) return;

    downloadTextFile(
      `mhenching_${reportPeriod}_sales_${reportAnchorDate}.csv`,
      historicalReportCsv,
      'text/csv;charset=utf-8',
    );
  };

  const downloadHistoricalText = () => {
    if (!historicalReportText) return;

    downloadTextFile(
      `mhenching_${reportPeriod}_sales_${reportAnchorDate}.txt`,
      historicalReportText,
      'text/plain;charset=utf-8',
    );
  };

  const printHistoricalReport = () => {
    if (!historicalReportText) return;

    printTextReport(
      `Mhenching ${getReportPeriodTitle(reportPeriod)} Sales Report - ${historicalReportBounds.label}`,
      historicalReportText,
    );
  };

  const handleCloseDay = async () => {
    if (!confirm("Are you sure you want to close the day? This will lock today's open transactions.")) return;

    try {
      const { startOfDay, endOfDay } = getDayBounds();

      const { error } = await supabase
        .from('transactions')
        .update({ closed: true })
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay)
        .eq('closed', false)
        .or('voided.is.null,voided.eq.false');

      if (error) throw error;

      const latestReport = await fetchEODData();
      alert("Day closed successfully. Today's closed transactions are now included in the EOD report. A text report will download for your records.");

      if (latestReport) {
        exportEODReport(latestReport);
      }
    } catch (err) {
      console.error(err);
      alert('Error closing day');
    }
  };

  const handleVoidTransaction = async (transaction: EODTransaction) => {
    if (transaction.voided) return;

    if (!confirm(`Void transaction ${transaction.transaction_id.slice(0, 8)} and restore its stock?`)) return;

    const pin = requestManagerPin('void this transaction');
    if (!pin) return;

    const reason = window.prompt('Void reason') || null;

    try {
      const { error } = await supabase.rpc('void_transaction', {
        p_transaction_id: transaction.transaction_id,
        p_manager_pin: pin,
        p_void_reason: reason,
        p_voided_by: 'manager',
        p_restore_stock: true,
      });

      if (error) throw error;

      await Promise.all([
        fetchLivePos(),
        fetchEODData(),
        fetchProducts(),
        fetchUtangLedger({ silent: true }),
      ]);
    } catch (error) {
      console.error('Transaction void failed:', error);
      alert(`Unable to void transaction: ${getErrorMessage(error, 'Please try again.')}`);
    }
  };

  const handleMarkUtangPaid = async (record: AccountsReceivable) => {
    if (!confirm(`Mark ${record.customer_name}'s ${formatCurrency(Number(record.remaining_balance) || 0)} balance as paid?`)) return;

    const { error } = await supabase
      .from('accounts_receivable')
      .update({
        remaining_balance: 0,
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (error) {
      alert(`Unable to mark paid: ${error.message}`);
      return;
    }

    await fetchUtangLedger();
  };

  const handleReopenUtang = async (record: AccountsReceivable) => {
    if (!confirm(`Reopen ${record.customer_name}'s utang record?`)) return;

    const dueTime = getDateOnlyTime(record.due_date);
    const reopenedStatus: ArStatus = dueTime !== null && dueTime < getTodayTime() ? 'overdue' : 'pending';

    const { error } = await supabase
      .from('accounts_receivable')
      .update({
        remaining_balance: Number(record.total_amount_owed) || 0,
        status: reopenedStatus,
        paid_at: null,
      })
      .eq('id', record.id);

    if (error) {
      alert(`Unable to reopen utang record: ${error.message}`);
      return;
    }

    await fetchUtangLedger();
  };

  // CSV parsing logic helper (RFC 4180 compliant)
  const parseCSV = (text: string) => {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCsvFile(null);
      setCsvParsedRows([]);
      setCsvParseError(null);
      setCsvImportResult(null);
      return;
    }

    setCsvFile(file);
    setCsvParseError(null);
    setCsvImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          throw new Error('File is empty.');
        }

        const rawRows = parseCSV(text);
        if (rawRows.length < 2) {
          throw new Error('CSV must contain a header row and at least one data row.');
        }

        const headers = rawRows[0].map(h => h.trim().toLowerCase());
        
        // Find index of headers dynamically
        const barcodeIdx = headers.indexOf('barcode');
        const nameIdx = headers.indexOf('name');
        const tierIdx = headers.indexOf('tier');
        const priceIdx = headers.indexOf('price');
        const costIdx = headers.indexOf('unit_cost');
        const stockIdx = headers.indexOf('current_stock_quantity');
        const multIdx = headers.indexOf('pack_multiplier');
        const reorderIdx = headers.indexOf('reorder_point');
        const perishableIdx = headers.indexOf('is_perishable');
        const expiryIdx = headers.indexOf('expiry_date');

        if (nameIdx === -1) {
          throw new Error('CSV must contain a "name" column.');
        }
        if (priceIdx === -1) {
          throw new Error('CSV must contain a "price" column.');
        }

        const parsedData = [];
        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (row.length === 1 && row[0] === '') continue; // skip blank rows

          const barcode = barcodeIdx !== -1 ? row[barcodeIdx]?.trim() || null : null;
          const name = row[nameIdx]?.trim() || '';
          const tier = tierIdx !== -1 ? row[tierIdx]?.trim() || '' : '';
          const priceStr = priceIdx !== -1 ? row[priceIdx]?.trim() || '0' : '0';
          const costStr = costIdx !== -1 ? row[costIdx]?.trim() || '' : '';
          const stockStr = stockIdx !== -1 ? row[stockIdx]?.trim() || '0' : '0';
          const multStr = multIdx !== -1 ? row[multIdx]?.trim() || '1' : '1';
          const reorderStr = reorderIdx !== -1 ? row[reorderIdx]?.trim() || '0' : '0';
          const perishableStr = perishableIdx !== -1 ? row[perishableIdx]?.trim() || 'false' : 'false';
          const expiryStr = expiryIdx !== -1 ? row[expiryIdx]?.trim() || '' : '';

          const price = parseFloat(priceStr);
          const unitCost = costStr ? parseFloat(costStr) : null;
          const stock = parseInt(stockStr, 10);
          const packMultiplier = parseInt(multStr, 10);
          const reorderPoint = parseInt(reorderStr, 10);
          const isPerishable = perishableStr.toLowerCase() === 'true';

          const errors = [];
          if (!name) errors.push('Name is required');
          if (isNaN(price) || price < 0) errors.push('Price must be >= 0');
          if (costStr && (isNaN(unitCost as number) || (unitCost as number) < 0)) errors.push('Unit Cost must be >= 0');
          if (isNaN(stock) || stock < 0) errors.push('Stock count must be an integer >= 0');
          if (isNaN(packMultiplier) || packMultiplier < 1) errors.push('Pack multiplier must be an integer >= 1');
          if (isNaN(reorderPoint) || reorderPoint < 0) errors.push('Reorder point must be an integer >= 0');

          let expiryDate: string | null = null;
          if (expiryStr) {
            const parsedDate = new Date(expiryStr);
            if (!isNaN(parsedDate.getTime())) {
              expiryDate = parsedDate.toISOString();
            } else {
              errors.push('Expiry Date must be a valid date (e.g. YYYY-MM-DD)');
            }
          }

          parsedData.push({
            barcode,
            name,
            tier,
            price: isNaN(price) ? 0 : price,
            unit_cost: unitCost,
            current_stock_quantity: isNaN(stock) ? 0 : stock,
            pack_multiplier: isNaN(packMultiplier) ? 1 : packMultiplier,
            reorder_point: isNaN(reorderPoint) ? 0 : reorderPoint,
            is_perishable: isPerishable,
            expiry_date: expiryDate,
            errors,
            rowNum: i + 1
          });
        }

        setCsvParsedRows(parsedData);
      } catch (err) {
        console.error('CSV Parsing Error:', err);
        setCsvParseError(err instanceof Error ? err.message : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const downloadCSVTemplate = () => {
    const headers = ['item_number', 'barcode', 'name', 'tier', 'price', 'unit_cost', 'current_stock_quantity', 'pack_multiplier', 'reorder_point', 'is_perishable', 'expiry_date'];
    const sampleRow = ['1', '4800016644804', 'Mega Sardines Red', 'Sardines', '30.00', '25.00', '12', '50', '5', 'false', '2027-12-31'];
    // Use standard CSV format with CRLF line breaks
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const encodedUri = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "mhenching_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(encodedUri);
  };

  const handleCSVImport = async () => {
    if (csvParsedRows.length === 0 || csvImporting) return;

    const invalidRows = csvParsedRows.filter(r => r.errors.length > 0);
    if (invalidRows.length > 0) {
      alert(`Please fix validation errors on ${invalidRows.length} rows before importing.`);
      return;
    }

    if (!confirm(`Are you sure you want to import ${csvParsedRows.length} items? This will insert new items and overwrite prices/costs/stocks of items with matching barcodes.`)) return;

    setCsvImporting(true);
    setCsvImportResult(null);

    let successCount = 0;
    let failedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    const errorsList: string[] = [];

    try {
      // 1. Fetch all existing barcodes to decide if we insert or update
      const { data: dbProducts, error: dbErr } = await supabase
        .from('products')
        .select('product_id, barcode');
      
      if (dbErr) throw dbErr;

      const barcodeMap: Record<string, string> = {};
      dbProducts?.forEach((p: any) => {
        if (p.barcode) {
          barcodeMap[p.barcode] = p.product_id;
        }
      });

      // Prepare payloads
      const payloads = csvParsedRows.map(row => {
        const price = row.price || 0;
        const cost = row.unit_cost;
        let markupPercentage: number | null = null;
        let profitMargin: number | null = null;

        if (cost !== null && cost > 0) {
          markupPercentage = roundToTwoDecimals(((price - cost) / cost) * 100);
        }
        if (cost !== null && price > 0) {
          profitMargin = roundToFourDecimals(((price - cost) / price) * 100);
        }

        const payload: any = {
          name: row.name,
          tier: row.tier,
          price: price,
          barcode: row.barcode || null,
          unit_cost: cost,
          markup_percentage: markupPercentage,
          profit_margin: profitMargin,
          current_stock_quantity: row.current_stock_quantity,
          pack_multiplier: row.pack_multiplier,
          reorder_point: row.reorder_point,
          is_perishable: row.is_perishable,
          expiry_date: row.expiry_date,
        };

        // If barcode matches an existing product in DB, update it by assigning its product_id
        if (row.barcode && barcodeMap[row.barcode]) {
          payload.product_id = barcodeMap[row.barcode];
        }
        
        return payload;
      });

      // Upsert in batches of 50 to prevent payload limits and show clean progress
      const batchSize = 50;
      for (let i = 0; i < payloads.length; i += batchSize) {
        const batch = payloads.slice(i, i + batchSize);
        const { error } = await supabase
          .from('products')
          .upsert(batch, { onConflict: 'product_id' }); // upserting by product_id ensures matches update, rest insert!

        if (error) {
          failedCount += batch.length;
          errorsList.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
        } else {
          successCount += batch.length;
          // Count inserted vs updated based on barcode map
          batch.forEach((item: any) => {
            if (item.product_id) {
              updatedCount++;
            } else {
              insertedCount++;
            }
          });
        }
      }

      setCsvImportResult({
        total: csvParsedRows.length,
        success: successCount,
        failed: failedCount,
        inserted: insertedCount,
        updated: updatedCount,
        errors: errorsList,
      });

      // Reload products list
      await fetchProducts();

      if (failedCount === 0) {
        alert(`Successfully processed ${csvParsedRows.length} items! (${insertedCount} new, ${updatedCount} updated)`);
        // Reset file and preview
        setCsvFile(null);
        setCsvParsedRows([]);
      } else {
        alert(`Completed with errors. ${successCount} succeeded, ${failedCount} failed.`);
      }

    } catch (err: any) {
      console.error('Import process failed:', err);
      alert(`Import failed: ${err.message || err}`);
    } finally {
      setCsvImporting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-black">
        <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow-md">
          <h2 className="text-xl font-bold mb-4">Admin Access</h2>
          <input
            type="password"
            placeholder="Enter PIN"
            className="w-full p-2 border rounded mb-4"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      <div className="col-span-1 lg:col-span-12 flex flex-col md:flex-row justify-between items-start md:items-center mb-stack-md gap-stack-md">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background">Management Dashboard</h1>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-on-surface-variant">
            <p className="font-body-md text-body-md">{formatDashboardDate(now)}</p>
            <p className="font-mono-data text-mono-data flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">schedule</span>
              {formatDashboardTime(now)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExitAdmin} className="bg-surface-dim text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center gap-2">
            Back to POS
          </button>
          {activeTab === 'dashboard' && (
            <>
              <button onClick={() => fetchEODData()} className="bg-surface-container text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">refresh</span>
                Refresh
              </button>
              <button onClick={handleCloseDay} className="bg-primary text-on-primary h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-primary-container active:scale-95 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">print</span>
                Close Day & Report
              </button>
            </>
          )}
          {activeTab === 'products' && (
            <button onClick={() => router.push('/admin/capture/')} className="bg-secondary-container text-on-secondary-container h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-secondary hover:text-on-secondary active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">photo_camera</span>
              Mobile Capture
            </button>
          )}
          {activeTab === 'live_pos' && (
            <button onClick={() => fetchLivePos()} className="bg-surface-container text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">refresh</span>
              Refresh POS
            </button>
          )}
          {activeTab === 'reports' && (
            <button onClick={() => fetchHistoricalReport()} className="bg-surface-container text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">refresh</span>
              Refresh Report
            </button>
          )}
          {activeTab === 'utang' && (
            <button onClick={() => fetchUtangLedger()} className="bg-surface-container text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">refresh</span>
              Refresh Utang
            </button>
          )}
          {activeTab === 'bills' && (
            <button onClick={() => fetchAdminBills()} className="bg-surface-container text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container-high active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">refresh</span>
              Refresh Bills
            </button>
          )}
        </div>
      </div>

      <div className="col-span-1 lg:col-span-12 flex gap-4 mb-4 border-b border-surface-variant overflow-x-auto">
        <button
          className={`py-2 px-4 font-label-xl border-b-2 ${activeTab === 'dashboard' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('dashboard')}
        >
          EOD Summary
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'reports' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('reports')}
        >
          Sales Reports
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'live_pos' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('live_pos')}
        >
          Live POS
          {livePosSummary.activeCarts > 0 && (
            <span className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-primary-fixed px-2 py-0.5 text-xs text-on-primary-fixed">
              {livePosSummary.activeCarts}
            </span>
          )}
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('products')}
        >
          Product Management
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'utang' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('utang')}
        >
          Utang Ledger
          {utangSummary.overdueCount + utangSummary.dueTodayCount > 0 && (
            <span className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-error-container px-2 py-0.5 text-xs text-error">
              {utangSummary.overdueCount + utangSummary.dueTodayCount}
            </span>
          )}
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'bills' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('bills')}
        >
          Table Bills
          {billSummary.requestedCount > 0 && (
            <span className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-tertiary-fixed px-2 py-0.5 text-xs text-on-tertiary-fixed">
              {billSummary.requestedCount}
            </span>
          )}
        </button>
        <button
          className={`py-2 px-4 font-label-xl border-b-2 whitespace-nowrap ${activeTab === 'bulk_import' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          onClick={() => setActiveTab('bulk_import')}
        >
          Bulk Import CSV
        </button>
      </div>

      {activeTab === 'reports' && (
        <div className="col-span-1 lg:col-span-12 flex flex-col gap-gutter">
          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-stack-md">
              <div>
                <h2 className="font-label-xl text-label-xl text-on-surface">Daily, Weekly, Monthly Sales Reports</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Access historical aggregate sales anytime. Weekly reports use Monday to Sunday; monthly reports use the full calendar month.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-variant p-1">
                  {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setReportPeriod(period)}
                      className={`h-11 px-3 rounded-lg font-label-md transition-colors ${reportPeriod === period ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
                    >
                      {getReportPeriodTitle(period)}
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-1 font-label-md text-on-surface-variant">
                  Date
                  <input
                    type="date"
                    value={reportAnchorDate}
                    onChange={(event) => setReportAnchorDate(event.target.value || getLocalDateKey())}
                    className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface font-mono-data"
                  />
                </label>
              </div>
            </div>

            <div className="mt-stack-md flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-primary-fixed-dim bg-primary-fixed px-stack-md py-stack-md">
              <div>
                <p className="font-label-md text-on-primary-fixed-variant">Selected Period</p>
                <p className="font-label-xl text-label-xl text-on-primary-fixed">
                  {getReportPeriodTitle(reportPeriod)}: {historicalReportBounds.label}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={printHistoricalReport}
                  disabled={!historicalReport}
                  className="h-10 px-3 rounded-lg bg-primary text-on-primary font-label-md hover:bg-primary-container disabled:opacity-50"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={downloadHistoricalCsv}
                  disabled={!historicalReport}
                  className="h-10 px-3 rounded-lg bg-surface-dim text-on-surface font-label-md hover:bg-surface-container disabled:opacity-50"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={downloadHistoricalText}
                  disabled={!historicalReport}
                  className="h-10 px-3 rounded-lg bg-surface-dim text-on-surface font-label-md hover:bg-surface-container disabled:opacity-50"
                >
                  Text
                </button>
              </div>
            </div>
          </div>

          {historicalReportError ? (
            <div className="bg-error-container/30 border border-error/30 rounded-xl p-stack-lg text-on-surface">
              <h2 className="font-label-xl text-label-xl text-error">Report history failed to load</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">{historicalReportError}</p>
            </div>
          ) : historicalReportLoading ? (
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg text-on-surface">
              Loading {reportPeriod} report...
            </div>
          ) : historicalReport ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-label-md text-on-surface-variant">Gross Revenue</p>
                      <p className="font-display-price text-[28px] text-on-background">{formatCurrency(historicalReport.totalRevenue)}</p>
                    </div>
                    <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">payments</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Compounded for selected period</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-label-md text-on-surface-variant">COGS</p>
                      <p className="font-display-price text-[28px] text-on-background">{formatCurrency(historicalReport.totalCOGS)}</p>
                    </div>
                    <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">shopping_cart</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Historical cost at sale</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-label-md text-on-surface-variant">Net Profit</p>
                      <p className="font-display-price text-[28px] text-on-background">{formatCurrency(historicalReport.netProfit)}</p>
                    </div>
                    <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">trending_up</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Revenue minus COGS</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-label-md text-on-surface-variant">Transactions</p>
                      <p className="font-display-price text-[28px] text-on-background">{historicalReport.totalTransactions}</p>
                    </div>
                    <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">receipt_long</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">
                    {historicalReport.openTransactions} open / {historicalReport.closedTransactions} closed
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
                <div className="lg:col-span-2 bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
                  <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="font-label-xl text-label-xl text-on-surface">Item Sales</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Best sellers and profit contribution for the selected period.</p>
                    </div>
                    <div className="font-mono-data text-mono-data text-on-surface-variant">
                      {historicalReport.itemSales.length} item{historicalReport.itemSales.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[760px]">
                      <thead className="bg-surface-container-highest">
                        <tr>
                          <th className="p-3 font-label-md text-on-surface-variant">Item</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Qty</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Revenue</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">COGS</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-variant">
                        {historicalReport.itemSales.map((item) => (
                          <tr key={item.productId} className="hover:bg-surface-container-low transition-colors">
                            <td className="p-3 font-body-md text-body-md text-on-surface">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{item.qty}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(item.subtotal)}</td>
                            <td className="p-3 font-mono-data text-on-surface-variant text-right">{formatCurrency(item.cogs)}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(item.grossProfit)}</td>
                          </tr>
                        ))}
                        {historicalReport.itemSales.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                              No item sales for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
                  <div className="p-stack-md border-b border-surface-variant bg-surface-container-low">
                    <h2 className="font-label-xl text-label-xl text-on-surface">Sales by Attendant</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">Staff contribution for the selected period.</p>
                  </div>
                  <div className="p-stack-md">
                    {Object.keys(historicalReport.attendantSales).length > 0 ? (
                      <ul className="divide-y divide-surface-variant">
                        {Object.entries(historicalReport.attendantSales)
                          .sort(([, a], [, b]) => b - a)
                          .map(([attendant, total]) => (
                            <li key={attendant} className="py-3 flex items-center justify-between gap-3">
                              <span className="font-body-md text-body-md text-on-surface truncate">{attendant}</span>
                              <span className="font-mono-data text-on-surface whitespace-nowrap">{formatCurrency(total)}</span>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <div className="min-h-40 flex items-center justify-center text-center font-body-md text-body-md text-on-surface-variant">
                        No attendant sales for this period.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
                <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                  <div>
                    <h2 className="font-label-xl text-label-xl text-on-surface">Top 10 Fast Moving + Replenishment Plan</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Uses selected period sales against current inventory to estimate what to replenish and the capital needed.
                    </p>
                  </div>
                  <div className="font-mono-data text-mono-data text-on-surface">
                    Capital: {formatCurrency(sumCapitalNeeded(historicalFastMovingPlan))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead className="bg-surface-container-highest">
                      <tr>
                        <th className="p-3 font-label-md text-on-surface-variant">Item</th>
                        <th className="p-3 font-label-md text-on-surface-variant">SKU</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Sold</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Stock</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Reorder Pt</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Suggest Buy</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Unit Cost</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Capital</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Urgency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant">
                      {historicalFastMovingPlan.map((item) => (
                        <tr key={item.productId} className="hover:bg-surface-container-low transition-colors">
                          <td className="p-3 font-body-md text-body-md text-on-surface">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{item.sku}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{item.soldQty}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{item.currentStock}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant text-right">{item.reorderPoint}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{item.suggestedReplenishQty}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant text-right">{formatCurrency(item.unitCost)}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(item.estimatedCapitalNeeded)}</td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 font-label-md text-xs ${getReplenishmentUrgencyClasses(item.urgency)}`}>
                              {getReplenishmentUrgencyLabel(item.urgency)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {historicalFastMovingPlan.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                            No fast-moving items for this period yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
              Pick a period to load sales history.
            </div>
          )}
        </div>
      )}

      {activeTab === 'live_pos' && (
        <div className="col-span-1 lg:col-span-12 flex flex-col gap-gutter">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Active Carts</p>
                  <p className="font-display-price text-[28px] text-on-background">{livePosSummary.activeCarts}</p>
                </div>
                <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">point_of_sale</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">Attendant carts before checkout</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Pending Cart Value</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatCurrency(livePosSummary.totalAmount)}</p>
                </div>
                <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">payments</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">Not finalized yet</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Pending Items</p>
                  <p className="font-display-price text-[28px] text-on-background">{livePosSummary.itemCount}</p>
                </div>
                <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">shopping_bag</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">Across active carts</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Latest Activity</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatAge(livePosSummary.latestUpdatedAt)}</p>
                </div>
                <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">schedule</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{formatDateTime(livePosSummary.latestUpdatedAt)}</p>
            </div>
          </div>

          {livePosError ? (
            <div className="bg-error-container/30 border border-error/30 rounded-xl p-stack-lg text-on-surface">
              <h2 className="font-label-xl text-label-xl text-error">Live POS monitor is not ready</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                The app could not load `pos_cart_sessions` or recent transaction void fields: {livePosError}
              </p>
            </div>
          ) : livePosLoading ? (
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg text-on-surface">Loading live POS monitor...</div>
          ) : (
            <>
              <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
                <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h2 className="font-label-xl text-label-xl text-on-surface">Attendant Active Carts</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">Items visible here are not finalized sales yet.</p>
                  </div>
                  <div className="font-mono-data text-mono-data text-on-surface-variant">
                    {livePosSummary.activeCarts} cart{livePosSummary.activeCarts === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter p-stack-md">
                  {livePosCarts.map((cart) => {
                    const items = cart.pos_cart_items || [];
                    return (
                      <div key={cart.id} className="rounded-xl border border-surface-variant bg-surface-container-low overflow-hidden">
                        <div className="p-stack-md border-b border-surface-variant flex items-start justify-between gap-3">
                          <div>
                            <p className="font-label-xl text-label-xl text-on-surface">{cart.attendant_id}</p>
                            <p className="font-body-md text-body-md text-on-surface-variant">{cart.device_id} · {cart.mode === 'table_bill' ? 'Table Bill Cart' : 'Quick Sale Cart'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono-data text-on-surface text-lg">{formatCurrency(Number(cart.total_amount) || 0)}</p>
                            <p className="font-mono-data text-xs text-on-surface-variant">{formatAge(cart.updated_at)}</p>
                          </div>
                        </div>

                        <div className="divide-y divide-surface-variant">
                          {items.map((item) => (
                            <div key={item.id} className="p-3 grid grid-cols-[1fr_auto] gap-3">
                              <div>
                                <p className="font-body-md text-body-md text-on-surface">{item.product_name} {item.product_tier ? `(${item.product_tier})` : ''}</p>
                                <p className="font-body-md text-body-md text-on-surface-variant">{item.quantity} x {formatCurrency(Number(item.price_at_sale) || 0)}</p>
                              </div>
                              <p className="font-mono-data text-on-surface">{formatCurrency(Number(item.subtotal) || 0)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {livePosCarts.length === 0 && (
                    <div className="lg:col-span-2 p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                      No active attendant carts right now. They appear when a POS device has items before checkout.
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
                <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h2 className="font-label-xl text-label-xl text-on-surface">Today&apos;s Recent Transactions</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">Manager void restores stock and removes the sale from live/EOD totals.</p>
                  </div>
                  <div className="font-mono-data text-mono-data text-on-surface-variant">
                    {recentTransactions.length} shown
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[980px]">
                    <thead className="bg-surface-container-highest">
                      <tr>
                        <th className="p-3 font-label-md text-on-surface-variant">Time</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Attendant</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Items</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Payment</th>
                        <th className="p-3 font-label-md text-on-surface-variant text-right">Total</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Status</th>
                        <th className="p-3 font-label-md text-on-surface-variant">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant">
                      {recentTransactions.map((transaction) => {
                        const items = transaction.transaction_items || [];
                        return (
                          <tr key={transaction.transaction_id} className={transaction.voided ? 'bg-error-container/20 opacity-70' : 'hover:bg-surface-container-low'}>
                            <td className="p-3 font-mono-data text-on-surface-variant">{formatDateTime(transaction.timestamp)}</td>
                            <td className="p-3">
                              <p className="font-body-md text-body-md text-on-surface">{transaction.attendant_id}</p>
                              <p className="font-mono-data text-xs text-on-surface-variant">{transaction.device_id || '-'}</p>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1">
                                {items.map((item, index) => {
                                  const product = Array.isArray(item.products) ? item.products[0] : item.products;
                                  return (
                                    <p key={`${transaction.transaction_id}-${item.product_id || index}`} className={`font-body-md text-body-md ${item.voided ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                                      {item.quantity} x {product?.name || 'Unknown item'} {product?.tier ? `(${product.tier})` : ''}
                                    </p>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="p-3 font-body-md text-body-md text-on-surface-variant">{transaction.payment_method || '-'}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(Number(transaction.total_amount) || 0)}</td>
                            <td className="p-3">
                              <span className={`inline-flex rounded-full border px-3 py-1 font-label-md text-xs ${transaction.voided ? 'bg-error-container text-error border-error/30' : (transaction.closed ? 'bg-secondary-container text-on-secondary-container border-secondary/30' : 'bg-primary-fixed text-on-primary-fixed border-primary/30')}`}>
                                {transaction.voided ? 'Voided' : (transaction.closed ? 'Closed' : 'Open')}
                              </span>
                              {transaction.void_reason && (
                                <p className="mt-1 font-body-md text-xs text-on-surface-variant">{transaction.void_reason}</p>
                              )}
                            </td>
                            <td className="p-3">
                              {transaction.voided ? (
                                <span className="font-body-md text-body-md text-on-surface-variant">No action</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleVoidTransaction(transaction)}
                                  className="h-9 px-3 rounded bg-error-container text-error font-label-md hover:bg-error hover:text-on-error"
                                >
                                  Void
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {recentTransactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                            No transactions recorded today yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <>
          {loading ? (
            <div className="col-span-1 lg:col-span-12 bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg text-on-surface">Loading live and closed transactions...</div>
          ) : eodData && liveData ? (
            <>
              <div className="col-span-1 lg:col-span-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-primary-fixed border border-primary-fixed-dim rounded-xl px-stack-lg py-stack-md">
                <div>
                  <h2 className="font-label-xl text-label-xl text-on-primary-fixed">Live Same-Day Financial View</h2>
                  <p className="font-body-md text-body-md text-on-primary-fixed-variant">Live totals include open and closed transactions. EOD export remains closed-only. COGS uses each item&apos;s historical <span className="font-mono-data">unit_cost_at_sale</span>.</p>
                </div>
                <div className="font-mono-data text-mono-data text-on-primary-fixed-variant">
                  {liveData.openTransactions} open / {liveData.closedTransactions} closed
                </div>
              </div>

              <div className="col-span-1 lg:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-gutter mb-stack-lg">
                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
                  <div className="flex justify-between items-start mb-stack-md">
                    <h2 className="font-label-xl text-label-xl text-on-surface-variant">Live Gross Revenue</h2>
                    <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">payments</span>
                  </div>
                  <div className="font-display-price text-[28px] md:text-display-price text-on-background">{formatCurrency(liveData.totalRevenue)}</div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Open + closed today</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
                  <div className="flex justify-between items-start mb-stack-md">
                    <h2 className="font-label-xl text-label-xl text-on-surface-variant">Live COGS</h2>
                    <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">shopping_cart</span>
                  </div>
                  <div className="font-display-price text-[28px] md:text-display-price text-on-background">{formatCurrency(liveData.totalCOGS)}</div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Cost captured at sale</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
                  <div className="flex justify-between items-start mb-stack-md">
                    <h2 className="font-label-xl text-label-xl text-on-surface-variant">Live Net Profit</h2>
                    <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">trending_up</span>
                  </div>
                  <div className="font-display-price text-[28px] md:text-display-price text-on-background">{formatCurrency(liveData.netProfit)}</div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">Revenue minus COGS</p>
                </div>

                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
                  <div className="flex justify-between items-start mb-stack-md">
                    <h2 className="font-label-xl text-label-xl text-on-surface-variant">Transactions</h2>
                    <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">receipt_long</span>
                  </div>
                  <div className="font-display-price text-[28px] md:text-display-price text-on-background">{liveData.totalTransactions}</div>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-2">{liveData.openTransactions} open before Close Day</p>
                </div>
              </div>

              <div className="col-span-1 lg:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-gutter mb-stack-lg">
                <div className="bg-surface-container-low border border-surface-variant rounded-xl p-stack-md">
                  <p className="font-label-md text-on-surface-variant">Closed EOD Revenue</p>
                  <p className="font-mono-data text-on-surface text-xl">{formatCurrency(eodData.totalRevenue)}</p>
                </div>
                <div className="bg-surface-container-low border border-surface-variant rounded-xl p-stack-md">
                  <p className="font-label-md text-on-surface-variant">Closed EOD COGS</p>
                  <p className="font-mono-data text-on-surface text-xl">{formatCurrency(eodData.totalCOGS)}</p>
                </div>
                <div className="bg-surface-container-low border border-surface-variant rounded-xl p-stack-md">
                  <p className="font-label-md text-on-surface-variant">Closed EOD Profit</p>
                  <p className="font-mono-data text-on-surface text-xl">{formatCurrency(eodData.netProfit)}</p>
                </div>
                <div className="bg-surface-container-low border border-surface-variant rounded-xl p-stack-md">
                  <p className="font-label-md text-on-surface-variant">Closed Transactions</p>
                  <p className="font-mono-data text-on-surface text-xl">{eodData.totalTransactions}</p>
                </div>
              </div>

              <div className="col-span-1 lg:col-span-12 bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] mb-stack-lg">
                <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h2 className="font-label-xl text-label-xl text-on-surface">Top 10 Analytics Report</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">Printable report, spreadsheet export, and AI advisor brief from today&apos;s sales, inventory, FIFO/expiry, and utang signals.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyAdvisorBrief}
                      className="h-10 px-3 rounded-lg bg-primary text-on-primary font-label-md hover:bg-primary-container"
                    >
                      Copy Advisor Brief
                    </button>
                    <button
                      type="button"
                      onClick={printAdvisorBrief}
                      className="h-10 px-3 rounded-lg bg-surface-dim text-on-surface font-label-md hover:bg-surface-container"
                    >
                      Print / Save PDF
                    </button>
                    <button
                      type="button"
                      onClick={downloadSpreadsheetCsv}
                      className="h-10 px-3 rounded-lg bg-surface-dim text-on-surface font-label-md hover:bg-surface-container"
                    >
                      CSV for Sheets
                    </button>
                    <button
                      type="button"
                      onClick={downloadAdvisorBrief}
                      className="h-10 px-3 rounded-lg bg-surface-dim text-on-surface font-label-md hover:bg-surface-container"
                    >
                      Download Text
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 p-stack-md">
                  {analyticsSignals.map((signal) => (
                    <div key={signal.title} className={`rounded-xl border p-3 ${getAnalyticsSeverityClasses(signal.severity)}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-label-md text-on-surface">{signal.title}</h3>
                        <span className="material-symbols-outlined text-[20px]">{signal.icon}</span>
                      </div>
                      <p className="font-mono-data text-on-surface text-lg leading-tight break-words">{signal.value}</p>
                      <p className="font-body-md text-body-md text-on-surface-variant mt-2">{signal.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-surface-variant">
                  <div className="p-stack-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div>
                      <h3 className="font-label-lg text-label-lg text-on-surface">Top 10 Fast Moving + Replenishment Alert</h3>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        Today&apos;s fastest sellers matched against current stock, reorder point, and estimated buying capital.
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/30 bg-primary-container px-3 py-2 font-mono-data text-mono-data text-on-primary-container">
                      Capital needed: {formatCurrency(sumCapitalNeeded(liveFastMovingPlan))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                      <thead className="bg-surface-container-highest">
                        <tr>
                          <th className="p-3 font-label-md text-on-surface-variant">Item</th>
                          <th className="p-3 font-label-md text-on-surface-variant">SKU</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Sold</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Stock</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Reorder Pt</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Suggest Buy</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Unit Cost</th>
                          <th className="p-3 font-label-md text-on-surface-variant text-right">Capital</th>
                          <th className="p-3 font-label-md text-on-surface-variant">Urgency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-variant">
                        {liveFastMovingPlan.map((item) => (
                          <tr key={item.productId} className="hover:bg-surface-container-low transition-colors">
                            <td className="p-3 font-body-md text-body-md text-on-surface">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                            <td className="p-3 font-mono-data text-on-surface-variant">{item.sku}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{item.soldQty}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{item.currentStock}</td>
                            <td className="p-3 font-mono-data text-on-surface-variant text-right">{item.reorderPoint}</td>
                            <td className="p-3 font-mono-data text-on-surface font-semibold text-right">{item.suggestedReplenishQty}</td>
                            <td className="p-3 font-mono-data text-on-surface-variant text-right">{formatCurrency(item.unitCost)}</td>
                            <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(item.estimatedCapitalNeeded)}</td>
                            <td className="p-3">
                              <span className={`inline-flex rounded-full border px-3 py-1 font-label-md text-xs ${getReplenishmentUrgencyClasses(item.urgency)}`}>
                                {getReplenishmentUrgencyLabel(item.urgency)}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {liveFastMovingPlan.length === 0 && (
                          <tr>
                            <td colSpan={9} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                              No fast-moving sales yet today. This alert will populate after POS/table-bill sales are recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-gutter">
                <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col h-[500px] lg:col-span-2">
                  <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
                      <h2 className="font-label-xl text-label-xl text-on-surface">Live Item Breakdown</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[720px]">
                      <thead className="bg-surface-container-lowest sticky top-0 z-10 shadow-sm">
                        <tr className="border-b border-surface-variant">
                          <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium">Item Name</th>
                          <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">Qty</th>
                          <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">Revenue</th>
                          <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">COGS</th>
                          <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-variant">
                        {liveData.itemSales.length > 0 ? liveData.itemSales.map((item) => (
                          <tr key={item.productId} className="hover:bg-surface-container-lowest transition-colors group">
                            <td className="p-stack-md font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                            <td className="p-stack-md font-mono-data text-mono-data text-on-surface text-right">{item.qty}</td>
                            <td className="p-stack-md font-mono-data text-mono-data text-on-surface font-medium text-right">{formatCurrency(item.subtotal)}</td>
                            <td className="p-stack-md font-mono-data text-mono-data text-on-surface-variant text-right">{formatCurrency(item.cogs)}</td>
                            <td className="p-stack-md font-mono-data text-mono-data text-on-surface font-medium text-right">{formatCurrency(item.grossProfit)}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={5} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">No live item sales for today.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col gap-gutter h-[500px]">
                  <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col flex-1">
                    <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
                      <h2 className="font-label-xl text-label-xl text-on-surface">Live Sales by Attendant</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-stack-md">
                      {Object.keys(liveData.attendantSales).length > 0 ? (
                        <ul className="divide-y divide-surface-variant">
                          {Object.entries(liveData.attendantSales)
                            .sort(([, a], [, b]) => b - a)
                            .map(([attendant, total]) => (
                              <li key={attendant} className="py-3 flex justify-between">
                                <span className="font-body-md text-body-md text-on-surface">{attendant}</span>
                                <span className="font-mono-data text-mono-data text-on-surface font-medium">{formatCurrency(total)}</span>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <div className="h-full flex items-center justify-center text-center font-body-md text-body-md text-on-surface-variant">
                          No live attendant sales for today.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col p-stack-md justify-center items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
                    <h2 className="font-label-xl text-label-xl text-on-surface">Product Management</h2>
                    <p className="font-body-md text-body-md text-on-surface-variant text-center text-sm">Update prices, stock, and costs.</p>
                    <button onClick={() => setActiveTab('products')} className="mt-2 w-full h-10 bg-primary-container text-on-primary-container rounded-lg font-label-md hover:bg-primary hover:text-on-primary transition-colors">
                      Manage Products
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-1 lg:col-span-12">No data available.</div>
          )}
        </>
      )}

      {activeTab === 'products' && (
        <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm flex flex-col lg:col-span-2">
            <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
              <h2 className="font-label-xl text-on-surface">Inventory ({products.length})</h2>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={handleStartNewProduct}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:bg-primary-container transition-colors"
                >
                  + Add New Item
                </button>
                <button
                  onClick={() => router.push('/admin/capture/')}
                  className="bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-label-md hover:bg-secondary hover:text-on-secondary transition-colors"
                >
                  Camera Capture
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[960px]">
                <thead className="bg-surface-container-highest">
                  <tr>
                    <th className="p-3 font-label-md text-on-surface-variant">Photo</th>
                    <th className="p-3 font-label-md text-on-surface-variant">Name</th>
                    <th className="p-3 font-label-md text-on-surface-variant">SKU/Barcode</th>
                    <th className="p-3 font-label-md text-on-surface-variant text-right">Price</th>
                    <th className="p-3 font-label-md text-on-surface-variant text-right">Cost</th>
                    <th className="p-3 font-label-md text-on-surface-variant text-right">Stock</th>
                    <th className="p-3 font-label-md text-on-surface-variant">Batch</th>
                    <th className="p-3 font-label-md text-on-surface-variant">Expiry</th>
                    <th className="p-3 font-label-md text-on-surface-variant text-right">Markup</th>
                    <th className="p-3 font-label-md text-on-surface-variant">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant">
                  {products.map((product) => (
                    (() => {
                      const imageUrl = getProductImageUrl(product.image_path);

                      return (
                        <tr key={product.product_id} className="hover:bg-surface-container-low transition-colors">
                          <td className="p-3">
                            <div
                              className="h-12 w-12 rounded-lg border border-outline-variant bg-surface-variant bg-cover bg-center flex items-center justify-center text-on-surface-variant"
                              style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
                              aria-label={imageUrl ? `${product.name} product photo` : `${product.name} has no product photo`}
                            >
                              {!imageUrl && <span className="material-symbols-outlined text-[20px]">image</span>}
                            </div>
                          </td>
                          <td className="p-3 font-body-md text-on-surface">{product.name} {product.tier ? `(${product.tier})` : ''}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{product.barcode || '-'}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(Number(product.price) || 0)}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant text-right">{formatCurrency(Number(product.unit_cost) || 0)}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{product.current_stock_quantity}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{product.batch_number || '-'}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{formatDate(product.expiry_date)}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant text-right">{product.markup_percentage ?? 0}%</td>
                          <td className="p-3 flex gap-2">
                            <button onClick={() => handleEditProduct(product)} className="text-secondary hover:text-secondary-container" aria-label={`Edit ${product.name}`}>
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button onClick={() => handleDeleteProduct(product.product_id)} className="text-error hover:text-error-container" aria-label={`Delete ${product.name}`}>
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })()
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">No inventory items yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div id="product-form-container" className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm p-stack-md flex flex-col min-h-[420px]">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-label-xl text-label-xl text-on-surface">{isEditingProduct ? (currentProduct.product_id ? 'Edit Product' : 'Add New Product') : 'Product Form'}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">Custom SKUs like LOMI-BIG and MARL-PCS are saved to the unique barcode field.</p>
              </div>
              {isEditingProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingProduct(false);
                    setCurrentProduct(emptyProduct());
                  }}
                  className="h-9 px-3 rounded bg-surface-dim text-on-surface font-label-md hover:bg-surface-container"
                >
                  Clear
                </button>
              )}
            </div>

            {isEditingProduct ? (
              <form onSubmit={handleSaveProduct} className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                  <div
                    className="h-16 w-16 shrink-0 rounded-lg border border-outline-variant bg-surface-variant bg-cover bg-center flex items-center justify-center text-on-surface-variant"
                    style={currentProductImageUrl ? { backgroundImage: `url(${currentProductImageUrl})` } : undefined}
                  >
                    {!currentProductImageUrl && <span className="material-symbols-outlined">image</span>}
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface">Product photo</p>
                    <p className="font-body-md text-body-md text-on-surface-variant">Use Mobile Admin Capture to scan the barcode and attach or replace the item photo.</p>
                  </div>
                </div>

                <div>
                  <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-name">Item Name *</label>
                  <input
                    id="product-name"
                    required
                    type="text"
                    value={currentProduct.name || ''}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                    className="w-full p-2 border border-outline-variant rounded bg-surface text-on-surface"
                    placeholder="e.g. Lomi"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-tier">Variant / Tier</label>
                  <input
                    id="product-tier"
                    type="text"
                    value={currentProduct.tier || ''}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, tier: e.target.value })}
                    className="w-full p-2 border border-outline-variant rounded bg-surface text-on-surface"
                    placeholder="e.g. Big"
                  />
                </div>

                <div>
                  <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-barcode">SKU / Barcode</label>
                  <input
                    id="product-barcode"
                    type="text"
                    autoCapitalize="characters"
                    value={currentProduct.barcode || ''}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                    className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    placeholder="e.g. LOMI-BIG"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-cost">Unit Cost</label>
                    <input
                      id="product-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentProduct.unit_cost ?? ''}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, unit_cost: parseOptionalNumber(e.target.value) })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-markup">Markup Rate %</label>
                    <input
                      id="product-markup"
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentProduct.markup_percentage ?? ''}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, markup_percentage: parseOptionalNumber(e.target.value) })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-price">Retail Price *</label>
                  <div className="flex gap-2">
                    <input
                      id="product-price"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentProduct.price ?? ''}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, price: parseOptionalNumber(e.target.value) ?? undefined })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                      placeholder="0.00"
                    />
                    {productMetrics.markupPrice !== null && (
                      <button
                        type="button"
                        onClick={() => setCurrentProduct({ ...currentProduct, price: productMetrics.markupPrice || undefined })}
                        className="shrink-0 px-3 rounded bg-secondary-container text-on-secondary-container font-label-md hover:bg-secondary hover:text-on-secondary"
                      >
                        Use {formatCurrency(productMetrics.markupPrice)}
                      </button>
                    )}
                  </div>
                </div>

                {currentProduct.product_id && (
                  <div className="border border-outline-variant rounded-lg bg-surface-container-low p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-label-md text-on-surface font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[18px]">inventory</span>
                        Restock / New Batch Helper
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRestockHelper(!showRestockHelper)}
                        className="text-xs text-primary font-label-md hover:underline"
                      >
                        {showRestockHelper ? "Hide Calculator" : "Use Restock Calculator"}
                      </button>
                    </div>

                    {showRestockHelper && (
                      <div className="flex flex-col gap-3 mt-1 border-t border-outline-variant pt-2">
                        {/* Qty & Unit */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Qty to Add *</label>
                            <input
                              type="number"
                              min="1"
                              value={restockQtyInput}
                              onChange={(e) => setRestockQtyInput(e.target.value)}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface font-mono-data text-on-surface text-sm"
                              placeholder="e.g. 12"
                            />
                          </div>
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Unit Type</label>
                            <select
                              value={restockUnitType}
                              onChange={(e) => setRestockUnitType(e.target.value as 'units' | 'packs')}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface text-on-surface text-sm h-[38px]"
                            >
                              <option value="units">Individual Units</option>
                              <option value="packs">Packs / Boxes ({currentProduct.pack_multiplier || 1}s)</option>
                            </select>
                          </div>
                        </div>

                        {/* Cost & Mode */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Wholesale Cost *</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={restockCostInput}
                              onChange={(e) => setRestockCostInput(e.target.value)}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface font-mono-data text-on-surface text-sm"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Cost Option</label>
                            <select
                              value={restockCostMode}
                              onChange={(e) => setRestockCostMode(e.target.value as 'unit' | 'total')}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface text-on-surface text-sm h-[38px]"
                            >
                              <option value="unit">Cost Per Unit</option>
                              <option value="total">Total Batch Cost</option>
                            </select>
                          </div>
                        </div>

                        {/* Batch & Expiry */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Batch Number</label>
                            <input
                              type="text"
                              value={restockBatchNum}
                              onChange={(e) => setRestockBatchNum(e.target.value)}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface font-mono-data text-on-surface text-sm"
                              placeholder="e.g. 01-06-26"
                            />
                          </div>
                          <div>
                            <label className="block font-label-md text-on-surface-variant mb-1">Expiry Date</label>
                            <input
                              type="date"
                              value={restockExpiryDate}
                              onChange={(e) => setRestockExpiryDate(e.target.value)}
                              className="w-full p-1.5 border border-outline-variant rounded bg-surface font-mono-data text-on-surface text-sm"
                            />
                          </div>
                        </div>

                        {/* Pricing Assistant Comparison Table */}
                        {Number(restockQtyInput) > 0 && (
                          <div className="border border-outline-variant rounded bg-surface-container-lowest p-2 mt-1">
                            <p className="font-label-md text-on-surface font-bold text-xs mb-1.5 text-primary">Pricing Decision Assistant</p>
                            <p className="text-xs text-on-surface-variant mb-2">
                              New cost: <span className="font-bold">{formatCurrency(restockMetrics.unitCostNew)}</span> (Old: {formatCurrency(restockMetrics.oldCost)})
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {/* Option A */}
                              <div className="flex justify-between items-center text-xs p-1.5 rounded hover:bg-surface-variant/50 border border-outline-variant/30">
                                <div className="flex-1 col-span-1">
                                  <p className="font-bold">Keep Old Price</p>
                                  <p className="text-on-surface-variant text-[10px]">Margin: {restockMetrics.optionA.margin.toFixed(1)}% | Profit: {formatCurrency(restockMetrics.optionA.profit)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCurrentProduct({ ...currentProduct, price: restockMetrics.optionA.price })}
                                  className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0"
                                >
                                  Use {formatCurrency(restockMetrics.optionA.price)}
                                </button>
                              </div>

                              {/* Option B */}
                              <div className="flex justify-between items-center text-xs p-1.5 rounded hover:bg-surface-variant/50 border border-outline-variant/30">
                                <div className="flex-1 col-span-1">
                                  <p className="font-bold">Maintain Margin %</p>
                                  <p className="text-on-surface-variant text-[10px]">Margin: {restockMetrics.optionB.margin.toFixed(1)}% | Profit: {formatCurrency(restockMetrics.optionB.profit)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCurrentProduct({ ...currentProduct, price: restockMetrics.optionB.price })}
                                  className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0"
                                >
                                  Use {formatCurrency(restockMetrics.optionB.price)}
                                </button>
                              </div>

                              {/* Option C */}
                              <div className="flex justify-between items-center text-xs p-1.5 rounded hover:bg-surface-variant/50 border border-outline-variant/30">
                                <div className="flex-1 col-span-1">
                                  <p className="font-bold">Maintain Peso Profit</p>
                                  <p className="text-on-surface-variant text-[10px]">Margin: {restockMetrics.optionC.margin.toFixed(1)}% | Profit: {formatCurrency(restockMetrics.optionC.profit)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCurrentProduct({ ...currentProduct, price: restockMetrics.optionC.price })}
                                  className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0"
                                >
                                  Use {formatCurrency(restockMetrics.optionC.price)}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-stock">Stock Quantity</label>
                    <input
                      id="product-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={currentProduct.current_stock_quantity ?? 0}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, current_stock_quantity: parseRequiredNumber(e.target.value) ?? 0 })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-pack-multiplier">Pack Multiplier</label>
                    <input
                      id="product-pack-multiplier"
                      type="number"
                      min="1"
                      step="1"
                      value={currentProduct.pack_multiplier ?? 1}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, pack_multiplier: parseRequiredNumber(e.target.value) ?? 1 })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-received-date">Received Date</label>
                    <input
                      id="product-received-date"
                      type="date"
                      value={toDateInputValue(currentProduct.received_date)}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, received_date: e.target.value })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-expiry-date">Expiry Date</label>
                    <input
                      id="product-expiry-date"
                      type="date"
                      value={toDateInputValue(currentProduct.expiry_date)}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, expiry_date: e.target.value })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-batch-number">Batch Number</label>
                    <input
                      id="product-batch-number"
                      type="text"
                      value={currentProduct.batch_number || ''}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, batch_number: e.target.value })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                      placeholder="e.g. LOMI-2026-06"
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="product-reorder-point">Reorder Point</label>
                    <input
                      id="product-reorder-point"
                      type="number"
                      min="0"
                      step="1"
                      value={currentProduct.reorder_point ?? 0}
                      onChange={(e) => setCurrentProduct({ ...currentProduct, reorder_point: parseRequiredNumber(e.target.value) ?? 0 })}
                      className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface p-3 font-label-md text-on-surface">
                  <input
                    type="checkbox"
                    checked={!!currentProduct.is_perishable}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, is_perishable: e.target.checked })}
                    className="h-5 w-5"
                  />
                  Track as perishable / expiry-sensitive item
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface-container-low rounded-lg p-3">
                  <div>
                    <p className="font-label-md text-on-surface-variant">Projected Unit Profit</p>
                    <p className="font-mono-data text-on-surface">{productMetrics.unitProfit !== null ? formatCurrency(productMetrics.unitProfit) : '-'}</p>
                  </div>
                  <div>
                    <p className="font-label-md text-on-surface-variant">Profit Margin</p>
                    <p className="font-mono-data text-on-surface">{productMetrics.profitMargin !== null ? `${productMetrics.profitMargin}%` : '-'}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProduct(false);
                      setCurrentProduct(emptyProduct());
                    }}
                    className="flex-1 bg-surface-dim text-on-surface p-2 rounded font-label-md hover:bg-surface-variant"
                    disabled={savingProduct}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-on-primary p-2 rounded font-label-md hover:bg-primary-container disabled:opacity-60"
                    disabled={savingProduct}
                  >
                    {savingProduct ? 'Saving...' : 'Save Product'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-stack-lg">
                <span className="material-symbols-outlined text-primary text-5xl">add_box</span>
                <div>
                  <h3 className="font-label-xl text-label-xl text-on-surface">No product selected</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">Add a new SKU or choose an item from the inventory table.</p>
                </div>
                <button
                  onClick={handleStartNewProduct}
                  className="h-touch-target-min px-6 rounded-lg bg-primary text-on-primary font-label-xl hover:bg-primary-container"
                >
                  Add Product
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bills' && (
        <div className="col-span-1 lg:col-span-12 flex flex-col gap-gutter">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Open Bills</p>
                  <p className="font-display-price text-[28px] text-on-background">{billSummary.openCount}</p>
                </div>
                <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">table_bar</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{formatCurrency(billSummary.openAmount)} running total</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Bill Requested</p>
                  <p className="font-display-price text-[28px] text-on-background">{billSummary.requestedCount}</p>
                </div>
                <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">receipt_long</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{formatCurrency(billSummary.requestedAmount)} waiting for settlement</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Confirmed Items</p>
                  <p className="font-display-price text-[28px] text-on-background">{billSummary.itemCount}</p>
                </div>
                <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">room_service</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">Across active bills</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Oldest Age</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatAge(billSummary.oldestCreatedAt)}</p>
                </div>
                <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">timer</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">Oldest open table/group bill</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="font-label-xl text-label-xl text-on-surface">Restobar Running Bills</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">Live management view for open table, group, and customer-tab bills before they settle into final sales.</p>
              </div>
              <div className="font-mono-data text-mono-data text-on-surface-variant">
                {billSummary.openCount} open / {billSummary.requestedCount} requested
              </div>
            </div>

            {adminBillsError ? (
              <div className="p-stack-lg bg-error-container/30 text-on-surface">
                <h3 className="font-label-xl text-label-xl text-error">Running bill tables are not ready yet</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Run `database_restobar_billing_update.sql` in Supabase first. The app could not load `bill_sessions`: {adminBillsError}
                </p>
              </div>
            ) : adminBillsLoading ? (
              <div className="p-stack-lg text-on-surface">Loading running bills...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[960px]">
                  <thead className="bg-surface-container-highest">
                    <tr>
                      <th className="p-3 font-label-md text-on-surface-variant">Table / Group</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Status</th>
                      <th className="p-3 font-label-md text-on-surface-variant text-right">Items</th>
                      <th className="p-3 font-label-md text-on-surface-variant text-right">Amount</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Opened</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Age</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Attendant</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-variant">
                    {adminBillSessions.map((bill) => {
                      const itemCount = (bill.bill_items || []).reduce((sum, item) => sum + (item.voided ? 0 : Number(item.quantity) || 0), 0);
                      const rowTone = bill.status === 'bill_requested' ? 'bg-tertiary-fixed/20' : 'hover:bg-surface-container-low';

                      return (
                        <tr key={bill.id} className={`${rowTone} transition-colors`}>
                          <td className="p-3">
                            <p className="font-body-md text-body-md text-on-surface">{bill.table_or_group_name}</p>
                            <p className="font-mono-data text-xs text-on-surface-variant">{bill.id.slice(0, 8)}</p>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 font-label-md text-xs ${getBillStatusClasses(bill.status)}`}>
                              {getBillStatusLabel(bill.status)}
                            </span>
                          </td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{itemCount}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(Number(bill.total_amount) || 0)}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{formatDate(bill.created_at)}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{formatAge(bill.created_at)}</td>
                          <td className="p-3 font-body-md text-body-md text-on-surface-variant">{bill.attendant_id || '-'}</td>
                          <td className="p-3 font-body-md text-body-md text-on-surface-variant">{bill.notes || '-'}</td>
                        </tr>
                      );
                    })}
                    {adminBillSessions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                          No open running bills. They will appear after an attendant opens a Table Bill from the POS.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'utang' && (
        <div className="col-span-1 lg:col-span-12 flex flex-col gap-gutter">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter">
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Open Utang Balance</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatCurrency(utangSummary.openAmount)}</p>
                </div>
                <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">account_balance_wallet</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{utangSummary.openCount} unpaid account{utangSummary.openCount === 1 ? '' : 's'}</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Due Today</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatCurrency(utangSummary.dueTodayAmount)}</p>
                </div>
                <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">event_available</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{utangSummary.dueTodayCount} reminder{utangSummary.dueTodayCount === 1 ? '' : 's'} for today</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Overdue</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatCurrency(utangSummary.overdueAmount)}</p>
                </div>
                <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">notification_important</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{utangSummary.overdueCount} overdue account{utangSummary.overdueCount === 1 ? '' : 's'}</p>
            </div>

            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label-md text-on-surface-variant">Paid Records</p>
                  <p className="font-display-price text-[28px] text-on-background">{formatCurrency(utangSummary.paidAmount)}</p>
                </div>
                <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">task_alt</span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2">{utangSummary.paidCount} settled account{utangSummary.paidCount === 1 ? '' : 's'}</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-stack-md border-b border-surface-variant bg-surface-container-low flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h2 className="font-label-xl text-label-xl text-on-surface">Accounts Receivable / Utang Ledger</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">Attendant checkouts marked as Utang Ledger appear here with customer name, contact, balance, and promised payment date.</p>
              </div>
              <div className="font-mono-data text-mono-data text-on-surface-variant">
                {utangSummary.openCount} open / {utangSummary.paidCount} paid
              </div>
            </div>

            {utangError ? (
              <div className="p-stack-lg bg-error-container/30 text-on-surface">
                <h3 className="font-label-xl text-label-xl text-error">Utang table is not ready yet</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Run `database_integrated_upgrade.sql` in Supabase first. The app could not load `accounts_receivable`: {utangError}
                </p>
              </div>
            ) : utangLoading ? (
              <div className="p-stack-lg text-on-surface">Loading utang ledger...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[960px]">
                  <thead className="bg-surface-container-highest">
                    <tr>
                      <th className="p-3 font-label-md text-on-surface-variant">Customer</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Contact</th>
                      <th className="p-3 font-label-md text-on-surface-variant text-right">Original Amount</th>
                      <th className="p-3 font-label-md text-on-surface-variant text-right">Remaining</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Promised Date</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Status</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Created</th>
                      <th className="p-3 font-label-md text-on-surface-variant">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-variant">
                    {utangRecords.map((record) => {
                      const effectiveStatus = getEffectiveArStatus(record);
                      const dueTime = getDateOnlyTime(record.due_date);
                      const isDueToday = effectiveStatus !== 'paid' && dueTime === getTodayTime();
                      const rowTone = effectiveStatus === 'overdue'
                        ? 'bg-error-container/20'
                        : (isDueToday ? 'bg-tertiary-fixed/20' : 'hover:bg-surface-container-low');

                      return (
                        <tr key={record.id} className={`${rowTone} transition-colors`}>
                          <td className="p-3">
                            <p className="font-body-md text-body-md text-on-surface">{record.customer_name}</p>
                            <p className="font-mono-data text-xs text-on-surface-variant">{record.source_transaction_id ? `TX ${record.source_transaction_id.slice(0, 8)}` : 'Manual/unknown source'}</p>
                          </td>
                          <td className="p-3 font-body-md text-body-md text-on-surface-variant">{record.contact_info || '-'}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(Number(record.total_amount_owed) || 0)}</td>
                          <td className="p-3 font-mono-data text-on-surface text-right">{formatCurrency(Number(record.remaining_balance) || 0)}</td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{formatDate(record.due_date)}</td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full border px-3 py-1 font-label-md text-xs ${getArStatusClasses(effectiveStatus)}`}>
                              {effectiveStatus === 'overdue' ? 'Overdue' : effectiveStatus === 'paid' ? 'Paid' : (isDueToday ? 'Due Today' : 'Pending')}
                            </span>
                          </td>
                          <td className="p-3 font-mono-data text-on-surface-variant">{formatDate(record.created_at)}</td>
                          <td className="p-3">
                            {effectiveStatus === 'paid' ? (
                              <button
                                type="button"
                                onClick={() => handleReopenUtang(record)}
                                className="h-9 px-3 rounded bg-surface-dim text-on-surface font-label-md hover:bg-surface-container"
                              >
                                Reopen
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkUtangPaid(record)}
                                className="h-9 px-3 rounded bg-primary text-on-primary font-label-md hover:bg-primary-container"
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {utangRecords.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-stack-lg text-center font-body-md text-body-md text-on-surface-variant">
                          No utang records yet. They will appear after a checkout uses Utang Ledger.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bulk_import' && (
        <div className="col-span-1 lg:col-span-12 flex flex-col gap-gutter">
          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-sm">
            <div className="mb-stack-lg">
              <h2 className="font-label-xl text-label-xl text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">publish_file</span>
                Bulk Product Import (CSV)
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Import up to thousands of products into your inventory at once. Prepare your inventory list in Excel or Google Sheets, export it as a CSV file, and upload it here.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter mb-stack-lg">
              {/* Step 1: Template */}
              <div className="border border-surface-variant bg-surface-container-low rounded-xl p-stack-md flex flex-col justify-between">
                <div>
                  <h3 className="font-label-xl text-on-surface mb-1">1. Download Template</h3>
                  <p className="font-body-md text-on-surface-variant text-xs mb-stack-md">
                    Get the standard CSV template. Ensure you keep the column headers exactly as they are in the template so the importer can read your columns correctly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadCSVTemplate}
                  className="h-10 px-4 rounded-lg border border-primary text-primary font-label-md hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 self-start"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Download CSV Template
                </button>
              </div>

              {/* Step 2: Upload */}
              <div className="border border-surface-variant bg-surface-container-low rounded-xl p-stack-md flex flex-col justify-between">
                <div>
                  <h3 className="font-label-xl text-on-surface mb-1">2. Upload your CSV File</h3>
                  <p className="font-body-md text-on-surface-variant text-xs mb-stack-md">
                    Select the `.csv` file exported from Excel or Google Sheets. The system will immediately parse and validate your columns.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md hover:bg-primary-container transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-[20px]">file_upload</span>
                    Choose CSV File
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVFileChange}
                      className="hidden"
                    />
                  </label>
                  {csvFile && (
                    <span className="font-mono-data text-xs text-on-surface truncate max-w-[200px]" title={csvFile.name}>
                      {csvFile.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {csvParseError && (
              <div className="bg-error-container/20 border border-error/30 rounded-xl p-stack-md text-on-surface mb-stack-lg">
                <div className="flex items-center gap-2 text-error mb-1">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span className="font-label-xl">Parsing Failed</span>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant">{csvParseError}</p>
              </div>
            )}

            {/* Success Summary & Import Action */}
            {csvParsedRows.length > 0 && !csvParseError && (
              <div className="border border-surface-variant bg-surface-container-low rounded-xl p-stack-md mb-stack-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-stack-md">
                  <div>
                    <h3 className="font-label-xl text-on-surface mb-1">CSV File Analysis</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="font-body-md text-xs text-on-surface-variant">
                        Total Rows Found: <strong className="text-on-surface">{csvParsedRows.length}</strong>
                      </span>
                      <span className="font-body-md text-xs text-on-surface-variant">
                        Validation Failures: <strong className={csvParsedRows.some(r => r.errors.length > 0) ? "text-error" : "text-primary"}>{csvParsedRows.filter(r => r.errors.length > 0).length}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCSVImport}
                    disabled={csvImporting || csvParsedRows.some(r => r.errors.length > 0)}
                    className="h-12 px-6 rounded-lg bg-primary text-on-primary font-label-xl hover:bg-primary-container disabled:opacity-50 transition-colors flex items-center justify-center gap-2 self-start md:self-auto"
                  >
                    {csvImporting ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[22px]">publish</span>
                        Import {csvParsedRows.length} Products
                      </>
                    )}
                  </button>
                </div>

                {/* Import Results Box */}
                {csvImportResult && (
                  <div className="mt-stack-md p-stack-md bg-surface-container-lowest border border-surface-variant rounded-lg">
                    <h4 className="font-label-xl text-on-surface mb-2">Import completed!</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-stack-md font-mono-data text-xs">
                      <div className="bg-surface-container p-2 rounded">
                        <p className="text-on-surface-variant">Processed</p>
                        <p className="text-lg font-bold text-on-surface">{csvImportResult.total}</p>
                      </div>
                      <div className="bg-primary-container/30 p-2 rounded">
                        <p className="text-primary">New Items</p>
                        <p className="text-lg font-bold text-primary">{csvImportResult.inserted}</p>
                      </div>
                      <div className="bg-secondary-container/30 p-2 rounded">
                        <p className="text-secondary">Updated Items</p>
                        <p className="text-lg font-bold text-secondary">{csvImportResult.updated}</p>
                      </div>
                      <div className="bg-error-container/20 p-2 rounded">
                        <p className="text-error">Failed</p>
                        <p className="text-lg font-bold text-error">{csvImportResult.failed}</p>
                      </div>
                    </div>
                    {csvImportResult.errors.length > 0 && (
                      <div className="mt-stack-md text-xs text-error font-body-md">
                        <p className="font-bold">Errors occurred during bulk write:</p>
                        <ul className="list-disc pl-5 mt-1 font-mono-data">
                          {csvImportResult.errors.map((e, idx) => (
                            <li key={idx}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Rows with Validation Errors */}
                {csvParsedRows.some(r => r.errors.length > 0) && (
                  <div className="mt-stack-md bg-error-container/10 border border-error/20 rounded-lg p-stack-sm">
                    <h4 className="font-label-xl text-error mb-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px]">warning</span>
                      Validation Errors Found: Fix these rows in your CSV first
                    </h4>
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-surface-variant">
                            <th className="p-1 font-bold text-on-surface">Row #</th>
                            <th className="p-1 font-bold text-on-surface">SKU/Barcode</th>
                            <th className="p-1 font-bold text-on-surface">Product Name</th>
                            <th className="p-1 font-bold text-on-surface text-error">Validation Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvParsedRows.filter(r => r.errors.length > 0).map((row, idx) => (
                            <tr key={idx} className="border-b border-surface-variant/40 hover:bg-error-container/5">
                              <td className="p-1 font-mono-data text-on-surface-variant">{row.rowNum}</td>
                              <td className="p-1 font-mono-data text-on-surface-variant">{row.barcode || '-'}</td>
                              <td className="p-1 text-on-surface-variant font-bold">{row.name || '(Blank)'}</td>
                              <td className="p-1 text-error font-bold">{row.errors.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Preview Table of first 15 rows */}
                <div className="mt-stack-md">
                  <h4 className="font-label-xl text-on-surface mb-2">Preview (showing first 15 rows)</h4>
                  <div className="overflow-x-auto border border-surface-variant rounded-lg">
                    <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                      <thead className="bg-surface-container">
                        <tr>
                          <th className="p-2 text-on-surface-variant font-bold">Row</th>
                          <th className="p-2 text-on-surface-variant font-bold">SKU/Barcode</th>
                          <th className="p-2 text-on-surface-variant font-bold">Product Name</th>
                          <th className="p-2 text-on-surface-variant font-bold">Category</th>
                          <th className="p-2 text-on-surface-variant font-bold text-right">Retail Price</th>
                          <th className="p-2 text-on-surface-variant font-bold text-right">Wholesale Cost</th>
                          <th className="p-2 text-on-surface-variant font-bold text-right">Current Stock</th>
                          <th className="p-2 text-on-surface-variant font-bold text-right">Pack Multiplier</th>
                          <th className="p-2 text-on-surface-variant font-bold text-right">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-variant bg-surface-container-lowest">
                        {csvParsedRows.slice(0, 15).map((row, idx) => (
                          <tr key={idx} className={row.errors.length > 0 ? "bg-error-container/10" : "hover:bg-surface-container-low"}>
                            <td className="p-2 font-mono-data text-on-surface-variant">{row.rowNum}</td>
                            <td className="p-2 font-mono-data text-on-surface">{row.barcode || '-'}</td>
                            <td className="p-2 text-on-surface font-bold">{row.name}</td>
                            <td className="p-2 text-on-surface-variant">{row.tier || '-'}</td>
                            <td className="p-2 text-on-surface font-mono-data text-right">₱{row.price.toFixed(2)}</td>
                            <td className="p-2 text-on-surface-variant font-mono-data text-right">
                              {row.unit_cost !== null ? `₱${row.unit_cost.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-on-surface font-mono-data text-right">{row.current_stock_quantity}</td>
                            <td className="p-2 text-on-surface-variant font-mono-data text-right">{row.pack_multiplier}</td>
                            <td className="p-2 text-on-surface-variant font-mono-data text-right">
                              {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      )}
    </main>
  );
}
