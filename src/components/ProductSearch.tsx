"use client";

import { useState, useMemo } from 'react';

interface Product {
  product_id: string;
  name: string;
  tier: string | null;
  price: number;
  barcode: string | null;
}

interface ProductSearchProps {
  products: Product[];
  onSelect: (product: Product) => void;
}

export default function ProductSearch({ products, onSelect }: ProductSearchProps) {
  const [query, setQuery] = useState('');

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return products.filter((p) => {
      const fullName = p.tier ? `${p.name} ${p.tier}` : p.name;
      return fullName.toLowerCase().includes(lowerQuery) || (p.barcode && p.barcode.includes(lowerQuery));
    }).slice(0, 5); // Show top 5 suggestions
  }, [query, products]);

  return (
    <div className="relative w-full max-w-md mx-auto my-stack-md px-margin-mobile">
        <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
                type="text"
                className="w-full h-[56px] pl-12 pr-4 bg-surface-container-low border border-outline-variant rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-on-surface font-body-md text-body-md"
                placeholder="Search products or scan barcode..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
                 <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
                     <span className="material-symbols-outlined text-[20px]">close</span>
                 </button>
            )}
        </div>
      {filteredProducts.length > 0 && (
        <ul className="absolute z-20 w-[calc(100%-2*var(--margin-mobile))] left-margin-mobile mt-1 bg-surface-container-lowest border border-surface-variant rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-surface-variant">
          {filteredProducts.map((p) => (
            <li
              key={p.product_id}
              className="p-stack-sm hover:bg-surface-container-low cursor-pointer flex justify-between items-center group transition-colors"
              onClick={() => {
                onSelect(p);
                setQuery('');
              }}
            >
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-surface-variant flex items-center justify-center text-on-surface-variant group-hover:bg-primary-container group-hover:text-on-primary-container transition-colors">
                      <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                  </div>
                  <span className="font-label-xl text-label-xl text-on-surface group-hover:text-primary">{p.name} {p.tier ? `(${p.tier})` : ''}</span>
              </div>
              <span className="font-mono-data text-mono-data text-on-surface-variant group-hover:text-primary">₱{p.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
