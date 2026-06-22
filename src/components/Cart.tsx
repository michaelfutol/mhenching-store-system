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
    <div className="w-full max-w-sm mx-auto bg-white p-4 rounded shadow mt-4 text-black">
      <h2 className="text-lg font-bold mb-4">Current Order</h2>
      <ul className="divide-y divide-gray-200">
        {items.map((item) => (
          <li key={item.product_id} className="py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">{item.name} {item.tier ? `(${item.tier})` : ''}</span>
              <button onClick={() => onRemove(item.product_id)} className="text-red-500 text-sm">Remove</button>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm">Qty:</label>
                <input
                  type="number"
                  min="1"
                  className="w-16 p-1 border rounded text-center"
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
              </div>
              <span className="font-semibold">₱{item.subtotal.toFixed(2)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-4 border-t flex justify-between items-center">
        <span className="text-xl font-bold">Total:</span>
        <span className="text-xl font-bold text-blue-600">₱{total.toFixed(2)}</span>
      </div>
      <button
        onClick={onCheckout}
        className="w-full mt-6 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded"
      >
        Checkout
      </button>
    </div>
  );
}
