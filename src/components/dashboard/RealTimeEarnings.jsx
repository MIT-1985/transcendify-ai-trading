import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RealTimeEarnings({ subscriptions = [] }) {
  const [earnings, setEarnings] = useState(0);
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Calculate earnings per second based on active bots
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    
    if (activeSubscriptions.length === 0) {
      setEarnings(0);
      return;
    }

    // Simulate earnings: ~$0.01-$0.05 per second per active bot
    const earningsPerSecond = activeSubscriptions.length * (0.01 + Math.random() * 0.04);
    
    const interval = setInterval(() => {
      setEarnings(prev => prev + earningsPerSecond);
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [subscriptions]);

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
            key={tick}
            initial={{ scale: 1.05, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mb-3"
          >
            <div className="text-4xl font-bold text-emerald-400 font-mono">
              ${earnings.toFixed(2)}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">
            Earning <span className="text-emerald-400 font-semibold">
              ${((earnings / (sessionTime || 1)) * 3600).toFixed(2)}/hr
            </span>
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500">Per Second</div>
              <div className="text-sm font-semibold text-white">
                ${(earnings / (sessionTime || 1)).toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Minute</div>
              <div className="text-sm font-semibold text-white">
                ${((earnings / (sessionTime || 1)) * 60).toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Per Hour</div>
              <div className="text-sm font-semibold text-emerald-400">
                ${((earnings / (sessionTime || 1)) * 3600).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}