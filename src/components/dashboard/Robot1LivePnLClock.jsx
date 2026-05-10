import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Robot1LivePnLClock() {
  const [sessionStart] = useState(() => new Date());

  const { data: verifiedTrades = [], isLoading } = useQuery({
    queryKey: ['robot1-verified-pnl'],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.list();
      return all
        .filter(t => t.robotId === 'robot1' && t.status === 'closed')
        .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());
    },
    staleTime: 5000,
    refetchInterval: 5000
  });

  // Calculate session metrics
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
  const sessionTrades = todaysTrades;
  
  const netPnL = sessionTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const totalFees = sessionTrades.reduce((s, t) => s + (t.sellFee || 0), 0);
  const sessionDuration = sessionTrades.length > 0 
    ? (new Date(sessionTrades[0].sellTime).getTime() - new Date(sessionTrades[sessionTrades.length - 1].buyTime).getTime()) / 1000
    : 0;
  
  const avgHoldTime = sessionTrades.length > 0
    ? sessionTrades.reduce((s, t) => s + (t.holdingMs || 0), 0) / sessionTrades.length / 1000
    : 0;
  
  const pnlPerSec = sessionDuration > 0 ? netPnL / (sessionDuration / 60 / 60) : 0;
  const pnlPerMin = sessionDuration > 0 ? netPnL / (sessionDuration / 60) : 0;

  const lastTrade = sessionTrades[0];
  const wins = sessionTrades.filter(t => t.realizedPnL > 0).length;
  const losses = sessionTrades.filter(t => t.realizedPnL < 0).length;
  const breakeven = sessionTrades.filter(t => t.realizedPnL === 0).length;

  if (isLoading) {
    return <Skeleton className="h-48 bg-slate-800" />;
  }

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 border border-slate-700 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h2 className="font-bold text-lg">Live P&L Clock</h2>
        <span className="ml-auto text-xs text-slate-500">{sessionTrades.length} trades today</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Session P&L */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Session P&L</div>
          <div className={`text-2xl font-bold font-mono ${netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {netPnL >= 0 ? '+' : ''}{netPnL.toFixed(4)} USDT
          </div>
        </div>

        {/* P&L/sec */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">P&L/Hour</div>
          <div className={`text-xl font-bold font-mono ${pnlPerSec >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnlPerSec >= 0 ? '+' : ''}{pnlPerSec.toFixed(2)} USDT
          </div>
        </div>

        {/* P&L/min */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">P&L/Minute</div>
          <div className={`text-xl font-bold font-mono ${pnlPerMin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnlPerMin >= 0 ? '+' : ''}{pnlPerMin.toFixed(3)} USDT
          </div>
        </div>

        {/* Avg Hold Time */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Avg Hold Time</div>
          <div className="text-lg font-mono text-cyan-400">
            {avgHoldTime.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Win/Loss Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
          <div className="text-xs text-emerald-400 mb-1">Wins</div>
          <div className="text-xl font-bold text-emerald-300">{wins}</div>
        </div>
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
          <div className="text-xs text-red-400 mb-1">Losses</div>
          <div className="text-xl font-bold text-red-300">{losses}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-1">Break-even</div>
          <div className="text-xl font-bold text-slate-300">{breakeven}</div>
        </div>
      </div>

      {/* Last Trade */}
      {lastTrade && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="text-xs text-slate-400 mb-2">Last Trade</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Pair</div>
              <div className="font-mono font-bold text-white">{lastTrade.instId}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">BUY ordId</div>
              <div className="font-mono text-xs text-cyan-400">…{lastTrade.buyOrdId?.slice(-6)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">SELL ordId</div>
              <div className="font-mono text-xs text-red-400">…{lastTrade.sellOrdId?.slice(-6)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">P&L</div>
              <div className={`font-mono font-bold ${lastTrade.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {lastTrade.realizedPnL >= 0 ? '+' : ''}{lastTrade.realizedPnL?.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10-Trade Report Threshold */}
      {sessionTrades.length >= 10 && (
        <div className="mt-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
          <div className="text-sm font-bold text-yellow-400">✓ 10+ Verified Cycles Complete</div>
          <div className="text-xs text-yellow-200 mt-1">
            Total Cycles: {sessionTrades.length} | Net P&L: {netPnL >= 0 ? '+' : ''}{netPnL.toFixed(4)} USDT | Total Fees: {totalFees.toFixed(4)} USDT | Best Pair: {
              sessionTrades.length > 0 
                ? Object.entries(
                    sessionTrades.reduce((acc, t) => {
                      acc[t.instId] = (acc[t.instId] || 0) + (t.realizedPnL || 0);
                      return acc;
                    }, {})
                  ).sort((a, b) => b[1] - a[1])[0][0]
                : '—'
            }
          </div>
        </div>
      )}
    </div>
  );
}