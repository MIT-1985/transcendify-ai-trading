import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function CandlestickChart({ symbol = 'X:BTCUSD', trades = [] }) {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [loading, setLoading] = useState(true);

  // Convert X:BTCUSD to BTCUSD for TradingView
  const tvSymbol = symbol.replace('X:', '').replace('USD', 'USD');

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: symbol
        });

        if (response.data?.success && response.data.data?.results?.[0]) {
          const result = response.data.data.results[0];
          setCurrentPrice(result.c);
          setPriceChange(((result.c - result.o) / result.o) * 100);
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              {symbol} Chart
            </CardTitle>
            <div className="flex items-center gap-3 mt-2">
              <div className="text-2xl font-bold text-white">
                ${currentPrice.toFixed(2)}
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {priceChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="w-full h-[500px]">
          <iframe
            src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=CRYPTO:${tvSymbol}&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0A0A0F&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=&utm_medium=widget_new&utm_campaign=chart&utm_term=CRYPTO:${tvSymbol}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="TradingView Chart"
          />
        </div>
      </CardContent>
    </Card>
  );
}