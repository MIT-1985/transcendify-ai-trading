import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT', 'BNB-USDT', 'ADA-USDT', 'LINK-USDT', 'AVAX-USDT', 'LTC-USDT'];

export default function LiveMarketPrices() {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updatePrices = async () => {
      const newPrices = {};
      
      for (const pair of PAIRS) {
        try {
          const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${pair}`);
          const data = await res.json();
          
          if (data.code === '0' && data.data?.[0]) {
            const ticker = data.data[0];
            const last = parseFloat(ticker.last || 0);
            const askPx = parseFloat(ticker.askPx || 0);
            const bidPx = parseFloat(ticker.bidPx || 0);
            const spread = askPx > 0 && bidPx > 0 ? ((askPx - bidPx) / bidPx * 100) : 0;
            
            newPrices[pair] = {
              price: last,
              change24h: parseFloat(ticker.change24h || 0),
              spread: spread.toFixed(3),
              volCcy24h: parseFloat(ticker.volCcy24h || 0)
            };
          }
        } catch (e) {
          console.error(`Failed to fetch ${pair}:`, e.message);
        }
      }

      setPrices(newPrices);
      setLoading(false);
    };

    updatePrices();
    const interval = setInterval(updatePrices, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Live Market Prices</h2>
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {PAIRS.map(p => <Skeleton key={p} className="h-24 bg-slate-800" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {PAIRS.map(pair => {
            const data = prices[pair] || { price: 0, change24h: 0, spread: '0', volCcy24h: 0 };
            const change = parseFloat(data.change24h || 0);
            
            return (
              <div key={pair} className="bg-slate-900/70 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition">
                <div className="font-bold text-white mb-2">{pair}</div>
                <div className="text-2xl font-mono font-bold text-cyan-400 mb-2">
                  ${data.price.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 mb-2">
                  {change >= 0 ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-sm font-bold">+{change.toFixed(2)}%</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-4 h-4 text-red-400" />
                      <span className="text-red-400 text-sm font-bold">{change.toFixed(2)}%</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Spread: {data.spread}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}