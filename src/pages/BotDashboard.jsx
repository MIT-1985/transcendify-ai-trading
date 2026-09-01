import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Bot,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Activity,
  TrendingUp,
  Cpu,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import LiveRobotFeed from '@/components/bots/LiveRobotFeed';

// ── Robot status card (one per real robot) ─────────────────────────────────────
function RobotCard({ robot }) {
  const { name, phase, status, statusColor, icon: Icon, metrics, locked, linkTo } = robot;
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-400" />
            {name}
          </CardTitle>
          <div className="flex items-center gap-2">
            {locked && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                <Lock className="w-3 h-3" /> LOCKED
              </span>
            )}
            <Badge className={statusColor} variant="outline">{status}</Badge>
          </div>
        </div>
        <div className="text-sm text-slate-400">{phase}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">{m.label}</div>
              <div className={`text-lg font-bold ${m.color || 'text-white'}`}>{m.value}</div>
            </div>
          ))}
        </div>
        {linkTo && (
          <Link to={linkTo} className="block">
            <span className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
              Открыть детайли →
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default function BotDashboard() {
  // ── System trail = single source of truth for both robots ────────────────
  const { data: trail = {}, isLoading } = useQuery({
    queryKey: ['bot-dashboard-system-trail'],
    queryFn: async () => {
      const res = await base44.functions.invoke('systemTrailTradingState', {});
      return res.data || {};
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // ── Phase 5 open trade + preflight ────────────────────────────────────────
  const { data: phase5Open = {} } = useQuery({
    queryKey: ['bot-dashboard-phase5-open'],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase5GetOpenTrade', {});
      return res.data || {};
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const live = trail.liveStatus || {};
  const safety = trail.safety || {};
  const config = trail.config || {};
  const lastPrice = live.lastPrice || 0;
  const totalScore = live.totalScore || 0;
  const requiredScore = live.requiredScore || 75;
  const openTrades = live.openBTCTrades || 0;

  // ── Robot 1: Phase 4F (paper, active) ─────────────────────────────────────
  const robot4F = {
    name: 'Robot 1 — Paper Trading',
    phase: 'PHASE 4F · BTC-USDT only · Economic paper mode',
    status: openTrades > 0 ? 'OPEN POSITION' : 'SCANNING',
    statusColor: openTrades > 0
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Bot,
    locked: false,
    linkTo: '/PaperTradingDashboard',
    metrics: [
      { label: 'BTC цена', value: lastPrice ? `$${lastPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}` : '—' },
      { label: 'Сигнал', value: live.alertLevel || 'COLD' },
      { label: 'Score', value: `${totalScore}/${requiredScore}`, color: totalScore >= requiredScore ? 'text-emerald-400' : 'text-slate-300' },
      { label: 'Отворени', value: String(openTrades) },
    ],
  };

  // ── Robot 2: Phase 5 (real test, locked) ───────────────────────────────────
  const robot5 = {
    name: 'Robot 2 — Real Test (Phase 5)',
    phase: 'PHASE 5 · Manual confirm · BTC-USDT',
    status: phase5Open.hasOpenTrade ? 'OPEN TRADE' : (safety.realTradeAllowed ? 'READY' : 'BLOCKED'),
    statusColor: phase5Open.hasOpenTrade
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : safety.realTradeAllowed
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        : 'bg-red-500/20 text-red-300 border-red-500/30',
    icon: Cpu,
    locked: !safety.realTradeAllowed,
    linkTo: '/Phase5RealTestMode',
    metrics: [
      { label: 'Guard', value: trail.phase5GuardStatus || 'LOCKED', color: (trail.phase5GuardStatus || 'LOCKED') === 'LOCKED' ? 'text-amber-400' : 'text-emerald-400' },
      { label: 'Open trades', value: String(phase5Open.openCount || 0) },
      { label: 'Max size', value: `$${config.maxOpenTrades ? 10 : 10}` },
      { label: 'TP/SL', value: `+${config.tpPercent || 1.3}% / -${config.slPercent || 0.65}%` },
    ],
  };

  // ── Kill switch banner ────────────────────────────────────────────────────
  const killActive = safety.killSwitchActive;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        <div className="text-slate-400">Зареждане на роботи…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Bot className="w-8 h-8 text-blue-400" />
            Търговски роботи
          </h1>
          <p className="text-slate-400">
            Реални роботи · Phase 4F (paper) + Phase 5 (real test, locked)
          </p>
        </div>

        {/* Safety banner */}
        <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${
          killActive
            ? 'border-emerald-600 bg-emerald-950/30'
            : 'border-red-600 bg-red-950/30'
        }`}>
          {killActive ? (
            <ShieldCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="font-bold text-sm">
              {killActive ? 'Kill Switch Активен — безопасност гарантирана' : '⚠️ Kill Switch ИЗКЛЮЧЕН'}
            </div>
            <div className="text-xs text-slate-400">
              {killActive
                ? `Реална търговия блокирана · ${live.mainBlockingReason || 'чака сигнал'}`
                : 'ВНИМАНИЕ: реални поръчки са разрешени'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Активен режим</div>
            <div className="text-sm font-bold text-white">{trail.activeMode || 'PHASE_4F'}</div>
          </div>
        </div>

        {/* Robots grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RobotCard robot={robot4F} />
          <RobotCard robot={robot5} />
        </div>

        {/* Live market snapshot */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Пазарен статус (BTC-USDT)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Цена</div>
                <div className="text-lg font-bold text-white">
                  {lastPrice ? `$${lastPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}` : '—'}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Alert</div>
                <div className="text-lg font-bold text-white">{live.alertLevel || 'COLD'}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Препоръка</div>
                <div className={`text-lg font-bold ${live.recommendedAction === 'BUY' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {live.recommendedAction || 'WAIT'}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Blocker</div>
                <div className="text-sm font-bold text-slate-300">{live.mainBlockingReason || '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Живият поток - клиентът вижда решенията, докато се вземат,
            включително когато роботът отказва да търгува. */}
        <div className="mt-6">
          <LiveRobotFeed />
        </div>

      </div>
    </div>
  );
}