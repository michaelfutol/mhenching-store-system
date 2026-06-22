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
    <div className="min-h-screen bg-gray-50 text-black p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">End of Day Dashboard</h1>
          <a href="/" className="text-blue-500 underline">Back to POS</a>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : eodData ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-white p-6 rounded shadow-md border-l-4 border-green-500">
                <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Gross Revenue</h3>
                <p className="text-3xl font-bold">₱{eodData.totalRevenue.toFixed(2)}</p>
              </div>
              <div className="bg-white p-6 rounded shadow-md border-l-4 border-blue-500">
                <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Total Transactions</h3>
                <p className="text-3xl font-bold">{eodData.totalTransactions}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="bg-white p-6 rounded shadow-md">
                <h3 className="text-xl font-bold mb-4">Item Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2">Item Name</th>
                        <th className="py-2">Qty</th>
                        <th className="py-2">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eodData.itemSales.map((item, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2">{item.name} {item.tier ? `(${item.tier})` : ''}</td>
                          <td className="py-2">{item.qty}</td>
                          <td className="py-2">₱{item.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white p-6 rounded shadow-md">
                <h3 className="text-xl font-bold mb-4">Sales by Attendant</h3>
                <ul className="divide-y">
                  {Object.entries(eodData.attendantSales).map(([attendant, total]) => (
                    <li key={attendant} className="py-3 flex justify-between">
                      <span className="font-medium">{attendant}</span>
                      <span className="font-semibold">₱{total.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={handleCloseDay}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded shadow-lg"
              >
                Close Day & Export
              </button>
            </div>
          </>
        ) : (
          <div>No data available.</div>
        )}
      </div>
    </div>
  );
}
