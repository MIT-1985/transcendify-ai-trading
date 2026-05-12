import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { getPrice } from '@/lib/marketDataStore';

// Generates a simulated order book from a mid-price — no API calls
function buildBook(midPrice) {
  if (!midPrice) return { bids: [], asks: [] };
  const spread = midPrice * 0.0005;
  const bids = [], asks = [];
  for (let i = 0; i < 10; i++) {
    bids.push({ price: midPrice - spread - i * spread * 0.5, amount: (0.05 + Math.random() * 0.3) * Math.exp(-i * 0.15), total: 0 });
    asks.push({ price: midPrice + spread + i * spread * 0.5, amount: (0.05 + Math.random() * 0.3) * Math.exp(-i * 0.15), total: 0 });
  }
  let t = 0; bids.forEach(b => { t += b.amount; b.total = t; });
  t = 0;     asks.forEach(a => { t += a.amount; a.total = t; });
  return { bids, asks };
}

export default function OrderBook({ symbol = 'BTC-USDT' }) {
  const [bids, setBids] = useState([]);
  const [asks, setAsks] = useState([]);

  // Rebuild simulated book whenever the store emits a new price for this symbol
  useEffect(() => {
    function refresh() {
      const ticker = getPrice(symbol);
      const midPrice = ticker?.last || ticker?.bid || 0;
      const { bids: b, asks: a } = buildBook(midPrice);
      setBids(b);
      setAsks(a);
    }
    refresh();
    // Poll store (no network call) at 5s — cheap since getPrice() is sync
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [symbol]);

  if (!bids.length) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          <div className="text-center text-slate-400 text-sm">Waiting for price data…</div>
        </CardContent>
      </Card>
    );
  }

  const maxBidTotal = Math.max(...bids.map(b => b.total), 1);
  const maxAskTotal = Math.max(...asks.map(a => a.total), 1);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white text-sm">Order Book</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 text-xs text-slate-500 mb-2">
          <div>Price</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Total</div>
        </div>
        
        <div className="space-y-1 mb-3">
          {asks.slice().reverse().map((ask, idx) => (
            <div 
              key={`ask-${idx}`}
              className="grid grid-cols-3 text-xs relative group hover:bg-slate-800/30 rounded px-1 py-0.5"
            >
              <div 
                className="absolute inset-0 bg-red-500/10 rounded"
                style={{ width: `${(ask.total / maxAskTotal) * 100}%` }}
              />
              <div className="text-red-400 font-mono relative z-10">
                ${ask.price.toFixed(2)}
              </div>
              <div className="text-white text-right font-mono relative z-10">
                {ask.amount.toFixed(4)}
              </div>
              <div className="text-slate-400 text-right font-mono relative z-10">
                {ask.total.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex items-center justify-center gap-2 py-2 border-y border-slate-700 mb-3">
          <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-400">
            Spread: ${(asks[0]?.price - bids[0]?.price).toFixed(2)}
          </span>
          <ArrowDownCircle className="w-4 h-4 text-red-400" />
        </div>
        
        <div className="space-y-1">
          {bids.map((bid, idx) => (
            <div 
              key={`bid-${idx}`}
              className="grid grid-cols-3 text-xs relative group hover:bg-slate-800/30 rounded px-1 py-0.5"
            >
              <div 
                className="absolute inset-0 bg-emerald-500/10 rounded"
                style={{ width: `${(bid.total / maxBidTotal) * 100}%` }}
              />
              <div className="text-emerald-400 font-mono relative z-10">
                ${bid.price.toFixed(2)}
              </div>
              <div className="text-white text-right font-mono relative z-10">
                {bid.amount.toFixed(4)}
              </div>
              <div className="text-slate-400 text-right font-mono relative z-10">
                {bid.total.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}