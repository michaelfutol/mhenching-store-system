"use client";

import { useState, useEffect } from 'react';
import Scanner from '@/components/Scanner';
import ProductSearch from '@/components/ProductSearch';
import Cart from '@/components/Cart';
import QuantityModal from '@/components/QuantityModal';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
  const { data: productsData } = useSWR('/api/products', fetcher, { refreshInterval: 5000 }); // Poll every 5s for real-time sync
  const products = productsData?.products || [];

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState<Product | null>(null);

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
        device_id: "device_01",
        attendant_id: "attendant_a",
        items: cartItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      };

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Checkout failed");

      // Success
      alert('Checkout Successful!');
      setCartItems([]);
      setFocusProductId(null);
    } catch (error) {
      console.error(error);
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
