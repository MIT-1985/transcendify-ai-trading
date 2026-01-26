import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, DollarSign, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import StatsCard from '@/components/trading/StatsCard';
import PriceCard from '@/components/trading/PriceCard';
import CandlestickChart from '@/components/trading/CandlestickChart';
import OrderBook from '@/components/trading/OrderBook';
import RealTimeEarnings from '@/components/dashboard/RealTimeEarnings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createPageUrl } from '../utils';

const CRYPTO_SYMBOLS = [
  'X:BTCUSD',
  'X:ETHUSD', 
  'X:SOLUSD',
  'X:XRPUSD',
  'X:DOGEUSD',
  'X:ADAUSD'
];

export default function Dashboard() {
  const [prices, setPrices] = useState([]);
  const [unrealisedPnL, setUnrealisedPnL] = useState(0);
  
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.UserSubscription.list()
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.TradingBot.list()
  });

  // Bots run automatically via BotEngine in BotRunner page
  // No need to call them from Dashboard

  // Fetch real-time prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        console.log('Fetching prices for', CRYPTO_SYMBOLS);
        const pricePromises = CRYPTO_SYMBOLS.map(async (symbol) => {
          const response = await base44.functions.invoke('polygonMarketData', {
            action: 'ticker',
            symbol: symbol
          });
          
          console.log(`Price response for ${symbol}:`, response.data);
          
          if (response.data?.success && response.data.data?.results?.[0]) {
            const result = response.data.data.results[0];
            return {
              symbol: symbol.replace('X:', '').replace('USD', '/USD'),
              price: result.c,
              change: ((result.c - result.o) / result.o) * 100,
              volume: result.v
            };
          }
          return null;
        });

        const results = await Promise.all(pricePromises);
        const validPrices = results.filter(p => p !== null);
        console.log('Got', validPrices.length, 'valid prices:', validPrices);
        setPrices(validPrices);
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const activeBots = subscriptions.filter(s => s.status === 'active').length;
  const totalProfit = subscriptions.reduce((sum, s) => sum + (s.total_profit || 0), 0);
  const totalTrades = subscriptions.reduce((sum, s) => sum + (s.total_trades || 0), 0);
  
  useEffect(() => {
    setUnrealisedPnL(totalProfit);
  }, [totalProfit]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-slate-400 text-sm sm:text-base">Monitor your trading bots and market performance</p>
            {activeBots > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-xs sm:text-sm font-semibold">Bots Running Live</span>
              </div>
            )}
          </div>
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-slate-700 rounded-xl p-4 sm:p-5 w-full sm:min-w-[200px] sm:w-auto">
            <div className="text-xs text-slate-400 mb-1">Total P&L</div>
            <div className={`text-2xl sm:text-3xl font-bold ${unrealisedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {unrealisedPnL >= 0 ? '+' : ''}${unrealisedPnL.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Real-Time Earnings */}
        {activeBots > 0 && (
          <div className="mb-6 sm:mb-8">
            <RealTimeEarnings subscriptions={subscriptions} />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Active Bots"
            value={activeBots}
            subtitle={`of ${bots.length} available`}
            icon={Bot}
          />
          <StatsCard
            title="Total Profit"
            value={`$${totalProfit.toFixed(2)}`}
            subtitle={totalProfit >= 0 ? 'Profit' : 'Loss'}
            icon={DollarSign}
            trend={totalProfit >= 0 ? 'up' : 'down'}
          />
          <StatsCard
            title="Total Trades"
            value={totalTrades.toLocaleString()}
            subtitle="All time"
            icon={Activity}
          />
          <StatsCard
            title="Win Rate"
            value={totalTrades > 0 ? `${((subscriptions.reduce((sum, s) => {
              const profit = s.total_profit || 0;
              return profit > 0 ? sum + 1 : sum;
            }, 0) / subscriptions.length) * 100).toFixed(1)}%` : '0%'}
            subtitle="Bot performance"
            icon={TrendingUp}
            trend="up"
          />
        </div>

        {/* Market Prices */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Live Market Prices</h2>
            <span className="flex items-center gap-1 text-xs text-emerald-400 ml-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {prices.map((p, idx) => (
              <PriceCard
                key={idx}
                symbol={p.symbol}
                price={p.price}
                change={p.change}
                volume={p.volume}
              />
            ))}
            </div>
            </div>

            {/* Trading Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
            <CandlestickChart symbol="X:BTCUSD" trades={[]} />
            </div>
            <div>
            <OrderBook symbol="X:BTCUSD" />
            </div>
            </div>

            {/* Active Subscriptions */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-semibold">Your Active Bots</h2>
          </div>
          
          {loadingSubs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 bg-slate-800" />
              ))}
            </div>
          ) : subscriptions.filter(s => s.status === 'active').length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center">
              <Bot className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Bots</h3>
              <p className="text-slate-400 text-sm">
                Subscribe to a trading bot to start automated trading
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.filter(s => s.status === 'active').map((sub) => {
                const bot = bots.find(b => b.id === sub.bot_id);
                return (
                  <div key={sub.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold">{bot?.name || 'Trading Bot'}</h4>
                        <span className="text-xs text-emerald-400">● Running</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Profit</div>
                        <div className="text-emerald-400 font-semibold">
                          +${sub.total_profit?.toLocaleString() || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Trades</div>
                        <div className="text-white font-semibold">{sub.total_trades || 0}</div>
                      </div>
                    </div>
                    <Button
                      onClick={() => window.location.href = createPageUrl('BotRunner') + '?id=' + sub.id}
                      className="w-full mt-4 bg-blue-600 hover:bg-blue-500"
                    >
                      View Live Dashboard
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}