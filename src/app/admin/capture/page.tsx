"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Scanner from '@/components/Scanner';
import { supabase } from '@/lib/supabase';
import {
  PRODUCT_IMAGE_BUCKET,
  createProductImagePath,
  getProductImageUrl,
} from '@/lib/productImages';
import { managerPin } from '@/lib/access';

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

type CaptureFormState = {
  product_id: string | null;
  name: string;
  tier: string;
  barcode: string;
  unit_cost: string;
  markup_percentage: string;
  price: string;
  current_stock_quantity: string;
  pack_multiplier: string;
  received_date: string;
  expiry_date: string;
  batch_number: string;
  is_perishable: boolean;
  reorder_point: string;
  image_path: string | null;
};

const PRODUCT_SELECT = 'product_id,name,tier,price,barcode,unit_cost,markup_percentage,profit_margin,image_path,current_stock_quantity,pack_multiplier,received_date,expiry_date,batch_number,is_perishable,reorder_point';
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const emptyForm = (): CaptureFormState => ({
  product_id: null,
  name: '',
  tier: '',
  barcode: '',
  unit_cost: '',
  markup_percentage: '',
  price: '',
  current_stock_quantity: '0',
  pack_multiplier: '1',
  received_date: '',
  expiry_date: '',
  batch_number: '',
  is_perishable: false,
  reorder_point: '0',
  image_path: null,
});

