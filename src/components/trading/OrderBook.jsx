import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

export default function OrderBook({ symbol = 'BTC/USD' }) {
  const [bids, setBids] = useState([]);
  const [asks, setAsks] = useState([]);

  useEffect(() => {
    const generateOrderBook = () => {
      const basePrice = 67000;
      const newBids = [];
      const newAsks = [];
      
      // Generate bids (buy orders)
      for (let i = 0; i < 10; i++) {
        newBids.push({
          price: basePrice - (i * 10) - Math.random() * 5,
          amount: Math.random() * 2 + 0.1,
          total: 0
        });
      }
      
      // Generate asks (sell orders)
      for (let i = 0; i < 10; i++) {
        newAsks.push({
          price: basePrice + (i * 10) + Math.random() * 5,
          amount: Math.random() * 2 + 0.1,
          total: 0
        });
      }
      
      // Calculate totals
      let bidTotal = 0;
      newBids.forEach(bid => {
        bidTotal += bid.amount;
        bid.total = bidTotal;
      });
      
      let askTotal = 0;
      newAsks.forEach(ask => {
        askTotal += ask.amount;
        ask.total = askTotal;
      });
      
      setBids(newBids);
      setAsks(newAsks);
    };

    generateOrderBook();
    const interval = setInterval(generateOrderBook, 3000);
    return () => clearInterval(interval);
  }, [symbol]);

  const maxBidTotal = Math.max(...bids.map(b => b.total), 1);
  const maxAskTotal = Math.max(...asks.map(a => a.total), 1);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white text-sm">Order Book</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Headers */}
        <div className="grid grid-cols-3 text-xs text-slate-500 mb-2">
          <div>Price</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Total</div>
        </div>
        
        {/* Asks (Sell orders) */}
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
        
        {/* Spread */}
        <div className="flex items-center justify-center gap-2 py-2 border-y border-slate-700 mb-3">
          <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-400">
            Spread: ${(asks[0]?.price - bids[0]?.price).toFixed(2)}
          </span>
          <ArrowDownCircle className="w-4 h-4 text-red-400" />
        </div>
        
        {/* Bids (Buy orders) */}
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