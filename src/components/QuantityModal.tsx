"use client";

import { useState, useEffect, useRef } from 'react';

interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
  barcode: string | null;
  pack_multiplier?: number;
}

interface QuantityModalProps {
  product: Product | null;
  onClose: () => void;
  onConfirm: (product: Product, quantity: number) => void;
}

export default function QuantityModal({ product, onClose, onConfirm }: QuantityModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPackMode, setIsPackMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setIsPackMode(false);
      // Auto-focus the input for rapid typing
      setTimeout(() => {
          if (inputRef.current) {
              inputRef.current.focus();
              inputRef.current.select();
          }
      }, 50);
    }
  }, [product]);

  if (!product) return null;

  const handleConfirm = () => {
    const finalQuantity = isPackMode && product.pack_multiplier ? quantity * product.pack_multiplier : quantity;
    onConfirm(product, finalQuantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-on-background/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
          <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface truncate">{product.name} {product.tier ? `(${product.tier})` : ''}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-dim text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-stack-lg flex flex-col items-center gap-stack-lg">

            {product.pack_multiplier && product.pack_multiplier > 1 && (
                <div className="flex bg-surface-variant p-1 rounded-lg w-full">
                    <button
                        onClick={() => setIsPackMode(false)}
                        className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${!isPackMode ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Pieces (x1)
                    </button>
                    <button
                         onClick={() => setIsPackMode(true)}
                        className={`flex-1 py-2 text-center rounded-md font-label-md text-label-md transition-colors ${isPackMode ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                        Packs (x{product.pack_multiplier})
                    </button>
                </div>
            )}

          <div className="flex items-center gap-4 w-full justify-center">
            <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-14 h-14 rounded-full bg-surface-variant text-on-surface flex items-center justify-center hover:bg-surface-dim transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">remove</span>
            </button>

            <input
              ref={inputRef}
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 h-16 text-center font-display-price text-[32px] font-bold bg-surface border border-surface-variant rounded-xl focus:outline-none focus:border-primary text-on-surface"
            />

            <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-14 h-14 rounded-full bg-surface-variant text-on-surface flex items-center justify-center hover:bg-surface-dim transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">add</span>
            </button>
          </div>

          <div className="text-center font-label-xl text-label-xl text-on-surface-variant">
              Total: ₱{(product.price * (isPackMode && product.pack_multiplier ? quantity * product.pack_multiplier : quantity)).toFixed(2)}
          </div>

        </div>

        <div className="p-stack-md border-t border-surface-variant bg-surface-container-lowest">
          <button
            onClick={handleConfirm}
            className="w-full h-14 bg-primary text-on-primary rounded-xl font-label-xl text-label-xl flex items-center justify-center gap-2 hover:bg-primary-container active:scale-[0.98] transition-all duration-150"
          >
            <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>check_circle</span>
            Confirm Addition
          </button>
        </div>
      </div>
    </div>
  );
}
