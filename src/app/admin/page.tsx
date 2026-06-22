"use client";

import { useState, useEffect } from 'react';

interface ItemSale {
  name: string;
  tier: string;
  qty: number;
  subtotal: number;
}

interface EODData {
  totalRevenue: number;
  totalTransactions: number;
  itemSales: ItemSale[];
  attendantSales: Record<string, number>;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [eodData, setEodData] = useState<EODData | null>(null);
  const [loading, setLoading] = useState(false);

  const correctPin = '1234'; // Simple hardcoded PIN for demonstration

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      setIsAuthenticated(true);
      fetchEODData();
    } else {
      alert('Incorrect PIN');
    }
  };

  const fetchEODData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/eod');
      if (!res.ok) throw new Error('Failed to fetch EOD data');
      const data = await res.json();
      setEodData(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDay = async () => {
    if (!confirm("Are you sure you want to close the day? This will lock today's transactions.")) return;

    try {
      const res = await fetch('/api/eod/close', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to close day');

      const resData = await res.json();
      alert(`Day closed successfully. Locked ${resData.updatedCount} transactions.`);

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
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-background">End of Day Summary</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{new Date().toDateString()} • Operator OP-991</p>
        </div>
        <div className="flex gap-2">
            <a href="/" className="bg-surface-dim text-on-surface h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center gap-2">
                Back to POS
            </a>
            <button onClick={handleCloseDay} className="bg-primary text-on-primary h-touch-target-min px-6 rounded-lg font-label-xl text-label-xl hover:bg-primary-container active:scale-95 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined">print</span>
                Close Day & Export
            </button>
        </div>
      </div>

      {loading ? (
          <div className="col-span-1 lg:col-span-12">Loading...</div>
      ) : eodData ? (
      <>
      {/* Key Metrics Grid */}
      <div className="col-span-1 lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-gutter mb-stack-lg">
        {/* Total Sales Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">Gross Sales</h2>
            <span className="material-symbols-outlined text-primary bg-primary-fixed p-2 rounded-full">payments</span>
          </div>
          <div className="font-display-price text-display-price text-on-background">₱{eodData.totalRevenue.toFixed(2)}</div>
        </div>

        {/* Transactions Card */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-stack-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start mb-stack-md">
            <h2 className="font-label-xl text-label-xl text-on-surface-variant">Transactions</h2>
            <span className="material-symbols-outlined text-tertiary bg-tertiary-fixed p-2 rounded-full">receipt_long</span>
          </div>
          <div className="font-display-price text-display-price text-on-background">{eodData.totalTransactions}</div>
        </div>
      </div>

      <div className="col-span-1 lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        {/* Details Section */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col h-[500px]">
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

        {/* Disabled Metrics Section */}
        <div className="bg-surface-container-lowest border border-surface-variant rounded-xl overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex flex-col h-[500px]">
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
      </div>
      </>
      ) : (
          <div className="col-span-1 lg:col-span-12">No data available.</div>
      )}
    </main>
  );
}
