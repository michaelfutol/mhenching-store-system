"use client";

import { useEffect, useRef, useState } from 'react';

interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
}

interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  focusProductId: string | null;
}

export default function Cart({ items, onUpdateQuantity, onRemove, onCheckout, focusProductId }: CartProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (focusProductId && inputRefs.current[focusProductId]) {
      inputRefs.current[focusProductId]?.focus();
      // Select the text so they can quickly type a new number over it
      inputRefs.current[focusProductId]?.select();
    }
  }, [focusProductId, items.length]); // trigger on item change too just in case

  if (items.length === 0) {
    return <div className="text-center p-4 text-gray-500">Cart is empty</div>;
  }

  return (
    <div className="flex flex-col flex-grow w-full max-w-md mx-auto relative md:min-h-[600px] pb-32">
        <div className="px-margin-mobile py-stack-lg flex items-center justify-between gap-stack-sm bg-surface-container-lowest border-b border-surface-variant">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight">Current Order <span className="text-on-surface-variant font-normal">({items.length} items)</span></h2>
        </div>

      <div className="px-margin-mobile py-stack-md flex flex-col gap-stack-sm">
        {items.map((item) => (
            <div key={item.product_id} className="flex items-center justify-between p-stack-md bg-surface rounded-xl border border-surface-variant/50 relative">
                <button onClick={() => onRemove(item.product_id)} className="absolute top-2 right-2 text-on-surface-variant hover:bg-surface-dim rounded-full p-1"><span className="material-symbols-outlined text-[18px]">close</span></button>
                <div className="flex items-center gap-stack-md w-full pr-6">
                    <div className="flex flex-col flex-grow">
                        <span className="font-label-xl text-label-xl text-on-surface">{item.name} {item.tier ? `(${item.tier})` : ''}</span>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="number"
                                min="1"
                                className="w-16 p-1 bg-surface-variant border border-surface-variant rounded text-center font-mono-data text-on-surface"
                                value={item.quantity}
                                ref={(el) => {
                                    inputRefs.current[item.product_id] = el;
                                }}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                    onUpdateQuantity(item.product_id, val);
                                    }
                                }}
                            />
                            <span className="font-label-md text-label-md text-on-surface-variant">× ₱{item.price.toFixed(2)}</span>
                        </div>
                    </div>
                    <span className="font-mono-data text-mono-data text-on-surface font-semibold">₱{item.subtotal.toFixed(2)}</span>
                </div>
            </div>
        ))}
      </div>

      <div className="absolute bottom-0 left-0 w-full p-margin-mobile bg-surface-container-lowest/90 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.08)] z-50 pb-safe border-t border-surface-variant/30 flex flex-col gap-2">
            <div className="flex justify-between items-end px-2 mb-2">
                <span className="font-label-xl text-label-xl text-on-surface mb-1">Grand Total</span>
                <span className="font-display-price text-display-price text-on-surface tracking-tighter">₱{total.toFixed(2)}</span>
            </div>
            <button
                onClick={onCheckout}
                className="w-full h-16 bg-secondary text-on-secondary rounded-xl font-label-xl text-label-xl flex items-center justify-center gap-2 hover:bg-secondary/90 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-secondary/20"
            >
                <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>receipt_long</span>
                Proceed / Finalize Sale
            </button>
      </div>
    </div>
  );
}