const toFormState = (product: Product): CaptureFormState => ({
  product_id: product.product_id,
  name: product.name || '',
  tier: product.tier || '',
  barcode: product.barcode || '',
  unit_cost: product.unit_cost === null ? '' : String(product.unit_cost),
  markup_percentage: product.markup_percentage === null ? '' : String(product.markup_percentage),
  price: String(product.price),
  current_stock_quantity: String(product.current_stock_quantity ?? 0),
  pack_multiplier: String(product.pack_multiplier || 1),
  received_date: product.received_date ? toDateInputValue(product.received_date) : '',
  expiry_date: product.expiry_date ? toDateInputValue(product.expiry_date) : '',
  batch_number: product.batch_number || '',
  is_perishable: !!product.is_perishable,
  reorder_point: String(product.reorder_point ?? 0),
  image_path: product.image_path || null,
});

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRequiredNumber = (value: string) => {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToTwoDecimals = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const roundToFourDecimals = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

const formatCurrency = (value: number) => currencyFormatter.format(value);

const toDateInputValue = (value: string | null | undefined) => {
  if (!value) return '';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const toTimestampOrNull = (value: string) => {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export default function MobileAdminCapturePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
      window.localStorage.setItem('mhenching-last-admin-route', '/admin/capture/');
    }
  }, [isAuthenticated]);
  const [pin, setPin] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const [form, setForm] = useState<CaptureFormState>(emptyForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Scan or type a SKU to begin.');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showRestockHelper, setShowRestockHelper] = useState(false);
  const [restockQtyInput, setRestockQtyInput] = useState('');
  const [restockUnitType, setRestockUnitType] = useState<'units' | 'packs'>('units');
  const [restockCostInput, setRestockCostInput] = useState('');
  const [restockCostMode, setRestockCostMode] = useState<'unit' | 'total'>('unit');
  const [restockBatchNum, setRestockBatchNum] = useState('');
  const [restockExpiryDate, setRestockExpiryDate] = useState('');

  const existingImageUrl = useMemo(() => getProductImageUrl(form.image_path), [form.image_path]);
  const visibleImageUrl = photoPreviewUrl || existingImageUrl;

  const productMetrics = useMemo(() => {
    const price = parseOptionalNumber(form.price);
    const unitCost = parseOptionalNumber(form.unit_cost);
    const markup = parseOptionalNumber(form.markup_percentage);
    const markupPrice = unitCost !== null && markup !== null
      ? roundToTwoDecimals(unitCost * (1 + markup / 100))
      : null;
    const unitProfit = price !== null && unitCost !== null
      ? roundToTwoDecimals(price - unitCost)
      : null;
    const profitMargin = price !== null && unitCost !== null && price > 0
      ? roundToFourDecimals(((price - unitCost) / price) * 100)
      : null;

    return {
      markupPrice,
      unitProfit,
      profitMargin,
    };
  }, [form.markup_percentage, form.price, form.unit_cost]);

  const restockMetrics = useMemo(() => {
    const qtyAddedRaw = Number(restockQtyInput) || 0;
    const multiplier = restockUnitType === 'packs' ? Number(form.pack_multiplier || 1) : 1;
    const totalUnitsAdded = qtyAddedRaw * multiplier;

    const costRaw = Number(restockCostInput) || 0;
    let unitCostNew = 0;
    if (totalUnitsAdded > 0) {
      unitCostNew = restockCostMode === 'total' ? (costRaw / totalUnitsAdded) : costRaw;
    } else {
      unitCostNew = costRaw;
    }

    // Current metrics before restock
    const oldPrice = Number(form.price) || 0;
    const oldCost = Number(form.unit_cost) || 0;
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
  }, [restockQtyInput, restockUnitType, restockCostInput, restockCostMode, form.pack_multiplier, form.price, form.unit_cost]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();

    if (pin === managerPin) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('mhenching-admin-auth', 'true');
        window.localStorage.setItem('mhenching-last-admin-route', '/admin/capture/');
      }
      setStatusMessage('Scan or type a SKU to begin.');
    } else {
      alert('Incorrect PIN');
    }
  };

  const setField = (field: keyof CaptureFormState, value: string | boolean | null) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const loadProductByBarcode = useCallback(async (barcodeValue: string) => {
    const barcode = barcodeValue.trim();
    if (!barcode) return;

    setIsLookingUp(true);
    setStatusMessage(`Looking up ${barcode}...`);

    try {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('barcode', barcode)
        .limit(1);

      if (error) throw error;

      const existingProduct = (data?.[0] || null) as Product | null;

      if (existingProduct) {
        setForm(toFormState(existingProduct));
        setPhotoFile(null);
        setStatusMessage(`Loaded existing SKU ${barcode}. Updates will edit this product.`);
      } else {
        setForm((current) => ({
          ...current,
          product_id: null,
          barcode,
          image_path: null,
        }));
        setPhotoFile(null);
        setStatusMessage(`New SKU ${barcode} is ready for item details.`);
      }
    } catch (error) {
      console.error('Product lookup failed:', error);
      alert('Product lookup failed. Check the Supabase connection and table grants.');
      setStatusMessage('Lookup failed.');
    } finally {
      setScannerActive(false);
      setIsLookingUp(false);
    }
  }, []);

  const handleScan = useCallback((decodedText: string) => {
    void loadProductByBarcode(decodedText);
  }, [loadProductByBarcode]);

  // Global Barcode Keyboard Listener for Admin Capture screen
  useEffect(() => {
    if (!isAuthenticated) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const delay = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Intercept Enter key
      if (e.key === 'Enter') {
        const cleaned = buffer.trim();
        if (cleaned.length >= 5 && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
          e.preventDefault();
          e.stopPropagation();
          
          const barcode = cleaned;
          buffer = '';
          void loadProductByBarcode(barcode);
        } else {
          buffer = '';
        }
        return;
      }

      // Ignore standard modifier keys
      if (e.key.length !== 1) return;

      // Ignore input if user is typing inside textboxes/inputs not flagged as barcode fields
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      const isBarcodeFieldActive = activeEl && (activeEl.getAttribute('data-barcode-input') === 'true');
      if (isInputActive && !isBarcodeFieldActive) {
        return;
      }

      // Barcode scanners type very rapidly (typically <45ms interval)
      if (delay > 45) {
        buffer = e.key;
      } else {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isAuthenticated, loadProductByBarcode]);


  const buildPayload = (formToUse = form): ProductPayload | null => {
    const name = formToUse.name.trim();
    const tier = formToUse.tier.trim();
    const barcode = formToUse.barcode.trim() || null;
    const price = parseRequiredNumber(formToUse.price);
    let unitCost = parseOptionalNumber(formToUse.unit_cost);
    let markupPercentage = parseOptionalNumber(formToUse.markup_percentage);
    let stock = parseRequiredNumber(formToUse.current_stock_quantity);
    const packMultiplier = parseRequiredNumber(formToUse.pack_multiplier);
    const reorderPoint = parseRequiredNumber(formToUse.reorder_point);
    let receivedDate = toTimestampOrNull(formToUse.received_date);
    let expiryDate = toTimestampOrNull(formToUse.expiry_date);
    let batchNumber = formToUse.batch_number.trim() || null;

    if (showRestockHelper && Number(restockQtyInput) > 0) {
      stock = (stock ?? 0) + restockMetrics.totalUnitsAdded;
      unitCost = restockMetrics.unitCostNew;
      batchNumber = restockBatchNum.trim() || null;
      receivedDate = new Date().toISOString();
      expiryDate = restockExpiryDate ? new Date(restockExpiryDate).toISOString() : null;

      const retailPrice = price || 0;
      if (unitCost !== null && retailPrice > 0) {
        if (unitCost > 0) {
          markupPercentage = roundToTwoDecimals(((retailPrice - unitCost) / unitCost) * 100);
        }
      }
    }

    if (!name) {
      alert('Item name is required.');
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

    if (stock === null || stock < 0 || !Number.isInteger(stock)) {
      alert('Stock count must be a whole number of zero or higher.');
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
      image_path: formToUse.image_path,
      current_stock_quantity: stock,
      pack_multiplier: packMultiplier,
      received_date: receivedDate,
      expiry_date: expiryDate,
      batch_number: batchNumber,
      is_perishable: formToUse.is_perishable,
      reorder_point: reorderPoint,
    };
  };

  const uploadPhotoIfNeeded = async (payload: ProductPayload) => {
    if (!photoFile) return payload.image_path;

    if (!allowedImageTypes.includes(photoFile.type)) {
      throw new Error('Only JPEG, PNG, and WebP product photos are supported.');
    }

    const imagePath = createProductImagePath({
      barcode: payload.barcode,
      name: payload.name,
      fileName: photoFile.name,
    });

    const { error } = await supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .upload(imagePath, photoFile, {
        upsert: true,
        contentType: photoFile.type,
      });

    if (error) {
      throw new Error(`${error.message}. Run database_product_photos_update.sql if the product-images bucket or storage policies are missing.`);
    }

    return imagePath;
  };

  const findExistingProductId = async (barcode: string | null) => {
    if (!barcode) return null;

    const { data, error } = await supabase
      .from('products')
      .select('product_id')
      .eq('barcode', barcode)
      .limit(1);

    if (error) throw error;

    return (data?.[0]?.product_id as string | undefined) || null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;

    setIsSaving(true);
    setStatusMessage('Saving product...');

    try {
      const imagePath = await uploadPhotoIfNeeded(payload);
      const finalPayload = {
        ...payload,
        image_path: imagePath,
      };

      const existingProductId = form.product_id || await findExistingProductId(finalPayload.barcode);
      const response = existingProductId
        ? await supabase
          .from('products')
          .update(finalPayload)
          .eq('product_id', existingProductId)
          .select(PRODUCT_SELECT)
          .single()
        : await supabase
          .from('products')
          .insert(finalPayload)
          .select(PRODUCT_SELECT)
          .single();

      if (response.error) throw response.error;

      const savedProduct = response.data as Product;
      setForm(toFormState(savedProduct));
      setPhotoFile(null);

      // Reset restock helper states
      setRestockQtyInput('');
      setRestockCostInput('');
      setRestockBatchNum('');
      setRestockExpiryDate('');
      setShowRestockHelper(false);

      setStatusMessage(`Saved ${savedProduct.name}${savedProduct.barcode ? ` (${savedProduct.barcode})` : ''}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save product.';
      console.error('Mobile capture save failed:', error);
      alert(`Save failed: ${message}`);
      setStatusMessage('Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewProduct = () => {
    setForm(emptyForm());
    setPhotoFile(null);
    setScannerActive(false);
    setStatusMessage('Scan or type a SKU to begin.');
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-surface-container-low text-on-background flex items-center justify-center p-margin-mobile">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-lg">
          <div className="mb-stack-lg">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-background">Mobile Admin Capture</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">Enter the admin PIN to scan products and attach item photos.</p>
          </div>
          <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="admin-pin">Admin PIN</label>
          <input
            id="admin-pin"
            type="password"
            inputMode="numeric"
            className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data mb-stack-md"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
          <button type="submit" className="w-full h-touch-target-min rounded-lg bg-primary text-on-primary font-label-xl hover:bg-primary-container">
            Unlock Capture
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-container-low text-on-background">
      <div className="mx-auto w-full max-w-md min-h-screen bg-surface-container-lowest flex flex-col shadow-2xl">
        <header className="sticky top-0 z-30 bg-surface-container-highest border-b border-surface-variant px-margin-mobile py-stack-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-background">Item Capture</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">Barcode, photo, cost, markup, stock</p>
            </div>
            <button
              onClick={() => router.push('/admin/')}
              className="h-10 w-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary hover:bg-surface-variant transition-colors"
              aria-label="Back to admin dashboard"
            >
              <span className="material-symbols-outlined">dashboard</span>
            </button>
          </div>
        </header>

        <section className="px-margin-mobile py-stack-md border-b border-surface-variant bg-surface-container-low">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-label-md text-on-surface">SKU / Barcode</p>
              <p className="font-mono-data text-mono-data text-on-surface-variant break-all">{form.barcode || 'No SKU scanned yet'}</p>
            </div>
            <button
              type="button"
              onClick={() => setScannerActive((current) => !current)}
              className="h-touch-target-min px-4 rounded-lg bg-primary text-on-primary font-label-md flex items-center gap-2"
              disabled={isLookingUp}
            >
              <span className="material-symbols-outlined">barcode_scanner</span>
              {scannerActive ? 'Stop' : 'Scan'}
            </button>
          </div>

          {scannerActive && (
            <div className="mt-stack-md rounded-xl overflow-hidden border border-primary-fixed-dim">
              <Scanner onScan={handleScan} />
            </div>
          )}

          <div className="mt-stack-md rounded-lg bg-primary-fixed px-3 py-2 font-body-md text-body-md text-on-primary-fixed-variant">
            {statusMessage}
          </div>
        </section>

        <form onSubmit={handleSave} className="flex-1 px-margin-mobile py-stack-md flex flex-col gap-stack-md">
          <section className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
            <div
              className="h-56 bg-surface-variant bg-cover bg-center flex items-center justify-center text-on-surface-variant"
              style={visibleImageUrl ? { backgroundImage: `url(${visibleImageUrl})` } : undefined}
            >
              {!visibleImageUrl && (
                <div className="text-center">
                  <span className="material-symbols-outlined text-5xl">add_a_photo</span>
                  <p className="font-label-md">No item photo</p>
                </div>
              )}
            </div>
            <div className="p-stack-md flex gap-2">
              <label className="flex-1 h-touch-target-min rounded-lg bg-secondary-container text-on-secondary-container font-label-xl flex items-center justify-center gap-2">
                <span className="material-symbols-outlined">photo_camera</span>
                Take Photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setPhotoFile(file);
                    if (file) setStatusMessage(`Photo ready: ${file.name}`);
                  }}
                />
              </label>
              {visibleImageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFile(null);
                    setForm((current) => ({ ...current, image_path: null }));
                    setStatusMessage('Photo removed from this product form.');
                  }}
                  className="h-touch-target-min w-touch-target-min rounded-lg bg-error-container text-on-error-container flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-stack-md">
            <div>
              <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-barcode">SKU / Barcode</label>
              <div className="flex gap-2">
                <input
                  id="capture-barcode"
                  type="text"
                  autoCapitalize="characters"
                  value={form.barcode}
                  onChange={(event) => setField('barcode', event.target.value)}
                  className="min-w-0 flex-1 h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                  placeholder="LOMI-BIG"
                />
                <button
                  type="button"
                  onClick={() => void loadProductByBarcode(form.barcode)}
                  className="h-12 px-3 rounded-lg bg-surface-container text-on-surface font-label-md"
                  disabled={!form.barcode.trim() || isLookingUp}
                >
                  Lookup
                </button>
              </div>
            </div>

            <div>
              <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-name">Item Name *</label>
              <input
                id="capture-name"
                required
                type="text"
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface"
                placeholder="e.g. Marlboro Red"
              />
            </div>

            <div>
              <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-tier">Variant / Tier</label>
              <input
                id="capture-tier"
                type="text"
                value={form.tier}
                onChange={(event) => setField('tier', event.target.value)}
                className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface"
                placeholder="e.g. Pack, Big, PCS"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-cost">Unit Cost</label>
                <input
                  id="capture-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={(event) => setField('unit_cost', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-markup">Markup %</label>
                <input
                  id="capture-markup"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.markup_percentage}
                  onChange={(event) => setField('markup_percentage', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-price">Retail Price *</label>
              <div className="flex gap-2">
                <input
                  id="capture-price"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setField('price', event.target.value)}
                  className="min-w-0 flex-1 h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                  placeholder="0.00"
                />
                {productMetrics.markupPrice !== null && (
                  <button
                    type="button"
                    onClick={() => setField('price', String(productMetrics.markupPrice))}
                    className="h-12 px-3 rounded-lg bg-secondary-container text-on-secondary-container font-label-md"
                  >
                    Use {formatCurrency(productMetrics.markupPrice)}
                  </button>
                )}
              </div>
            </div>

            {form.product_id && (
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
                          className="w-full h-11 px-3 border border-outline-variant rounded-lg bg-surface font-mono-data text-on-surface text-sm"
                          placeholder="e.g. 12"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-on-surface-variant mb-1">Unit Type</label>
                        <select
                          value={restockUnitType}
                          onChange={(e) => setRestockUnitType(e.target.value as 'units' | 'packs')}
                          className="w-full h-11 px-2 border border-outline-variant rounded-lg bg-surface text-on-surface text-sm"
                        >
                          <option value="units">Individual Units</option>
                          <option value="packs">Packs / Boxes ({form.pack_multiplier || 1}s)</option>
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
                          className="w-full h-11 px-3 border border-outline-variant rounded-lg bg-surface font-mono-data text-on-surface text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-on-surface-variant mb-1">Cost Option</label>
                        <select
                          value={restockCostMode}
                          onChange={(e) => setRestockCostMode(e.target.value as 'unit' | 'total')}
                          className="w-full h-11 px-2 border border-outline-variant rounded-lg bg-surface text-on-surface text-sm"
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
                          className="w-full h-11 px-3 border border-outline-variant rounded-lg bg-surface font-mono-data text-on-surface text-sm"
                          placeholder="e.g. 01-06-26"
                        />
                      </div>
                      <div>
                        <label className="block font-label-md text-on-surface-variant mb-1">Expiry Date</label>
                        <input
                          type="date"
                          value={restockExpiryDate}
                          onChange={(e) => setRestockExpiryDate(e.target.value)}
                          className="w-full h-11 px-3 border border-outline-variant rounded-lg bg-surface font-mono-data text-on-surface text-sm"
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
                              onClick={() => setField('price', String(restockMetrics.optionA.price))}
                              className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0 h-[32px]"
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
                              onClick={() => setField('price', String(restockMetrics.optionB.price))}
                              className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0 h-[32px]"
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
                              onClick={() => setField('price', String(restockMetrics.optionC.price))}
                              className="px-2 py-1 rounded bg-secondary-container text-on-secondary-container font-label-md text-[11px] shrink-0 h-[32px]"
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-stock">Stock Count</label>
                <input
                  id="capture-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.current_stock_quantity}
                  onChange={(event) => setField('current_stock_quantity', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-pack">Pack Multiplier</label>
                <input
                  id="capture-pack"
                  type="number"
                  min="1"
                  step="1"
                  value={form.pack_multiplier}
                  onChange={(event) => setField('pack_multiplier', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-received">Received Date</label>
                <input
                  id="capture-received"
                  type="date"
                  value={form.received_date}
                  onChange={(event) => setField('received_date', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-expiry">Expiry Date</label>
                <input
                  id="capture-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(event) => setField('expiry_date', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-batch">Batch Number</label>
                <input
                  id="capture-batch"
                  type="text"
                  value={form.batch_number}
                  onChange={(event) => setField('batch_number', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                  placeholder="BATCH-001"
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="capture-reorder">Reorder Point</label>
                <input
                  id="capture-reorder"
                  type="number"
                  min="0"
                  step="1"
                  value={form.reorder_point}
                  onChange={(event) => setField('reorder_point', event.target.value)}
                  className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface p-3 font-label-md text-on-surface">
              <input
                type="checkbox"
                checked={form.is_perishable}
                onChange={(event) => setField('is_perishable', event.target.checked)}
                className="h-5 w-5"
              />
              Track as perishable / expiry-sensitive
            </label>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container-low p-3">
              <div>
                <p className="font-label-md text-on-surface-variant">Unit Profit</p>
                <p className="font-mono-data text-mono-data text-on-surface">{productMetrics.unitProfit !== null ? formatCurrency(productMetrics.unitProfit) : '-'}</p>
              </div>
              <div>
                <p className="font-label-md text-on-surface-variant">Margin</p>
                <p className="font-mono-data text-mono-data text-on-surface">{productMetrics.profitMargin !== null ? `${productMetrics.profitMargin}%` : '-'}</p>
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 -mx-margin-mobile mt-auto bg-surface-container-lowest border-t border-surface-variant p-margin-mobile flex gap-2">
            <button
              type="button"
              onClick={handleNewProduct}
              className="h-touch-target-min w-touch-target-min rounded-lg bg-surface-dim text-on-surface flex items-center justify-center"
              aria-label="Start new product"
              disabled={isSaving}
            >
              <span className="material-symbols-outlined">add</span>
            </button>
            <button
              type="submit"
              className="flex-1 h-touch-target-min rounded-lg bg-primary text-on-primary font-label-xl disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : form.product_id ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
