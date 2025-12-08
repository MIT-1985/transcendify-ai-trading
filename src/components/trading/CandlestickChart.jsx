import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function CandlestickChart({ symbol = 'X:BTCUSD', trades = [] }) {
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [loading, setLoading] = useState(true);
  const chartContainerRef = useRef(null);

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

  // Recent trades overlay (last 20 trades)
  const recentTrades = trades.slice(-20);

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
          {trades.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-slate-500">Trade Markers</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-emerald-400">
                  <ArrowUpCircle className="w-3 h-3" />
                  Buy
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <ArrowDownCircle className="w-3 h-3" />
                  Sell
                </span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        <div ref={chartContainerRef} className="w-full h-[500px]">
          <iframe
            src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=CRYPTO:${tvSymbol}&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0A0A0F&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=&utm_medium=widget_new&utm_campaign=chart&utm_term=CRYPTO:${tvSymbol}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="TradingView Chart"
          />
        </div>
        
        {/* Trade markers overlay */}
                {recentTrades.length > 0 && (
                  <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-sm rounded-lg p-3 border border-slate-700 shadow-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-slate-400">Live Bot Trades</div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-xs text-emerald-400 font-semibold">ACTIVE</span>
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {recentTrades.map((trade, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition-all hover:scale-105 ${
                            trade.side === 'BUY' 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border border-red-500/40'
                          }`}
                        >
                          {trade.side === 'BUY' ? (
                            <ArrowUpCircle className="w-4 h-4" />
                          ) : (
                            <ArrowDownCircle className="w-4 h-4" />
                          )}
                          <span className="text-white font-bold">${trade.entry_price?.toFixed(2)}</span>
                          <span className="text-slate-400">→</span>
                          <span className={trade.profit_loss >= 0 ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>
                            {trade.profit_loss >= 0 ? '+' : ''}${Math.abs(trade.profit_loss)?.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
      </CardContent>
    </Card>
  );
}