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
    <div className="relative w-full max-w-sm mx-auto my-4">
      <input
        type="text"
        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
        placeholder="Search product..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filteredProducts.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
          {filteredProducts.map((p) => (
            <li
              key={p.product_id}
              className="p-2 hover:bg-blue-100 cursor-pointer flex justify-between text-black"
              onClick={() => {
                onSelect(p);
                setQuery('');
              }}
            >
              <span>{p.name} {p.tier ? `(${p.tier})` : ''}</span>
              <span className="font-semibold text-black">₱{p.price.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
