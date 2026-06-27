"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Scanner from '@/components/Scanner';
import ProductSearch from '@/components/ProductSearch';
import Cart from '@/components/Cart';
import QuantityModal from '@/components/QuantityModal';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import {
  createDefaultPaymentDetails,
  getPaymentMethodLabel,
  paymentMethodOptions,
  type PaymentDetails,
  type PaymentMethod,
} from '@/lib/payments';
import {
  clearAttendantSession,
  getLocalDateKey,
  getTodayAttendantSession,
  managerPin,
  saveAttendantSession,
  validateAttendantLogin,
  type AttendantSession,
} from '@/lib/access';
import type {
  Product,
  CartItem,
  PosMode,
  BillStatus,
  BillSession,
  EmbeddedProduct,
  BillItem,
} from '@/types';

// All domain types are imported from '@/types'

const deviceId = 'device_01';
const posSessionStoragePrefix = 'mhenching-pos-live-cart-session-key';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const getLiveCartSessionKey = (currentAttendantId: string) => {
  if (typeof window === 'undefined') return `${deviceId}-${currentAttendantId}`;

  const storageKey = `${posSessionStoragePrefix}-${getLocalDateKey()}-${deviceId}-${currentAttendantId}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const generated = `${deviceId}-${currentAttendantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(storageKey, generated);
  return generated;
};

const requestManagerPin = (action: string) => {
  const pin = window.prompt(`Manager PIN required to ${action}.`);

  if (pin === null) return null;

  if (pin !== managerPin) {
    alert('Incorrect manager PIN.');
    return null;
  }

  return pin;
};

const getBillStatusLabel = (status: BillStatus) => {
  if (status === 'bill_requested') return 'Bill Requested';
  if (status === 'partially_paid') return 'Partially Paid';
  if (status === 'paid') return 'Paid';
  if (status === 'voided') return 'Voided';
  return 'Open';
};

export default function Home() {
  const router = useRouter();
  const [attendantSession, setAttendantSession] = useState<AttendantSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [attendantEmailInput, setAttendantEmailInput] = useState('admin');
  const [attendantPasswordInput, setAttendantPasswordInput] = useState('mhenchingadmin');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState<Product | null>(null);
  const [mode, setMode] = useState<PosMode>('quick_sale');
  const [scannerActive, setScannerActive] = useState(false);
  const [liveCartSessionId, setLiveCartSessionId] = useState<string | null>(null);

  const [billSessions, setBillSessions] = useState<BillSession[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [newBillName, setNewBillName] = useState('');
  const [billLoading, setBillLoading] = useState(false);
  const [settlementDetails, setSettlementDetails] = useState<PaymentDetails>(createDefaultPaymentDetails);

  const attendantId = attendantSession?.name || 'unassigned';

  const selectedBill = useMemo(
    () => billSessions.find((session) => session.id === selectedBillId) || null,
    [billSessions, selectedBillId],
  );

  const billItemCount = billItems.reduce((sum, item) => sum + (item.voided ? 0 : Number(item.quantity) || 0), 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('product_id, name, tier, price, barcode, image_path, pack_multiplier')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching products:', error);
      return;
    }

    setProducts(data || []);
  };

  const fetchBillSessions = async () => {
    const { data, error } = await supabase
      .from('bill_sessions')
      .select('id,table_or_group_name,status,total_amount,attendant_id,notes,created_at,bill_requested_at,closed_at')
      .in('status', ['open', 'bill_requested', 'partially_paid'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bill sessions:', error);
      return;
    }

    const sessions = (data || []) as BillSession[];
    setBillSessions(sessions);

    setSelectedBillId((current) => {
      if (current && sessions.some((session) => session.id === current)) return current;
      return sessions[0]?.id || null;
    });
  };

  const fetchBillItems = async (sessionId: string | null) => {
    if (!sessionId) {
      setBillItems([]);
      return;
    }

    const { data, error } = await supabase
      .from('bill_items')
      .select(`
        id,
        session_id,
        product_id,
        quantity,
        price_at_sale,
        unit_cost_at_sale,
        subtotal,
        voided,
        created_at,
        products (
          name,
          tier
        )
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching bill items:', error);
      return;
    }

    setBillItems((data || []) as BillItem[]);
  };

  const ensureLiveCartSession = useCallback(async () => {
    if (!attendantSession) return null;

    const sessionKey = getLiveCartSessionKey(attendantId);

    const { data, error } = await supabase
      .from('pos_cart_sessions')
      .upsert(
        {
          session_key: sessionKey,
          device_id: deviceId,
          attendant_id: attendantId,
          mode,
          bill_session_id: selectedBillId,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_key' },
      )
      .select('id')
      .single();

    if (error) {
      console.warn('Live POS cart session unavailable:', error.message);
      return null;
    }

    const sessionId = data?.id as string | undefined;
    if (sessionId) setLiveCartSessionId(sessionId);
    return sessionId || null;
  }, [attendantId, attendantSession, mode, selectedBillId]);

  const syncLiveCart = useCallback(async (sessionId: string, items: CartItem[]) => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

    const { error: deleteError } = await supabase
      .from('pos_cart_items')
      .delete()
      .eq('cart_session_id', sessionId);

    if (deleteError) {
      console.warn('Live POS cart item cleanup failed:', deleteError.message);
      return;
    }

    if (items.length > 0) {
      const rows = items.map((item) => ({
        cart_session_id: sessionId,
        product_id: item.product_id,
        product_name: item.name,
        product_tier: item.tier || '',
        quantity: item.quantity,
        price_at_sale: item.price,
        subtotal: item.subtotal,
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('pos_cart_items')
        .insert(rows);

      if (insertError) {
        console.warn('Live POS cart item sync failed:', insertError.message);
        return;
      }
    }

    const { error: sessionError } = await supabase
      .from('pos_cart_sessions')
      .update({
        mode,
        bill_session_id: selectedBillId,
        status: 'active',
        total_amount: totalAmount,
        item_count: itemCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (sessionError) {
      console.warn('Live POS cart session update failed:', sessionError.message);
    }
  }, [mode, selectedBillId]);

  const handleProductSelectOrScan = useCallback((product: Product) => {
    setSelectedProductForQuantity(product);
  }, []);

  useEffect(() => {
    const currentSession = getTodayAttendantSession();
    setAttendantSession(currentSession);
    if (currentSession) {
      setAttendantEmailInput(currentSession.email);
    }
    setSessionChecked(true);

    const interval = window.setInterval(() => {
      if (!getTodayAttendantSession()) {
        setAttendantSession(null);
        setCartItems([]);
        setLiveCartSessionId(null);
      }
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // Redirect back to admin route if admin auth session is active (safeguard against Capacitor webview restarts)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = window.localStorage.getItem('mhenching-admin-auth');
      const lastRoute = window.localStorage.getItem('mhenching-last-admin-route');
      if (isAuth === 'true' && lastRoute && lastRoute !== '/') {
        router.replace(lastRoute);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!attendantSession) return;

    void fetchProducts();
    void fetchBillSessions();

    const productChannel = supabase
      .channel('pos-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void fetchProducts();
      })
      .subscribe();

    const billChannel = supabase
      .channel('pos-bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_sessions' }, () => {
        void fetchBillSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_items' }, () => {
        void fetchBillItems(selectedBillId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(productChannel);
      void supabase.removeChannel(billChannel);
    };
  }, [attendantSession, selectedBillId]);

  useEffect(() => {
    if (!attendantSession) {
      setBillItems([]);
      return;
    }

    void fetchBillItems(selectedBillId);
  }, [attendantSession, selectedBillId]);

  useEffect(() => {
    if (!attendantSession) return;

    void ensureLiveCartSession();
  }, [attendantSession, ensureLiveCartSession]);

  useEffect(() => {
    if (!attendantSession) return;

    let cancelled = false;

    const sync = async () => {
      const sessionId = liveCartSessionId || await ensureLiveCartSession();
      if (!sessionId || cancelled) return;
      await syncLiveCart(sessionId, cartItems);
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [attendantSession, cartItems, ensureLiveCartSession, liveCartSessionId, syncLiveCart]);

  // Global Barcode Keyboard Listener for POS screen
  useEffect(() => {
    if (!attendantSession) return;

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

          // Look up product by barcode
          const foundProduct = products.find((p) => p.barcode === barcode);
          if (foundProduct) {
            handleProductSelectOrScan(foundProduct);
          } else {
            console.warn('Product not found for barcode scan:', barcode);
            alert(`No product found for barcode: ${barcode}`);
          }
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
  }, [attendantSession, products, handleProductSelectOrScan]);


  const handleAttendantLogin = (event: React.FormEvent) => {
    event.preventDefault();

    const account = validateAttendantLogin(attendantEmailInput, attendantPasswordInput);
    if (!account) {
      setLoginError('Incorrect attendant email or password.');
      return;
    }

    const session = saveAttendantSession(account);
    setAttendantSession(session);
    setAttendantEmailInput(session.email);
    setAttendantPasswordInput('');
    setLoginError(null);

    // If admin account logs in, redirect directly to admin dashboard
    if (account.email === 'admin') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('mhenching-admin-auth', 'true');
        window.localStorage.setItem('mhenching-last-admin-route', '/admin/');
      }
      router.push('/admin/');
    }
  };

  const handleChangeAttendant = async () => {
    if (cartItems.length > 0 && !confirm('Change attendant and clear the current unsaved cart?')) return;

    if (liveCartSessionId) {
      await syncLiveCart(liveCartSessionId, []);

      const { error } = await supabase
        .from('pos_cart_sessions')
        .update({
          status: 'abandoned',
          total_amount: 0,
          item_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liveCartSessionId);

      if (error) {
        console.warn('Live POS cart abandon update failed:', error.message);
      }
    }

    clearAttendantSession();
    setAttendantSession(null);
    setCartItems([]);
    setLiveCartSessionId(null);
    setSettlementDetails(createDefaultPaymentDetails());
    setLoginError(null);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('mhenching-admin-auth');
      window.localStorage.removeItem('mhenching-last-admin-route');
    }
  };

  const setSettlementField = <K extends keyof PaymentDetails>(field: K, value: PaymentDetails[K]) => {
    setSettlementDetails((current) => ({ ...current, [field]: value }));
  };


  const handleConfirmQuantity = (product: Product, quantityToAdd: number) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product_id === product.product_id);
      if (existing) {
        return prev.map((item) => (
          item.product_id === product.product_id
            ? { ...item, quantity: item.quantity + quantityToAdd, subtotal: (item.quantity + quantityToAdd) * item.price }
            : item
        ));
      }

      return [...prev, { ...product, quantity: quantityToAdd, subtotal: product.price * quantityToAdd }];
    });
  };

  const handleScan = useCallback((decodedText: string) => {
    const product = products.find((p: Product) => p.barcode === decodedText);
    if (product) {
      setScannerActive(false);
      handleProductSelectOrScan(product);
    } else {
      console.warn('Product not found for barcode:', decodedText);
      alert(`No product found for barcode/SKU: ${decodedText}`);
    }
  }, [products, handleProductSelectOrScan]);

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCartItems((prev) => prev.map((item) => (
      item.product_id === productId
        ? { ...item, quantity, subtotal: quantity * item.price }
        : item
    )));
    setFocusProductId(null);
  };

  const handleRemove = (productId: string) => {
    const pin = requestManagerPin('remove this cart item');
    if (!pin) return;

    setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const validatePaymentDetails = (paymentDetails: PaymentDetails, total: number) => {
    const amountReceived = paymentDetails.amountReceived.trim() === ''
      ? null
      : Number(paymentDetails.amountReceived);

    if (amountReceived !== null && (!Number.isFinite(amountReceived) || amountReceived < 0)) {
      alert('Payment amount must be zero or higher.');
      return null;
    }

    if (paymentDetails.method !== 'utang_ledger' && amountReceived !== null && amountReceived < total) {
      alert('Amount received is below the order total. Use Utang Ledger for partial or pay-later sales.');
      return null;
    }

    if (paymentDetails.method === 'utang_ledger') {
      if (!paymentDetails.arCustomerName.trim()) {
        alert('Customer name is required for utang ledger checkout.');
        return null;
      }

      if (!paymentDetails.arDueDate) {
        alert('Promised payment date is required for utang ledger checkout.');
        return null;
      }
    }

    return { amountReceived };
  };

  const handleCheckout = async (paymentDetails: PaymentDetails) => {
    if (cartItems.length === 0) return;

    if (mode === 'table_bill') {
      await handleAddCartToBill();
      return;
    }

    const paymentValidation = validatePaymentDetails(paymentDetails, cartTotal);
    if (!paymentValidation) return;

    setIsCheckoutLoading(true);

    try {
      const checkoutItems = cartItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }));

      const payload = {
        p_device_id: deviceId,
        p_attendant_id: attendantId,
        p_items: checkoutItems,
        p_payment_method: paymentDetails.method,
        p_payment_reference: paymentDetails.reference.trim() || null,
        p_amount_received: paymentValidation.amountReceived,
        p_ar_customer_name: paymentDetails.arCustomerName.trim() || null,
        p_ar_contact_info: paymentDetails.arContactInfo.trim() || null,
        p_ar_due_date: paymentDetails.arDueDate || null,
        p_order_channel: 'pos',
      };

      const { error } = await supabase.rpc('process_checkout_with_payment', payload);
      if (error) throw error;

      alert(`Checkout successful. Payment: ${getPaymentMethodLabel(paymentDetails.method)}`);
      setCartItems([]);
      setFocusProductId(null);
    } catch (error) {
      console.error('Checkout error:', error);
      alert(`Checkout failed: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleCreateBill = async () => {
    const tableName = newBillName.trim();
    if (!tableName) {
      alert('Enter a table, group, or customer tab name.');
      return;
    }

    setBillLoading(true);

    try {
      const { data, error } = await supabase.rpc('create_bill_session', {
        p_table_or_group_name: tableName,
        p_attendant_id: attendantId,
        p_notes: null,
      });

      if (error) throw error;

      const sessionId = typeof data === 'object' && data && 'session_id' in data
        ? String(data.session_id)
        : null;

      setNewBillName('');
      await fetchBillSessions();
      if (sessionId) setSelectedBillId(sessionId);
      setMode('table_bill');
    } catch (error) {
      console.error('Create bill error:', error);
      alert(`Could not open bill: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setBillLoading(false);
    }
  };

  const handleAddCartToBill = async () => {
    if (!selectedBill) {
      alert('Open or select a table bill first.');
      return;
    }

    if (cartItems.length === 0) return;

    setIsCheckoutLoading(true);

    try {
      const billPayloadItems = cartItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }));

      const { error } = await supabase.rpc('add_items_to_bill', {
        p_session_id: selectedBill.id,
        p_items: billPayloadItems,
      });

      if (error) throw error;

      alert(`Added ${cartItems.length} cart line${cartItems.length === 1 ? '' : 's'} to ${selectedBill.table_or_group_name}.`);
      setCartItems([]);
      setFocusProductId(null);
      await Promise.all([fetchBillSessions(), fetchBillItems(selectedBill.id), fetchProducts()]);
    } catch (error) {
      console.error('Add to bill error:', error);
      alert(`Could not add to bill: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleRequestBill = async () => {
    if (!selectedBill) return;

    setBillLoading(true);

    try {
      const { error } = await supabase.rpc('request_bill', {
        p_session_id: selectedBill.id,
      });

      if (error) throw error;

      await fetchBillSessions();
      alert(`${selectedBill.table_or_group_name} is marked bill requested.`);
    } catch (error) {
      console.error('Request bill error:', error);
      alert(`Could not request bill: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setBillLoading(false);
    }
  };

  const handleVoidBill = async () => {
    if (!selectedBill) return;
    if (!confirm(`Void ${selectedBill.table_or_group_name} and restore confirmed stock?`)) return;
    const pin = requestManagerPin('void this whole table bill');
    if (!pin) return;

    const reason = window.prompt('Void reason') || null;

    setBillLoading(true);

    try {
      const { error } = await supabase.rpc('void_bill_session_with_pin', {
        p_session_id: selectedBill.id,
        p_manager_pin: pin,
        p_restore_stock: true,
        p_void_reason: reason,
        p_voided_by: attendantId,
      });

      if (error) throw error;

      setSelectedBillId(null);
      await Promise.all([fetchBillSessions(), fetchProducts()]);
    } catch (error) {
      console.error('Void bill error:', error);
      alert(`Could not void bill: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setBillLoading(false);
    }
  };

  const handleVoidBillItem = async (item: BillItem) => {
    if (!selectedBill || item.voided) return;

    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    if (!confirm(`Void ${product?.name || 'this item'} from ${selectedBill.table_or_group_name} and restore stock?`)) return;

    const pin = requestManagerPin('void this bill item');
    if (!pin) return;

    const reason = window.prompt('Void reason') || null;
    setBillLoading(true);

    try {
      const { error } = await supabase.rpc('void_bill_item', {
        p_item_id: item.id,
        p_manager_pin: pin,
        p_void_reason: reason,
        p_voided_by: attendantId,
        p_restore_stock: true,
      });

      if (error) throw error;

      await Promise.all([fetchBillSessions(), fetchBillItems(selectedBill.id), fetchProducts()]);
    } catch (error) {
      console.error('Void bill item error:', error);
      alert(`Could not void item: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setBillLoading(false);
    }
  };

  const handleSettleBill = async () => {
    if (!selectedBill) return;

    const paymentValidation = validatePaymentDetails(settlementDetails, Number(selectedBill.total_amount) || 0);
    if (!paymentValidation) return;

    setBillLoading(true);

    try {
      const { error } = await supabase.rpc('settle_bill_session', {
        p_session_id: selectedBill.id,
        p_device_id: deviceId,
        p_attendant_id: attendantId,
        p_payment_method: settlementDetails.method,
        p_payment_reference: settlementDetails.reference.trim() || null,
        p_amount_received: paymentValidation.amountReceived,
        p_ar_customer_name: settlementDetails.arCustomerName.trim() || null,
        p_ar_contact_info: settlementDetails.arContactInfo.trim() || null,
        p_ar_due_date: settlementDetails.arDueDate || null,
      });

      if (error) throw error;

      alert(`Bill settled for ${selectedBill.table_or_group_name}. Payment: ${getPaymentMethodLabel(settlementDetails.method)}`);
      setSettlementDetails(createDefaultPaymentDetails());
      setSelectedBillId(null);
      await Promise.all([fetchBillSessions(), fetchBillItems(null)]);
    } catch (error) {
      console.error('Settle bill error:', error);
      alert(`Could not settle bill: ${getErrorMessage(error, 'Please try again.')}`);
    } finally {
      setBillLoading(false);
    }
  };

  if (!sessionChecked) {
    return (
      <main className="min-h-screen bg-surface-container-low text-on-background flex items-center justify-center p-margin-mobile">
        <div className="w-full max-w-sm rounded-xl border border-surface-variant bg-surface-container-lowest p-stack-lg text-center shadow-lg">
          <Logo size={48} className="mx-auto" />
          <p className="mt-2 font-label-xl text-label-xl text-on-surface">Opening POS...</p>
        </div>
      </main>
    );
  }

  if (!attendantSession) {
    return (
      <main className="min-h-screen bg-surface-container-low text-on-background flex items-center justify-center p-margin-mobile">
        <form onSubmit={handleAttendantLogin} className="w-full max-w-sm rounded-xl border border-surface-variant bg-surface-container-lowest p-stack-lg shadow-lg">
          <div className="mb-stack-lg text-center">
            <Logo size={56} className="mx-auto" />
            <h1 className="mt-3 font-headline-lg-mobile text-headline-lg-mobile text-on-background">Mhenching Store</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">Sign in to open the POS terminal.</p>
          </div>

          <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="attendant-email">Username or Email</label>
          <input
            id="attendant-email"
            type="text"
            autoComplete="username"
            value={attendantEmailInput}
            onChange={(event) => setAttendantEmailInput(event.target.value)}
            className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface mb-stack-md"
            placeholder="admin"
          />

          <label className="block font-label-md text-on-surface-variant mb-1" htmlFor="attendant-password">Password</label>
          <input
            id="attendant-password"
            type="password"
            autoComplete="current-password"
            value={attendantPasswordInput}
            onChange={(event) => setAttendantPasswordInput(event.target.value)}
            className="w-full h-12 px-3 border border-outline-variant rounded-lg bg-surface text-on-surface font-mono-data text-mono-data"
          />

          {loginError && (
            <div className="mt-stack-md rounded-lg bg-error-container px-3 py-2 font-body-md text-body-md text-error">
              {loginError}
            </div>
          )}

          <button type="submit" className="mt-stack-lg w-full h-touch-target-min rounded-lg bg-primary text-on-primary font-label-xl hover:bg-primary-container">
            Open POS
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface-container-lowest flex flex-col flex-grow relative shadow-2xl md:my-stack-lg md:rounded-xl md:overflow-hidden md:min-h-[800px] mx-auto min-h-screen">
      <header className="bg-surface-container-highest text-primary font-label-md text-label-md w-full top-0 flex justify-between items-center px-margin-mobile h-touch-target-min z-40">
        <Logo size={28} />
        <span className="min-w-0 flex-1 px-2 text-center font-label-xl text-label-xl-mobile font-bold text-on-surface truncate">Mhenching POS | {attendantId}</span>
        <div className="flex items-center gap-1">
          {attendantSession?.email === 'admin' && (
            <button
              type="button"
              onClick={() => router.push('/admin/')}
              className="h-touch-target-min w-touch-target-min flex items-center justify-center rounded-full hover:bg-surface-variant active:bg-outline-variant transition-colors"
              aria-label="Open admin dashboard"
            >
              <span className="material-symbols-outlined text-primary text-[28px]" style={{fontVariationSettings: "'FILL' 1'"}}>account_circle</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleChangeAttendant()}
            className="h-touch-target-min w-touch-target-min flex items-center justify-center rounded-full hover:bg-surface-variant active:bg-outline-variant transition-colors"
            aria-label="Change attendant"
          >
            <span className="material-symbols-outlined text-primary text-[28px]">logout</span>
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col relative overflow-y-auto">
        <div className="px-margin-mobile pt-stack-md">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-variant p-1">
            <button
              type="button"
              onClick={() => setMode('quick_sale')}
              className={`h-11 rounded-lg font-label-md transition-colors ${mode === 'quick_sale' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
            >
              Quick Sale
            </button>
            <button
              type="button"
              onClick={() => setMode('table_bill')}
              className={`h-11 rounded-lg font-label-md transition-colors ${mode === 'table_bill' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
            >
              Table Bill
            </button>
          </div>
        </div>

        {mode === 'table_bill' && (
          <section className="mx-margin-mobile mt-stack-md rounded-xl border border-surface-variant bg-surface-container-low p-stack-md flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-label-xl text-label-xl text-on-surface">Running Bills</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">{billSessions.length} open table/group bill{billSessions.length === 1 ? '' : 's'}</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchBillSessions()}
                className="h-10 w-10 rounded-lg bg-surface text-on-surface flex items-center justify-center"
                aria-label="Refresh running bills"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="text"
                value={newBillName}
                onChange={(event) => setNewBillName(event.target.value)}
                placeholder="Table 1, Group A, Josh tab"
                className="min-w-0 h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
              />
              <button
                type="button"
                onClick={handleCreateBill}
                disabled={billLoading}
                className="h-11 px-3 rounded-lg bg-primary text-on-primary font-label-md disabled:opacity-60"
              >
                Open
              </button>
            </div>

            {billSessions.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {billSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedBillId(session.id)}
                    className={`shrink-0 min-w-[136px] rounded-xl border px-3 py-2 text-left ${selectedBillId === session.id ? 'border-primary bg-primary-fixed text-on-primary-fixed' : 'border-surface-variant bg-surface text-on-surface'}`}
                  >
                    <span className="block font-label-md truncate">{session.table_or_group_name}</span>
                    <span className="block font-mono-data text-sm">{formatCurrency(Number(session.total_amount) || 0)}</span>
                    <span className="block text-xs text-on-surface-variant">{getBillStatusLabel(session.status)}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedBill ? (
              <div className="rounded-xl bg-surface p-3 border border-surface-variant">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-label-xl text-label-xl text-on-surface">{selectedBill.table_or_group_name}</h3>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {billItemCount} item{billItemCount === 1 ? '' : 's'} · {getBillStatusLabel(selectedBill.status)}
                    </p>
                  </div>
                  <div className="font-mono-data text-on-surface text-lg">{formatCurrency(Number(selectedBill.total_amount) || 0)}</div>
                </div>

                <div className="mt-3 max-h-40 overflow-y-auto divide-y divide-surface-variant">
                  {billItems.length > 0 ? billItems.map((item) => {
                    const product = Array.isArray(item.products) ? item.products[0] : item.products;
                    return (
                      <div key={item.id} className={`py-2 flex items-center justify-between gap-2 ${item.voided ? 'opacity-50' : ''}`}>
                        <div>
                          <p className="font-label-md text-on-surface">{product?.name || 'Unknown item'} {product?.tier ? `(${product.tier})` : ''}</p>
                          <p className="font-body-md text-body-md text-on-surface-variant">{item.quantity} x {formatCurrency(Number(item.price_at_sale) || 0)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-mono-data text-on-surface">{formatCurrency(Number(item.subtotal) || 0)}</p>
                          {!item.voided && (
                            <button
                              type="button"
                              onClick={() => handleVoidBillItem(item)}
                              disabled={billLoading}
                              className="h-8 w-8 rounded-full bg-error-container text-error flex items-center justify-center disabled:opacity-60"
                              aria-label={`Void ${product?.name || 'bill item'}`}
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="py-4 text-center font-body-md text-body-md text-on-surface-variant">No confirmed bill items yet.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleRequestBill}
                    disabled={billLoading || selectedBill.status === 'bill_requested'}
                    className="h-11 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-md disabled:opacity-60"
                  >
                    Request Bill
                  </button>
                  <button
                    type="button"
                    onClick={handleVoidBill}
                    disabled={billLoading}
                    className="h-11 rounded-lg bg-error-container text-error font-label-md disabled:opacity-60"
                  >
                    Void
                  </button>
                </div>

                <div className="mt-3 rounded-xl border border-primary/20 bg-primary-fixed/30 p-3 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-on-surface-variant font-label-md text-label-md">
                      Pay By
                      <select
                        value={settlementDetails.method}
                        onChange={(event) => setSettlementField('method', event.target.value as PaymentMethod)}
                        className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                      >
                        {paymentMethodOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-on-surface-variant font-label-md text-label-md">
                      Amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={settlementDetails.amountReceived}
                        onChange={(event) => setSettlementField('amountReceived', event.target.value)}
                        placeholder={(Number(selectedBill.total_amount) || 0).toFixed(2)}
                        className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface font-mono-data"
                      />
                    </label>
                  </div>

                  {settlementDetails.method !== 'cash' && (
                    <input
                      type="text"
                      value={settlementDetails.reference}
                      onChange={(event) => setSettlementField('reference', event.target.value)}
                      placeholder="Payment reference"
                      className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                    />
                  )}

                  {settlementDetails.method === 'utang_ledger' && (
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={settlementDetails.arCustomerName}
                        onChange={(event) => setSettlementField('arCustomerName', event.target.value)}
                        placeholder="Customer name"
                        className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={settlementDetails.arContactInfo}
                          onChange={(event) => setSettlementField('arContactInfo', event.target.value)}
                          placeholder="Contact"
                          className="h-11 min-w-0 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                        />
                        <input
                          type="date"
                          value={settlementDetails.arDueDate}
                          onChange={(event) => setSettlementField('arDueDate', event.target.value)}
                          className="h-11 min-w-0 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSettleBill}
                    disabled={billLoading || billItems.length === 0}
                    className="h-12 rounded-lg bg-primary text-on-primary font-label-xl disabled:opacity-60"
                  >
                    Settle Table Bill
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-surface p-4 text-center text-on-surface-variant">
                Open a table or group bill before adding orders.
              </div>
            )}
          </section>
        )}

        <section className="px-margin-mobile pt-stack-md">
          <button
            type="button"
            onClick={() => setScannerActive((current) => !current)}
            className={`w-full h-touch-target-min rounded-xl font-label-xl flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all ${scannerActive ? 'bg-error-container text-error' : 'bg-secondary text-on-secondary'}`}
          >
            <span className="material-symbols-outlined">barcode_scanner</span>
            {scannerActive ? 'Close Scanner' : 'Scan Barcode'}
          </button>

          {scannerActive && (
            <div className="mt-stack-md">
              <Scanner active={scannerActive} onScan={handleScan} onClose={() => setScannerActive(false)} />
            </div>
          )}
        </section>

        <ProductSearch products={products} onSelect={handleProductSelectOrScan} />
        <Cart
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemove={handleRemove}
          onCheckout={handleCheckout}
          focusProductId={focusProductId}
          title={mode === 'table_bill' ? 'Items to Add' : 'Current Order'}
          checkoutLabel={mode === 'table_bill' ? `Add to ${selectedBill?.table_or_group_name || 'Table Bill'}` : 'Proceed / Finalize Sale'}
          showPaymentFields={mode === 'quick_sale'}
          disabled={mode === 'table_bill' && !selectedBill}
        />
        {isCheckoutLoading && <div className="text-center mt-2 text-on-surface">Processing...</div>}
      </main>

      <QuantityModal
        product={selectedProductForQuantity}
        onClose={() => setSelectedProductForQuantity(null)}
        onConfirm={handleConfirmQuantity}
      />
    </div>
  );
}
