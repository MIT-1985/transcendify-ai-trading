import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, DollarSign, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import StatsCard from '@/components/trading/StatsCard';
import PriceCard from '@/components/trading/PriceCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createPageUrl } from '../utils';

// Simulated real-time prices (in production, connect to actual WebSocket)
const MOCK_PRICES = [
  { symbol: 'BTC/USD', price: 67842.50, change: 2.34, volume: 28500000000 },
  { symbol: 'ETH/USD', price: 3456.78, change: -0.89, volume: 15200000000 },
  { symbol: 'SOL/USD', price: 178.45, change: 5.67, volume: 3800000000 },
  { symbol: 'XRP/USD', price: 0.5234, change: 1.23, volume: 1200000000 },
  { symbol: 'DOGE/USD', price: 0.1567, change: -2.45, volume: 890000000 },
  { symbol: 'ADA/USD', price: 0.4523, change: 0.78, volume: 560000000 },
];

export default function Dashboard() {
  const [prices, setPrices] = useState(MOCK_PRICES);
  
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.UserSubscription.list()
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.TradingBot.list()
  });

  // Simulate price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => prev.map(p => ({
        ...p,
        price: p.price * (1 + (Math.random() - 0.5) * 0.001),
        change: p.change + (Math.random() - 0.5) * 0.1
      })));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const activeBots = subscriptions.filter(s => s.status === 'active').length;
  const totalProfit = subscriptions.reduce((sum, s) => sum + (s.total_profit || 0), 0);
  const totalTrades = subscriptions.reduce((sum, s) => sum + (s.total_trades || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-slate-400">Monitor your trading bots and market performance</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="Active Bots"
            value={activeBots}
            subtitle={`of ${bots.length} available`}
            icon={Bot}
          />
          <StatsCard
            title="Total Profit"
            value={`$${totalProfit.toLocaleString()}`}
            subtitle="+12.5% this month"
            icon={DollarSign}
            trend="up"
          />
          <StatsCard
            title="Total Trades"
            value={totalTrades.toLocaleString()}
            subtitle="Last 30 days"
            icon={Activity}
          />
          <StatsCard
            title="Win Rate"
            value="68.4%"
            subtitle="+2.3% vs last month"
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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