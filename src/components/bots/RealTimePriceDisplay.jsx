import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RealTimePriceDisplay({ symbol, className }) {
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchPrice = async () => {
      try {
        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: symbol
        });

        if (mounted && response.data?.success) {
          const result = response.data.data.results?.[0];
          if (result) {
            setPriceData({
              price: result.c,
              change: ((result.c - result.o) / result.o) * 100,
              volume: result.v,
              high: result.h,
              low: result.l
            });
          }
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000); // Update every 10 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [symbol]);

  if (loading) {
    return <div className={cn("text-slate-400 text-sm", className)}>Loading...</div>;
  }

  if (!priceData) {
    return <div className={cn("text-slate-400 text-sm", className)}>No data</div>;
  }

  const isPositive = priceData.change >= 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-semibold text-white">
        ${priceData.price?.toFixed(2)}
      </span>
      <span className={cn(
        "flex items-center gap-1 text-sm",
        isPositive ? "text-emerald-400" : "text-red-400"
      )}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPositive ? '+' : ''}{priceData.change?.toFixed(2)}%
      </span>
    </div>
  );
}