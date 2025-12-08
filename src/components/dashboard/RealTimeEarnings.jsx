import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

export default function RealTimeEarnings({ subscriptions = [] }) {
  const [sessionStart] = useState(Date.now());
  const [tick, setTick] = useState(0);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');

  // Fetch all trades for active subscriptions
  const { data: allTrades = [] } = useQuery({
    queryKey: ['dashboard-trades', activeSubscriptions.map(s => s.id).join(',')],
    queryFn: async () => {
      if (activeSubscriptions.length === 0) return [];
      
      const tradePromises = activeSubscriptions.map(sub =>
        base44.entities.Trade.filter({ subscription_id: sub.id })
      );
      const results = await Promise.all(tradePromises);
      return results.flat();
    },
    enabled: activeSubscriptions.length > 0,
    refetchInterval: 1000
  });

  // Calculate real earnings from trades
  const sessionTrades = allTrades.filter(trade => {
    const tradeTime = new Date(trade.timestamp || trade.created_date).getTime();
    return tradeTime >= sessionStart;
  });

  const totalEarnings = sessionTrades.reduce((sum, trade) => sum + (trade.profit_loss || 0), 0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const sessionTime = Math.floor((Date.now() - sessionStart) / 1000);
  const hours = Math.floor(sessionTime / 3600);
  const minutes = Math.floor((sessionTime % 3600) / 60);
  const seconds = sessionTime % 60;

  const formatTime = () => {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const activeBots = subscriptions.filter(s => s.status === 'active').length;

  return (
    <Card className="bg-gradient-to-br from-emerald-900/20 to-green-900/20 border-emerald-500/30">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm text-slate-400">Real-Time Earnings</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Live • {activeBots} active bot{activeBots !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-mono">{formatTime()}</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${tick}-${totalEarnings.toFixed(2)}`}
            initial={{ scale: 1.05, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-3"
          >
            <div className={`text-4xl font-bold font-mono ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ${totalEarnings >= 0 ? '+' : ''}{totalEarnings.toFixed(2)}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">
            <span className={`font-semibold ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {sessionTrades.length} trades
            </span> this session
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500">Per Second</div>
              <div className="text-sm font-semibold text-white">
                ${(totalEarnings / (sessionTime || 1)).toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Minute</div>
              <div className="text-sm font-semibold text-white">
                ${((totalEarnings / (sessionTime || 1)) * 60).toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Hour</div>
              <div className={`text-sm font-semibold ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${((totalEarnings / (sessionTime || 1)) * 3600).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}