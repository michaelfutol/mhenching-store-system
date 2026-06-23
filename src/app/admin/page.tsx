"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ItemSale {
  name: string;
  tier: string;
  qty: number;
  subtotal: number;
}

interface EODData {
  totalRevenue: number;
  totalCOGS: number;
  netProfit: number;
  totalTransactions: number;
  itemSales: ItemSale[];
  attendantSales: Record<string, number>;
}

interface Product {
  product_id: string;
  name: string;
  tier: string;
  price: number;
  barcode: string | null;
  unit_cost: number | null;
  markup_percentage: number | null;
  current_stock_quantity: number;
  pack_multiplier: number;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [eodData, setEodData] = useState<EODData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products'>('dashboard');

  // Product Management State
  const [products, setProducts] = useState<Product[]>([]);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({ tier: '', current_stock_quantity: 0, pack_multiplier: 1 });

  const correctPin = '1234'; // Simple hardcoded PIN for demonstration

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      setIsAuthenticated(true);
      fetchEODData();
      fetchProducts();
    } else {
      alert('Incorrect PIN');
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const isUpdate = !!currentProduct.product_id;

    const payload = {
        name: currentProduct.name,
        tier: currentProduct.tier || '',
        price: Number(currentProduct.price),
        barcode: currentProduct.barcode || null,
        unit_cost: currentProduct.unit_cost ? Number(currentProduct.unit_cost) : null,
        markup_percentage: currentProduct.markup_percentage ? Number(currentProduct.markup_percentage) : null,
        current_stock_quantity: Number(currentProduct.current_stock_quantity || 0),
        pack_multiplier: Number(currentProduct.pack_multiplier || 1)
    };

    if (isUpdate) {
        const { error } = await supabase.from('products').update(payload).eq('product_id', currentProduct.product_id);
        if (error) alert('Error updating product: ' + error.message);
    } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) alert('Error creating product: ' + error.message);
    }

    setIsEditingProduct(false);
    setCurrentProduct({ tier: '', current_stock_quantity: 0, pack_multiplier: 1 });
    fetchProducts();
  };

  const handleDeleteProduct = async (id: string) => {
      if (!confirm("Are you sure you want to delete this product?")) return;
      const { error } = await supabase.from('products').delete().eq('product_id', id);
      if (error) {
          alert('Error deleting product (it might be tied to existing transactions): ' + error.message);
      } else {
          fetchProducts();
      }
  };

  const fetchEODData = async () => {
    setLoading(true);
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Using the supabase client directly for the admin dashboard queries
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
            transaction_id,
            attendant_id,
            total_amount,
            transaction_items (
                product_id,
                quantity,
                unit_cost_at_sale,
                subtotal,
                products (
                    name,
                    tier
                )
            )
        `)
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString());

      if (error) throw error;

      let totalRevenue = 0;
      let totalCOGS = 0;
      const itemSales: Record<string, { name: string; tier: string; qty: number; subtotal: number }> = {};
      const attendantSales: Record<string, number> = {};

      (transactions || []).forEach(tx => {
        totalRevenue += Number(tx.total_amount);

        // Attendant sales
        if (!attendantSales[tx.attendant_id]) {
            attendantSales[tx.attendant_id] = 0;
        }
        attendantSales[tx.attendant_id] += Number(tx.total_amount);

        // Item sales
        (tx.transaction_items || []).forEach((item: any) => {
            totalCOGS += (Number(item.unit_cost_at_sale) * Number(item.quantity));
            const key = item.product_id;

            // Handle products that might have been deleted (should be restricted by FK, but safe check)
            const pName = item.products?.name || 'Unknown';
            const pTier = item.products?.tier || '';

            if (!itemSales[key]) {
            itemSales[key] = {
                name: pName,
                tier: pTier,
                qty: 0,
                subtotal: 0,
            };
            }
            itemSales[key].qty += Number(item.quantity);
            itemSales[key].subtotal += Number(item.subtotal);
        });
      });

      const itemSalesList = Object.values(itemSales);

      setEodData({
          totalRevenue,
          totalCOGS,
          netProfit: totalRevenue - totalCOGS,
          totalTransactions: transactions ? transactions.length : 0,
          itemSales: itemSalesList,
          attendantSales,
      });

    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDay = async () => {
    if (!confirm("Are you sure you want to close the day? This will lock today's transactions.")) return;

    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error, count } = await supabase
        .from('transactions')
        .update({ closed: true })
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .eq('closed', false);

      if (error) throw error;

      alert(`Day closed successfully. Locked transactions.`);

      // Export JSON
      if (eodData) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(eodData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `eod_report_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
      }

    } catch (err) {
      console.error(err);
      alert('Error closing day');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-black">
        <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow-md">
          <h2 className="text-xl font-bold mb-4">Admin Access</h2>
          <input
            type="password"
            placeholder="Enter PIN"
            className="w-full p-2 border rounded mb-4"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      {/* Header Section */}
      <div className="col-span-1 lg:col-span-12 flex flex-col md:flex-row justify-between items-start md:items-center mb-stack-md gap-stack-md">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background">Management Dashboard</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{new Date().toDateString()} • Operator OP-991</p>
        </div>
        <div className="flex gap-2">
            <a href="/" className="bg-surface-dim text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center gap-2">
                Back to POS
            </a>
            {activeTab === 'dashboard' && (
              <button onClick={handleCloseDay} className="bg-primary text-on-primary h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-primary-container active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined">print</span>
                  Close Day & Export
              </button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="col-span-1 lg:col-span-12 flex gap-4 mb-4 border-b border-surface-variant">
          <button
              className={`py-2 px-4 font-label-xl border-b-2 ${activeTab === 'dashboard' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setActiveTab('dashboard')}
          >
              EOD Summary
          </button>
          <button
              className={`py-2 px-4 font-label-xl border-b-2 ${activeTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
              onClick={() => setActiveTab('products')}
          >
              Product Management
          </button>
      </div>

      {activeTab === 'dashboard' && (
      <>
      {loading ? (
          <div className="col-span-1 lg:col-span-12">Loading...</div>
      ) : eodData ? (
      <>
      {/* Key Metrics Grid */}
      <div className="col-span-1 lg:col-span-12 grid grid-cols-1 md:grid-cols-4 gap-gutter mb-stack-lg">
        {/* Total Sales Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">Gross Revenue</h2>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">payments</span>
          </div>
          <div className="font-display-price text-[28px] md:text-display-price text-on-background">₱{eodData.totalRevenue.toFixed(2)}</div>
        </div>

        {/* COGS Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">COGS</h2>
            <span className="material-symbols-outlined text-error bg-error-container p-2 rounded-full">shopping_cart</span>
          </div>
          <div className="font-display-price text-[28px] md:text-display-price text-on-background">₱{eodData.totalCOGS.toFixed(2)}</div>
        </div>

        {/* Net Profit Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">Net Profit</h2>
            <span className="material-symbols-outlined text-secondary bg-secondary-container p-2 rounded-full">trending_up</span>
          </div>
          <div className="font-display-price text-[28px] md:text-display-price text-on-background">₱{eodData.netProfit.toFixed(2)}</div>
        </div>

        {/* Transactions Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">Transactions</h2>
            <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">receipt_long</span>
          </div>
          <div className="font-display-price text-[28px] md:text-display-price text-on-background">{eodData.totalTransactions}</div>
        </div>
      </div>

      <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        {/* Details Section */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col h-[500px] lg:col-span-2">
          <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
            <h2 className="font-label-xl text-label-xl text-on-surface">Item Breakdown</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-lowest sticky top-0 z-10 shadow-sm">
                <tr className="border-b border-surface-variant">
                  <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium">Item Name</th>
                  <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">Qty</th>
                  <th className="p-stack-md font-label-md text-label-md text-on-surface-variant font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant">
                {eodData.itemSales.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-lowest transition-colors group">
                    <td className="p-stack-md font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                    <td className="p-stack-md font-mono-data text-mono-data text-on-surface text-right">{item.qty}</td>
                    <td className="p-stack-md font-mono-data text-mono-data text-on-surface font-medium text-right">₱{item.subtotal.toFixed(2)}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-gutter h-[500px]">
            {/* Disabled Metrics Section */}
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col flex-1">
            <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
                <h2 className="font-label-xl text-label-xl text-on-surface">Sales by Attendant</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-stack-md">
                <ul className="divide-y divide-surface-variant">
                {Object.entries(eodData.attendantSales).map(([attendant, total]) => (
                    <li key={attendant} className="py-3 flex justify-between">
                    <span className="font-body-md text-body-md text-on-surface">{attendant}</span>
                    <span className="font-mono-data text-mono-data text-on-surface font-medium">₱{total.toFixed(2)}</span>
                    </li>
                ))}
                </ul>
            </div>
            </div>

            {/* Product Management Link */}
            <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col p-stack-md justify-center items-center gap-2">
                <span className="material-symbols-outlined text-primary text-4xl" style={{fontVariationSettings: "'FILL' 1"}}>inventory_2</span>
                <h2 className="font-label-xl text-label-xl text-on-surface">Product Management</h2>
                <p className="font-body-md text-body-md text-on-surface-variant text-center text-sm">Update prices, stock, and costs.</p>
                <button onClick={() => setActiveTab('products')} className="mt-2 w-full h-10 bg-primary-container text-on-primary-container rounded-lg font-label-md hover:bg-primary hover:text-on-primary transition-colors">
                    Manage Products
                </button>
            </div>
        </div>
      </div>
      </>
      ) : (
          <div className="col-span-1 lg:col-span-12">No data available.</div>
      )}
      </>
      )}

      {activeTab === 'products' && (
          <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-gutter">
              {/* Product List */}
              <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm flex flex-col lg:col-span-2">
                  <div className="p-stack-md border-b border-surface-variant flex justify-between items-center bg-surface-container-low">
                      <h2 className="font-label-xl text-on-surface">Inventory ({products.length})</h2>
                      <button
                          onClick={() => { setCurrentProduct({ tier: '', current_stock_quantity: 0, pack_multiplier: 1 }); setIsEditingProduct(true); }}
                          className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:bg-primary-container transition-colors"
                      >
                          + Add New Item
                      </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead className="bg-surface-container-highest">
                            <tr>
                                <th className="p-3 font-label-md text-on-surface-variant">Name</th>
                                <th className="p-3 font-label-md text-on-surface-variant">SKU/Barcode</th>
                                <th className="p-3 font-label-md text-on-surface-variant">Price</th>
                                <th className="p-3 font-label-md text-on-surface-variant">Cost</th>
                                <th className="p-3 font-label-md text-on-surface-variant">Stock</th>
                                <th className="p-3 font-label-md text-on-surface-variant">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-variant">
                            {products.map(p => (
                                <tr key={p.product_id} className="hover:bg-surface-container-low transition-colors">
                                    <td className="p-3 font-body-md text-on-surface">{p.name} {p.tier ? `(${p.tier})` : ''}</td>
                                    <td className="p-3 font-mono-data text-on-surface-variant">{p.barcode || '-'}</td>
                                    <td className="p-3 font-mono-data text-on-surface">₱{p.price}</td>
                                    <td className="p-3 font-mono-data text-on-surface-variant">₱{p.unit_cost || 0}</td>
                                    <td className="p-3 font-mono-data text-on-surface">{p.current_stock_quantity}</td>
                                    <td className="p-3 flex gap-2">
                                        <button onClick={() => { setCurrentProduct(p); setIsEditingProduct(true); }} className="text-secondary hover:text-secondary-container"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                                        <button onClick={() => handleDeleteProduct(p.product_id)} className="text-error hover:text-error-container"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
              </div>

              {/* Edit Form */}
              {isEditingProduct && (
                  <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-sm p-stack-md flex flex-col">
                      <h2 className="font-label-xl text-on-surface mb-4">{currentProduct.product_id ? 'Edit Product' : 'Add New Product'}</h2>
                      <form onSubmit={handleSaveProduct} className="flex flex-col gap-3">
                          <div>
                              <label className="block font-label-md text-on-surface-variant mb-1">Name *</label>
                              <input required type="text" value={currentProduct.name || ''} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} className="w-full p-2 border border-outline-variant rounded bg-surface text-on-surface" placeholder="e.g. Lomi" />
                          </div>
                          <div>
                              <label className="block font-label-md text-on-surface-variant mb-1">Tier / Variant</label>
                              <input type="text" value={currentProduct.tier || ''} onChange={e => setCurrentProduct({...currentProduct, tier: e.target.value})} className="w-full p-2 border border-outline-variant rounded bg-surface text-on-surface" placeholder="e.g. Big" />
                          </div>
                          <div>
                              <label className="block font-label-md text-on-surface-variant mb-1">SKU / Barcode</label>
                              <input type="text" value={currentProduct.barcode || ''} onChange={e => setCurrentProduct({...currentProduct, barcode: e.target.value})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" placeholder="e.g. LOMI-BIG" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <div>
                                  <label className="block font-label-md text-on-surface-variant mb-1">Retail Price *</label>
                                  <input required type="number" step="0.01" value={currentProduct.price || ''} onChange={e => setCurrentProduct({...currentProduct, price: parseFloat(e.target.value)})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" />
                              </div>
                              <div>
                                  <label className="block font-label-md text-on-surface-variant mb-1">Unit Cost</label>
                                  <input type="number" step="0.01" value={currentProduct.unit_cost || ''} onChange={e => setCurrentProduct({...currentProduct, unit_cost: parseFloat(e.target.value)})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" />
                              </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              <div>
                                  <label className="block font-label-md text-on-surface-variant mb-1">Stock Qty</label>
                                  <input type="number" value={currentProduct.current_stock_quantity || 0} onChange={e => setCurrentProduct({...currentProduct, current_stock_quantity: parseInt(e.target.value)})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" />
                              </div>
                              <div>
                                  <label className="block font-label-md text-on-surface-variant mb-1">Pack Multiplier</label>
                                  <input type="number" min="1" value={currentProduct.pack_multiplier || 1} onChange={e => setCurrentProduct({...currentProduct, pack_multiplier: parseInt(e.target.value)})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" />
                              </div>
                              <div>
                                  <label className="block font-label-md text-on-surface-variant mb-1">Markup %</label>
                                  <input type="number" step="0.1" value={currentProduct.markup_percentage || ''} onChange={e => setCurrentProduct({...currentProduct, markup_percentage: parseFloat(e.target.value)})} className="w-full p-2 border border-outline-variant rounded bg-surface font-mono-data text-on-surface" />
                              </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                              <button type="button" onClick={() => setIsEditingProduct(false)} className="flex-1 bg-surface-dim text-on-surface p-2 rounded font-label-md hover:bg-surface-variant">Cancel</button>
                              <button type="submit" className="flex-1 bg-primary text-on-primary p-2 rounded font-label-md hover:bg-primary-container">Save</button>
                          </div>
                      </form>
                  </div>
              )}
          </div>
      )}
    </main>
  );
}
