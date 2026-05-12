import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import WatchlistPanel from '@/components/trading/WatchlistPanel';
import PriceAlertsPanel from '@/components/trading/PriceAlertsPanel';
import OrderManagement from '@/components/trading/OrderManagement';
import OrderHistory from '@/components/trading/OrderHistory';
import OrderBook from '@/components/trading/OrderBook';
import NewsSentiment from '@/components/market/NewsSentiment';
import AdvancedIndicators from '@/components/market/AdvancedIndicators';
import ComplexAlerts from '@/components/market/ComplexAlerts';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CRYPTO_PAIRS = [
  'X:BTCUSD',
  'X:ETHUSD',
  'X:SOLUSD',
  'X:XRPUSD',
  'X:ADAUSD',
  'X:DOGEUSD'
];

const TIMEFRAMES = [
  { value: 'minute', label: '1m', multiplier: 1, limit: 60 },
  { value: 'minute', label: '5m', multiplier: 5, limit: 60 },
  { value: 'minute', label: '15m', multiplier: 15, limit: 100 },
  { value: 'minute', label: '30m', multiplier: 30, limit: 100 },
  { value: 'hour', label: '1h', multiplier: 1, limit: 100 },
  { value: 'hour', label: '6h', multiplier: 6, limit: 100 },
  { value: 'day', label: '1d', multiplier: 1, limit: 100 }
];

export default function PolygonConsole() {
  const [selectedPair, setSelectedPair] = useState('X:BTCUSD');
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[4]); // 1h default
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Use OKX public ticker — no auth, no rate limits
    const okxInstId = selectedPair.replace('X:', '').replace('USD', '-USDT');
    const fetchPrice = async () => {
      try {
        const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxInstId}`);
        const json = await res.json();
        const d    = json?.data?.[0];
        if (d) {
          setCurrentPrice(parseFloat(d.last) || 0);
          const open = parseFloat(d.open24h) || 0;
          const last = parseFloat(d.last)    || 0;
          setPriceChange(open > 0 ? ((last - open) / open) * 100 : 0);
        }
      } catch (err) {
        // silent — don't break UI
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  const tvSymbol = selectedPair.replace('X:', '').replace('USD', 'USD');
  const tvInterval = timeframe.label === '1m' ? '1' : timeframe.label === '5m' ? '5' : timeframe.label === '15m' ? '15' : timeframe.label === '30m' ? '30' : timeframe.label === '1h' ? '60' : timeframe.label === '6h' ? '360' : 'D';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4">
      <div className="max-w-[1800px] mx-auto">

        
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <Select value={selectedPair} onValueChange={setSelectedPair}>
              <SelectTrigger className="w-44 bg-slate-900 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CRYPTO_PAIRS.map(pair => (
                  <SelectItem key={pair} value={pair}>
                    {pair.replace('X:', '').replace('USD', '/USD')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div>
              <div className="text-2xl font-bold">${currentPrice.toFixed(2)}</div>
              <div className={`text-sm ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.label}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  timeframe.label === tf.label
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
            Live
          </Badge>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          {/* Chart - Takes 3 columns */}
          <div className="xl:col-span-3">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-0">
                <div className="w-full h-[700px] relative">
                  {isChartLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/90">
                      <div className="text-center">
                        <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
                        <p className="text-slate-400">Loading chart...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={`https://www.tradingview.com/widgetembed/?symbol=CRYPTO:${tvSymbol}&interval=${tvInterval}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0A0A0F&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=en&allow_symbol_change=1`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="TradingView Chart"
                    onLoad={() => setIsChartLoading(false)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Current Price</div>
                    <div className="text-lg font-semibold text-white">
                      ${currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">24h Change</div>
                    <div className={`text-lg font-semibold ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Takes 1 column */}
          <div className="space-y-4">
            <Tabs defaultValue="trading" className="w-full">
              <TabsList className="grid grid-cols-3 bg-slate-900 border border-slate-800">
                <TabsTrigger value="trading">Trading</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
              </TabsList>

              <TabsContent value="trading" className="space-y-4 mt-4">
                <OrderManagement symbol={selectedPair} />
                <WatchlistPanel onSymbolSelect={setSelectedPair} />
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4 mt-4">
                <NewsSentiment symbol={selectedPair} />
                <AdvancedIndicators />
              </TabsContent>

              <TabsContent value="alerts" className="space-y-4 mt-4">
                <ComplexAlerts symbol={selectedPair} />
                <PriceAlertsPanel />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Trading Section */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
          <div className="xl:col-span-2">
            <OrderHistory />
          </div>
          <div>
            <OrderBook symbol={selectedPair} />
          </div>
        </div>

        {/* Market Watchlist */}
        <div className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {CRYPTO_PAIRS.map(pair => (
              <QuickPriceCard key={pair} symbol={pair} onSelect={setSelectedPair} isActive={pair === selectedPair} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPriceCard({ symbol, onSelect, isActive }) {
  const [price, setPrice] = useState(0);
  const [change, setChange] = useState(0);

  useEffect(() => {
    // OKX public ticker — no auth, no rate limits
    const okxInstId = symbol.replace('X:', '').replace('USD', '-USDT');
    const fetchPrice = async () => {
      try {
        const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxInstId}`);
        const json = await res.json();
        const d    = json?.data?.[0];
        if (d) {
          setPrice(parseFloat(d.last) || 0);
          const open = parseFloat(d.open24h) || 0;
          const last = parseFloat(d.last)    || 0;
          setChange(open > 0 ? ((last - open) / open) * 100 : 0);
        }
      } catch (err) {
        // silent
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <div 
      className={`bg-slate-900/50 border rounded-lg p-3 hover:border-blue-500/50 transition-all cursor-pointer ${
        isActive ? 'border-blue-500' : 'border-slate-800'
      }`}
      onClick={() => onSelect(symbol)}
    >
      <div className="text-xs text-slate-500 mb-1">
        {symbol.replace('X:', '').replace('USD', '/USD')}
      </div>
      <div className="text-base font-bold text-white mb-1">
        ${price.toFixed(2)}
      </div>
      <div className={`text-xs flex items-center gap-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </div>
    </div>
  );
}