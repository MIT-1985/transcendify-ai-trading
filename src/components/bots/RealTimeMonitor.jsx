import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function RealTimeMonitor({ subscription, trades, isRunning }) {
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState({
    currentStreak: 0,
    streakType: null,
    largestWin: 0,
    largestLoss: 0,
    recentProfit: 0
  });

  useEffect(() => {
    if (!trades || trades.length === 0) return;

    const recentTrades = trades.slice(0, 20);
    const alertSettings = subscription?.alert_settings || {};

    // Calculate current streak
    let streak = 0;
    let streakType = null;
    for (let i = 0; i < recentTrades.length; i++) {
      const isWin = recentTrades[i].profit_loss > 0;
      if (i === 0) {
        streak = 1;
        streakType = isWin ? 'win' : 'loss';
      } else {
        const prevIsWin = recentTrades[i - 1].profit_loss > 0;
        if (isWin === prevIsWin) {
          streak++;
        } else {
          break;
        }
      }
    }

    // Find largest win/loss
    const largestWin = Math.max(...recentTrades.map(t => t.profit_loss), 0);
    const largestLoss = Math.min(...recentTrades.map(t => t.profit_loss), 0);
    const recentProfit = recentTrades.slice(0, 10).reduce((sum, t) => sum + t.profit_loss, 0);

    setMetrics({ currentStreak: streak, streakType, largestWin, largestLoss, recentProfit });

    // Check for alerts
    const newAlerts = [];

    // High profit alert
    if (alertSettings.high_profit_enabled && largestWin >= alertSettings.high_profit_threshold) {
      newAlerts.push({
        type: 'success',
        message: `High profit achieved: $${largestWin.toFixed(2)}`,
        icon: TrendingUp
      });
    }

    // Large loss alert
    if (alertSettings.large_loss_enabled && Math.abs(largestLoss) >= alertSettings.large_loss_threshold) {
      newAlerts.push({
        type: 'error',
        message: `Large loss detected: $${largestLoss.toFixed(2)}`,
        icon: TrendingDown
      });
    }

    // Win streak alert
    if (alertSettings.win_streak_enabled && streakType === 'win' && streak >= alertSettings.win_streak_count) {
      newAlerts.push({
        type: 'success',
        message: `Win streak of ${streak} trades!`,
        icon: TrendingUp
      });
    }

    // Loss streak alert
    if (alertSettings.loss_streak_enabled && streakType === 'loss' && streak >= alertSettings.loss_streak_count) {
      newAlerts.push({
        type: 'warning',
        message: `Loss streak of ${streak} trades`,
        icon: AlertCircle
      });
    }

    // Show new alerts
    newAlerts.forEach(alert => {
      if (!alerts.some(a => a.message === alert.message)) {
        if (alert.type === 'success') toast.success(alert.message);
        else if (alert.type === 'error') toast.error(alert.message);
        else toast.warning(alert.message);
      }
    });

    setAlerts(newAlerts);
  }, [trades, subscription]);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Real-Time Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
          <span className="text-slate-400">Bot Status</span>
          <Badge className={isRunning ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
            {isRunning ? 'Running' : 'Stopped'}
          </Badge>
        </div>

        {/* Current Streak */}
        {metrics.currentStreak > 0 && (
          <div className={`p-3 rounded-lg ${
            metrics.streakType === 'win' 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {metrics.streakType === 'win' ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className={metrics.streakType === 'win' ? 'text-green-300' : 'text-red-300'}>
                Current {metrics.streakType} streak: {metrics.currentStreak} trades
              </span>
            </div>
          </div>
        )}

        {/* Recent Performance */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Largest Win</div>
            <div className="text-lg font-bold text-green-400">
              ${metrics.largestWin.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Largest Loss</div>
            <div className="text-lg font-bold text-red-400">
              ${metrics.largestLoss.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Recent Profit (last 10 trades) */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Last 10 Trades P&L</div>
          <div className={`text-xl font-bold ${metrics.recentProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {metrics.recentProfit >= 0 ? '+' : ''}${metrics.recentProfit.toFixed(2)}
          </div>
        </div>

        {/* Active Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-slate-400">Active Alerts</div>
            {alerts.map((alert, idx) => {
              const Icon = alert.icon;
              return (
                <div 
                  key={idx}
                  className={`p-2 rounded-lg flex items-center gap-2 text-sm ${
                    alert.type === 'success' ? 'bg-green-500/10 text-green-300' :
                    alert.type === 'error' ? 'bg-red-500/10 text-red-300' :
                    'bg-yellow-500/10 text-yellow-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {alert.message}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}