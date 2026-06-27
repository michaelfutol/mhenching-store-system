"use client";

import { useEffect, useRef, useState } from 'react';
import {
  createDefaultPaymentDetails,
  paymentMethodOptions,
  type PaymentDetails,
  type PaymentMethod,
} from '@/lib/payments';
import type { CartItem } from '@/types';



interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: (paymentDetails: PaymentDetails) => void;
  focusProductId: string | null;
  title?: string;
  checkoutLabel?: string;
  showPaymentFields?: boolean;
  disabled?: boolean;
}

export default function Cart({
  items,
  onUpdateQuantity,
  onRemove,
  onCheckout,
  focusProductId,
  title = 'Current Order',
  checkoutLabel = 'Proceed / Finalize Sale',
  showPaymentFields = true,
  disabled = false,
}: CartProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>(createDefaultPaymentDetails);

  const setPaymentField = <K extends keyof PaymentDetails>(field: K, value: PaymentDetails[K]) => {
    setPaymentDetails((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    if (focusProductId && inputRefs.current[focusProductId]) {
      inputRefs.current[focusProductId]?.focus();
      // Select the text so they can quickly type a new number over it
      inputRefs.current[focusProductId]?.select();
    }
  }, [focusProductId, items.length]); // trigger on item change too just in case

  useEffect(() => {
    if (items.length === 0) {
      setPaymentDetails(createDefaultPaymentDetails());
    }
  }, [items.length]);

  if (items.length === 0) {
    return <div className="text-center p-4 text-on-surface-variant">Cart is empty</div>;
  }

  return (
    <div className={`flex flex-col flex-grow w-full max-w-md mx-auto relative md:min-h-[600px] ${showPaymentFields ? 'pb-80' : 'pb-40'}`}>
        <div className="px-margin-mobile py-stack-lg flex items-center justify-between gap-stack-sm bg-surface-container-lowest border-b border-surface-variant">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight">{title} <span className="text-on-surface-variant font-normal">({items.length} items)</span></h2>
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
            {showPaymentFields && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-on-surface-variant font-label-md text-label-md">
                        Payment
                        <select
                            value={paymentDetails.method}
                            onChange={(event) => setPaymentField('method', event.target.value as PaymentMethod)}
                            className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface font-label-md"
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
                            value={paymentDetails.amountReceived}
                            onChange={(event) => setPaymentField('amountReceived', event.target.value)}
                            placeholder={total.toFixed(2)}
                            className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface font-mono-data"
                        />
                    </label>
                </div>
            )}

            {showPaymentFields && paymentDetails.method !== 'cash' && (
                <label className="flex flex-col gap-1 text-on-surface-variant font-label-md text-label-md">
                    Reference
                    <input
                        type="text"
                        value={paymentDetails.reference}
                        onChange={(event) => setPaymentField('reference', event.target.value)}
                        placeholder="GCash/Maya/card/USDT reference"
                        className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                    />
                </label>
            )}

            {showPaymentFields && paymentDetails.method === 'utang_ledger' && (
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-tertiary/30 bg-tertiary-fixed/40 p-2">
                    <input
                        type="text"
                        value={paymentDetails.arCustomerName}
                        onChange={(event) => setPaymentField('arCustomerName', event.target.value)}
                        placeholder="Customer name"
                        className="h-11 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            value={paymentDetails.arContactInfo}
                            onChange={(event) => setPaymentField('arContactInfo', event.target.value)}
                            placeholder="Contact"
                            className="h-11 min-w-0 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                        />
                        <input
                            type="date"
                            value={paymentDetails.arDueDate}
                            onChange={(event) => setPaymentField('arDueDate', event.target.value)}
                            className="h-11 min-w-0 rounded-lg border border-surface-variant bg-surface px-3 text-on-surface"
                        />
                    </div>
                </div>
            )}
            <button
                onClick={() => onCheckout(paymentDetails)}
                disabled={disabled}
                className="w-full h-16 bg-secondary text-on-secondary rounded-xl font-label-xl text-label-xl flex items-center justify-center gap-2 hover:bg-secondary/90 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-secondary/20 disabled:opacity-60 disabled:active:scale-100"
            >
                <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>receipt_long</span>
                {checkoutLabel}
            </button>
      </div>
    </div>
  );
}
