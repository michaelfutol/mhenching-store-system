"use client";

import { useState, useEffect } from 'react';
import Scanner from '@/components/Scanner';
import ProductSearch from '@/components/ProductSearch';
import Cart from '@/components/Cart';
import QuantityModal from '@/components/QuantityModal';
import { supabase } from '@/lib/supabase';

interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
  barcode: string | null;
  pack_multiplier?: number;
}

interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState<Product | null>(null);

  useEffect(() => {
    // Initial fetch
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select('product_id, name, tier, price, barcode, pack_multiplier');

      if (error) {
        console.error('Error fetching products:', error);
      } else {
        setProducts(data || []);
      }
    };

    fetchProducts();

    // Setup Supabase Realtime subscription
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
           console.log('Real-time product update received', payload);
           fetchProducts(); // Simple refetch on any change to keep it perfectly synced
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleProductSelectOrScan = (product: Product) => {
      setSelectedProductForQuantity(product);
  };

  const handleConfirmQuantity = (product: Product, quantityToAdd: number) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.product_id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.product_id
            ? { ...item, quantity: item.quantity + quantityToAdd, subtotal: (item.quantity + quantityToAdd) * item.price }
            : item
        );
      } else {
        return [...prev, { ...product, quantity: quantityToAdd, subtotal: product.price * quantityToAdd }];
      }
    });
  };

  const handleScan = (decodedText: string) => {
    const product = products.find((p: Product) => p.barcode === decodedText);
    if (product) {
      handleProductSelectOrScan(product);
    } else {
      console.warn("Product not found for barcode:", decodedText);
    }
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCartItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, quantity, subtotal: quantity * item.price }
        : item
    ));
    // Clear focus after update so it doesn't get stuck if re-rendered
    setFocusProductId(null);
  };

  const handleRemove = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    setIsCheckoutLoading(true);

    try {
      // In a real app, device_id and attendant_id would come from auth/context
      const payload = {
        p_device_id: "device_01",
        p_attendant_id: "attendant_a",
        p_items: cartItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      };

      const { data, error } = await supabase.rpc('process_checkout', payload);

      if (error) {
          throw error;
      }

      // Success
      alert('Checkout Successful!');
      setCartItems([]);
      setFocusProductId(null);
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Checkout failed. Please try again.');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-surface-container-lowest flex flex-col flex-grow relative shadow-2xl md:my-stack-lg md:rounded-xl md:overflow-hidden md:min-h-[800px] mx-auto min-h-screen">
      <header className="bg-surface-container-highest text-primary font-label-md text-label-md-mobile w-full top-0 flex justify-between items-center px-margin-mobile h-touch-target-min z-40 flat no shadows">
        <span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>monitor_heart</span>
        <span className="font-label-xl text-label-xl-mobile font-bold text-on-surface">Station: #042 | ID: OP-991</span>
        <a href="/admin" className="flex items-center"><span className="material-symbols-outlined text-primary" style={{fontVariationSettings: "'FILL' 1"}}>account_circle</span></a>
      </header>
      <main className="flex-grow flex flex-col relative overflow-y-auto">
        <Scanner onScan={handleScan} />
        <ProductSearch products={products} onSelect={handleProductSelectOrScan} />
        <Cart
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemove={handleRemove}
          onCheckout={handleCheckout}
          focusProductId={focusProductId}
        />
        {isCheckoutLoading && <div className="text-center mt-2 text-on-surface">Processing checkout...</div>}
      </main>

      <QuantityModal
          product={selectedProductForQuantity}
          onClose={() => setSelectedProductForQuantity(null)}
          onConfirm={handleConfirmQuantity}
      />
    </div>
  );
}
