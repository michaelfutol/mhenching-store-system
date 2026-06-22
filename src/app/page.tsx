"use client";

import { useState, useEffect } from 'react';
import Scanner from '@/components/Scanner';
import ProductSearch from '@/components/ProductSearch';
import Cart from '@/components/Cart';

interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
  barcode: string | null;
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

  // Fetch products once on mount for local-first search
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (data.products) setProducts(data.products);
      })
      .catch(err => console.error("Failed to fetch products:", err));
  }, []);

  const handleAddProduct = (product: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.product_id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
            : item
        );
      } else {
        return [...prev, { ...product, quantity: 1, subtotal: product.price }];
      }
    });
    setFocusProductId(product.product_id);
  };

  const handleScan = (decodedText: string) => {
    const product = products.find(p => p.barcode === decodedText);
    if (product) {
      handleAddProduct(product);
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
    <main className="min-h-screen bg-gray-50 text-black flex flex-col items-center p-4 sm:p-8">
      <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">Mhenching POS</h1>

      <div className="w-full max-w-sm">
        <Scanner onScan={handleScan} />
        <ProductSearch products={products} onSelect={handleAddProduct} />
        <Cart
          items={cartItems}
          onUpdateQuantity={handleUpdateQuantity}
          onRemove={handleRemove}
          onCheckout={handleCheckout}
          focusProductId={focusProductId}
        />
        {isCheckoutLoading && <div className="text-center mt-2">Processing checkout...</div>}

        <div className="mt-8 text-center">
            <a href="/admin" className="text-sm text-blue-500 underline">Admin Dashboard</a>
        </div>
      </div>
    </main>
  );
}
