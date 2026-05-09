import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RealTimeEarnings({ subscriptions = [] }) {
  const [sessionStart] = useState(Date.now());
  const [tick, setTick] = useState(0);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');

  // Use total_profit and total_trades from subscriptions directly (real OKX data)
  const totalEarnings = activeSubscriptions.reduce((sum, sub) => sum + (sub.total_profit || 0), 0);
  const totalTrades = activeSubscriptions.reduce((sum, sub) => sum + (sub.total_trades || 0), 0);

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
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs sm:text-sm text-slate-400">Real-Time Earnings</div>
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Live • {activeBots} active bot{activeBots !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="text-xs sm:text-sm font-mono">{formatTime()}</span>
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
            <div className={`text-3xl sm:text-4xl font-bold font-mono ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ${totalEarnings >= 0 ? '+' : ''}{totalEarnings.toFixed(2)}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
          <span className="text-slate-400">
            <span className={`font-semibold ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalTrades} trades
            </span> total
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500">Per Second</div>
              <div className="text-xs sm:text-sm font-semibold text-white">
                ${(totalEarnings / (sessionTime || 1)).toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Minute</div>
              <div className="text-xs sm:text-sm font-semibold text-white">
                ${((totalEarnings / (sessionTime || 1)) * 60).toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Hour</div>
              <div className={`text-xs sm:text-sm font-semibold ${totalEarnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ${((totalEarnings / (sessionTime || 1)) * 3600).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}