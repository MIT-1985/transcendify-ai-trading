import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Play, Pause, ArrowLeft } from 'lucide-react';
import { useBotEngine } from '@/components/bots/BotEngine';
import LiveStats from '@/components/bots/LiveStats';
import TradeHistory from '@/components/bots/TradeHistory';
import RealTimePriceDisplay from '@/components/bots/RealTimePriceDisplay';
import LivePositions from '@/components/trading/LivePositions';
import CandlestickChart from '@/components/trading/CandlestickChart';
import { createPageUrl } from '../utils';

export default function BotRunner() {
  const navigate = useNavigate();
  const subscriptionId = new URLSearchParams(window.location.search).get('id');

  const { data: subscription } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: async () => {
      const subs = await base44.entities.UserSubscription.filter({ id: subscriptionId });
      return subs[0];
    },
    enabled: !!subscriptionId
  });

  const { data: bot } = useQuery({
    queryKey: ['bot', subscription?.bot_id],
    queryFn: async () => {
      const bots = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
      return bots[0];
    },
    enabled: !!subscription?.bot_id
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', subscriptionId],
    queryFn: () => base44.entities.Trade.filter({ subscription_id: subscriptionId }),
    enabled: !!subscriptionId,
    refetchInterval: 1000 // Refresh every second
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.email],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      return wallets[0];
    },
    enabled: !!user?.email
  });

  const { data: currentMarketPrice = 0 } = useQuery({
    queryKey: ['marketPrice', subscription?.trading_pairs?.[0]],
    queryFn: async () => {
      const response = await base44.functions.invoke('polygonMarketData', {
        action: 'ticker',
        symbol: subscription.trading_pairs[0] || 'X:BTCUSD'
      });
      return response.data?.data?.results?.[0]?.c || 0;
    },
    enabled: !!subscription?.trading_pairs?.[0],
    refetchInterval: 5000
  });

  const vipLevel = wallet?.vip_level || 'none';
  const { isRunning, setIsRunning, elapsedSeconds, currentProfit } = useBotEngine(subscription, vipLevel);

  if (!subscription || !bot) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl('Dashboard'))}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{bot.name}</h1>
              <div className="flex items-center gap-4">
                <p className="text-slate-400">{bot.strategy} strategy • {bot.risk_level} risk</p>
                <RealTimePriceDisplay symbol={subscription.trading_pairs?.[0] || 'X:BTCUSD'} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400">Mode</div>
              <div className="text-sm font-semibold text-emerald-400">TEST • Live Data</div>
            </div>
            <div className="bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400">Total Trades</div>
              <div className="text-sm font-semibold text-white">{trades.length}</div>
            </div>
            <Button
              onClick={() => setIsRunning(!isRunning)}
              size="lg"
              className={isRunning ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}
            >
              {isRunning ? (
                <>
                  <Pause className="w-5 h-5 mr-2" />
                  Stop Bot
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Start Bot
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Live Stats */}
        <div className="mb-6">
          <LiveStats 
            subscription={subscription}
            trades={trades}
            currentProfit={currentProfit}
            elapsedSeconds={elapsedSeconds}
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart with trades overlay */}
          <div className="lg:col-span-2">
            <CandlestickChart 
              symbol={subscription.trading_pairs?.[0] || 'X:BTCUSD'} 
              trades={trades}
            />
          </div>

          {/* Live Positions */}
          <div>
            <LivePositions subscription={subscription} trades={trades} />
          </div>
        </div>

        {/* Trade History */}
        <div className="mt-6">
          <TradeHistory trades={trades} />
        </div>
      </div>
    </div>
  );
}