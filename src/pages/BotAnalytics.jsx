import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Target, Award, AlertCircle } from 'lucide-react';
import { createPageUrl } from '../utils';
import PerformanceMetrics from '@/components/analytics/PerformanceMetrics';
import EquityChart from '@/components/analytics/EquityChart';
import OpenPositions from '@/components/analytics/OpenPositions';
import TradeBreakdown from '@/components/analytics/TradeBreakdown';
import IndicatorPerformance from '@/components/analytics/IndicatorPerformance';
import BotHealthScore from '@/components/analytics/BotHealthScore';

export default function BotAnalytics() {
  const subscriptionId = new URLSearchParams(window.location.search).get('id');
  const [timeframe, setTimeframe] = useState('24h');

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
    refetchInterval: 5000
  });

  if (!subscription || !bot) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-white">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = createPageUrl('BotRunner') + '?id=' + subscriptionId}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{bot.name} Analytics</h1>
              <p className="text-slate-400">{bot.strategy} • Detailed Performance Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {['1h', '24h', '7d', '30d', 'all'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <PerformanceMetrics subscription={subscription} trades={trades} timeframe={timeframe} />

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <EquityChart trades={trades} initialCapital={subscription.capital_allocated || 1000} />
          </div>
          <div>
            <BotHealthScore trades={trades} subscription={subscription} />
          </div>
        </div>

        {/* Positions and Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <OpenPositions subscription={subscription} trades={trades} />
          <TradeBreakdown trades={trades} />
        </div>

        {/* Indicator Performance */}
        <IndicatorPerformance trades={trades} />
      </div>
    </div>
  );
}