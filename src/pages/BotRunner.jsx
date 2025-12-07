import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Play, Pause, ArrowLeft } from 'lucide-react';
import { useBotEngine } from '@/components/bots/BotEngine';
import ProfitChart from '@/components/bots/ProfitChart';
import LiveStats from '@/components/bots/LiveStats';
import ProfitCalculator from '@/components/bots/ProfitCalculator';
import TradeHistory from '@/components/bots/TradeHistory';
import { createPageUrl } from './utils';

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
    refetchInterval: 2000 // Refresh every 2 seconds
  });

  const { isRunning, setIsRunning, elapsedSeconds, currentProfit } = useBotEngine(subscription);

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
              <p className="text-slate-400">{bot.strategy} strategy • {bot.risk_level} risk</p>
            </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <ProfitChart trades={trades} />
          </div>
          <div>
            <ProfitCalculator bot={bot} />
          </div>
        </div>

        {/* Trade History */}
        <TradeHistory trades={trades} />
      </div>
    </div>
  );
}