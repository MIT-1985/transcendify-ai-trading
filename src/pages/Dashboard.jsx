import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import DiscordTradeNotifier from '@/components/dashboard/DiscordTradeNotifier';
import { ClaudeSignalIndicator, AutoManualToggle, TrokEpochPanel, FeeBreakdownRow } from '@/components/dashboard/ClaudeSignalPanel';

// ── OKX WebSocket — real-time BTC-USDT tick data ──────────────────────────────
function useOkxWebSocket() {
  const [tick, setTick] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let reconnectTimer = null;
    let active = true;

    const connect = () => {
      const ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'tickers', instId: 'BTC-USDT' }] }));
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.arg?.channel === 'tickers' && msg.data?.[0]) {
            const d = msg.data[0];
            setTick(prev => ({
              ...prev,
              last: parseFloat(d.last),
              open24h: parseFloat(d.open24h),
              high24h: parseFloat(d.high24h),
              low24h: parseFloat(d.low24h),
              vol24h: parseFloat(d.vol24h),
              ts: parseInt(d.ts),
              changePct: parseFloat(d.last) && parseFloat(d.open24h)
                ? ((parseFloat(d.last) - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100
                : 0,
            }));
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => { ws.close(); };
    };

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { tick, connected };
}

// ── Balance + Profit Hero — the two focal points ──────────────────────────────
function BalanceProfitHero({ equity, available, totalPnL, tradeCount, tick, loading, connected }) {
  const [now, setNow] = useState(new Date());
  const [displayPnL, setDisplayPnL] = useState(totalPnL);
  const pnlRef = useRef(totalPnL);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Smooth P&L animation
  useEffect(() => {
    const start = pnlRef.current;
    const end = totalPnL;
    const diff = end - start;
    if (Math.abs(diff) < 0.00001) return;
    let frame = 0;
    const anim = setInterval(() => {
      frame++;
      const val = start + diff * (frame / 30);
      setDisplayPnL(val);
      if (frame >= 30) {
        clearInterval(anim);
        pnlRef.current = end;
        setDisplayPnL(end);
      }
    }, 33);
    return () => clearInterval(anim);
  }, [totalPnL]);

  const btcPrice = tick?.last;
  const changePct = tick?.changePct ?? 0;
  const btcValue = btcPrice && equity ? equity / btcPrice : 0;
  const pnlPositive = displayPnL >= 0;

  if (loading) {
    return <Skeleton className="h-80 bg-slate-800 rounded-2xl" />;
  }

  return (
    <div className="space-y-4">
      {/* ── BALANCE — focal point #1 ────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 ${connected ? 'border-emerald-600' : 'border-slate-700'} bg-gradient-to-br from-slate-900 to-slate-950 p-6 lg:p-8`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
            <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">OKX Saldo</span>
          </div>
          <span className="text-sm font-mono text-slate-500">{now.toLocaleTimeString('de-DE')}</span>
        </div>

        {/* Big equity number */}
        <div className="mb-5">
          <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Текущо салдо (USDT)</div>
          <div className="text-6xl lg:text-7xl font-black text-emerald-400 tabular-nums">
            ${equity.toFixed(2)}
          </div>
        </div>

        {/* Sub-metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Свободно</div>
            <div className="text-lg font-black text-white">${available.toFixed(2)}</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">BTC цена</div>
            <div className="text-lg font-black text-white">{btcPrice ? `$${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '...'}</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">В BTC</div>
            <div className="text-lg font-black text-white">{btcValue ? btcValue.toFixed(6) : '—'}</div>
          </div>
        </div>
      </div>

      {/* ── PROFIT — focal point #2 ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 ${pnlPositive ? 'border-emerald-600' : 'border-red-600'} bg-gradient-to-br ${pnlPositive ? 'from-emerald-950/40 to-slate-950' : 'from-red-950/40 to-slate-950'} p-6 lg:p-8`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${pnlPositive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400 animate-pulse'}`}></span>
            <span className={`text-xs font-black uppercase tracking-widest ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>Печалба в реално време</span>
          </div>
          <span className={`text-xs font-mono ${connected ? 'text-emerald-400' : 'text-red-400'}`}>{connected ? '● LIVE' : '● OFFLINE'}</span>
        </div>

        {/* Big profit number */}
        <div className="mb-5">
          <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Натрупана нетна печалба (USDT)</div>
          <div className={`text-6xl lg:text-7xl font-black tabular-nums ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnlPositive ? '+' : ''}{displayPnL.toFixed(4)}
          </div>
        </div>

        {/* Sub-metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Сделки</div>
            <div className="text-lg font-black text-white">{tradeCount}</div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">BTC 24h</div>
            <div className={`text-lg font-black ${changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {changePct !== 0 ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
            </div>
          </div>
          <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Статус</div>
            <div className={`text-lg font-black ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnlPositive ? '🛡️ Защита Активна' : '🚨 Стоп'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recent profit trail — shows profit movement history ────────────────────────
function ProfitTrail({ trades }) {
  const recent = [...trades]
    .sort((a, b) => new Date(b.sellTime || b.buyTime || 0).getTime() - new Date(a.sellTime || a.buyTime || 0).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Движение на печалбата · Последни 5</div>
      {recent.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-6">Все още няма сделки — ботът сканира за печеливши сетове…</div>
      ) : (
        <div className="space-y-2">
          {recent.map((t, i) => {
            const pnl = t.realizedPnL || 0;
            const clr = pnl >= 0 ? 'text-emerald-400 border-emerald-800/50' : 'text-red-400 border-red-800/50';
            return (
              <div key={t.id || i} className={`flex items-center justify-between bg-slate-900/70 rounded-lg p-3 border ${clr}`}>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-white">{t.instId || 'BTC-USDT'}</span>
                  <span className="text-slate-500">{t.sellTime ? new Date(t.sellTime).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div className={`font-black text-sm ${clr.split(' ')[0]}`}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} USDT</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { tick, connected } = useOkxWebSocket();
  const queryClient = useQueryClient();
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem('autoMode') === 'true');
  const [executing, setExecuting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // ── Latest Claude signal ────────────────────────────────────────
  const { data: claudeSignal, isLoading: loadingSignal } = useQuery({
    queryKey: ['dashboard-claude-signal'],
    queryFn: async () => {
      const signals = await base44.entities.SignalSnapshot.list('-created_date', 10);
      return signals.find(s => s.mode === 'CLAUDE_ENGINE') || null;
    },
    enabled: !!user, refetchInterval: 10000, staleTime: 5000,
  });

  // ── TROK constants ──────────────────────────────────────────────
  const { data: trokConstants } = useQuery({
    queryKey: ['dashboard-trok-constants'],
    queryFn: async () => {
      const list = await base44.entities.OptimizingConstants.list('-created_date', 10);
      return list.filter(c => c.botId === 'robot1')[0] || list[0] || null;
    },
    enabled: !!user, refetchInterval: 30000, staleTime: 15000,
  });

  // ── Auto mode toggle ────────────────────────────────────────────
  const handleToggleAuto = async () => {
    const newVal = !autoMode;
    setAutoMode(newVal);
    localStorage.setItem('autoMode', String(newVal));
    try {
      await base44.functions.invoke('setAutoMode', { enabled: newVal });
      queryClient.invalidateQueries({ queryKey: ['dashboard-claude-signal'] });
    } catch (e) {
      // revert on error
      setAutoMode(!newVal);
      localStorage.setItem('autoMode', String(!newVal));
    }
  };

  // ── Execute auto trade ──────────────────────────────────────────
  const handleExecuteAuto = async () => {
    setExecuting(true);
    try {
      await base44.functions.invoke('phase5AutoExecute', {});
      queryClient.invalidateQueries({ queryKey: ['dashboard-all-trades'] });
    } catch (e) {
      // error shown via toast if available
    } finally {
      setExecuting(false);
    }
  };

  // ── TROK optimize ───────────────────────────────────────────────
  const handleTrokOptimize = async () => {
    setOptimizing(true);
    try {
      await base44.functions.invoke('adaptiveConstantsEngine', { trokAutoOptimize: true });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trok-constants'] });
    } catch (e) {
    } finally {
      setOptimizing(false);
    }
  };

  // OKX ExchangeConnection — real balance from database
  const { data: okxConn = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['dashboard-okx-connection', user?.email],
    queryFn: async () => {
      const conns = await base44.entities.ExchangeConnection.filter({ exchange: 'okx' });
      return conns[0] || {};
    },
    enabled: !!user, staleTime: 0, refetchInterval: 5000, gcTime: 0
  });

  // All VerifiedTrades — real P&L directly from entity
  const { data: allTrades = [], isLoading: loadTrades } = useQuery({
    queryKey: ['dashboard-all-trades', user?.email],
    queryFn: async () => base44.entities.VerifiedTrade.list('-created_date', 200),
    enabled: !!user, staleTime: 0, refetchInterval: 5000, gcTime: 0
  });

  const totalPnL = allTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const equity = parseFloat(okxConn?.balance_usdt || 0);
  const available = parseFloat(okxConn?.balance_usdt || 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
              OKX Търговия
            </h1>
            <p className="text-slate-400 text-xs mt-1">BTC-USDT · салдо и печалба в реално време</p>
          </div>
        </div>

        {/* Discord notifications */}
        <DiscordTradeNotifier />

        {/* Claude Signal + Auto/Manual + TROK */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClaudeSignalIndicator
            signal={claudeSignal}
            loading={loadingSignal}
            onExecute={handleExecuteAuto}
            autoMode={autoMode}
            executing={executing}
          />
          <div className="space-y-4">
            <AutoManualToggle autoMode={autoMode} onToggle={handleToggleAuto} />
            <TrokEpochPanel constants={trokConstants} onOptimize={handleTrokOptimize} optimizing={optimizing} />
          </div>
        </div>

        {/* Fee breakdown */}
        <FeeBreakdownRow signal={claudeSignal} available={available} />

        {/* Balance + Profit — the two focal points */}
        <BalanceProfitHero
          equity={equity}
          available={available}
          totalPnL={totalPnL}
          tradeCount={allTrades.length}
          tick={tick}
          connected={connected}
          loading={loadBalance || loadTrades}
        />

        {/* Recent profit trail */}
        <ProfitTrail trades={allTrades} />

      </div>
    </div>
  );
}