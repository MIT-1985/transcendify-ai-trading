import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

// ── Live BTC price ticker — fetches OKX public endpoint every 2s ──────────────
function useLiveBtcPrice() {
  const [price, setPrice] = useState(null);
  const [prevPrice, setPrevPrice] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchPrice = async () => {
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
        const d = await r.json();
        if (active && d?.data?.[0]?.last) {
          setPrevPrice(price);
          setPrice(parseFloat(d.data[0].last));
        }
      } catch (_) {}
    };
    fetchPrice();
    const t = setInterval(fetchPrice, 2000);
    return () => { active = false; clearInterval(t); };
  }, [price]);

  const change = price && prevPrice ? price - prevPrice : 0;
  return { price, prevPrice, change, isUp: change >= 0 };
}

// ── Live accumulation clock ────────────────────────────────────────────────────
function AccumulationClock({ totalPnL, equity, trades, btcPrice }) {
  const [now, setNow] = useState(new Date());
  const [displayPnL, setDisplayPnL] = useState(totalPnL);
  const pnlRef = useRef(totalPnL);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Animate P&L counter smoothly when value changes
  useEffect(() => {
    const start = pnlRef.current;
    const end = totalPnL;
    const diff = end - start;
    if (Math.abs(diff) < 0.0001) return;
    let frame = 0;
    const totalFrames = 20;
    const anim = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const val = start + diff * progress;
      setDisplayPnL(val);
      if (frame >= totalFrames) {
        clearInterval(anim);
        pnlRef.current = end;
        setDisplayPnL(end);
      }
    }, 50);
    return () => clearInterval(anim);
  }, [totalPnL]);

  const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length;
  const losses = trades.filter(t => (t.realizedPnL || 0) < 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0.0';
  const pnlColor = displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400';
  const pnlSign = displayPnL >= 0 ? '+' : '';

  return (
    <div className="rounded-2xl border-2 border-emerald-700 bg-gradient-to-br from-emerald-950/30 to-slate-950/50 p-5 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Live Accumulation</span>
        </div>
        <span className="text-sm font-mono text-slate-400">{now.toLocaleTimeString('de-DE')}</span>
      </div>

      {/* Big P&L counter */}
      <div className="mb-5">
        <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Net Profit (USDT)</div>
        <div className={`text-5xl lg:text-6xl font-black ${pnlColor} tabular-nums`}>
          {pnlSign}{displayPnL.toFixed(4)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">OKX Equity</div>
          <div className="text-xl font-black text-emerald-400">${equity.toFixed(2)}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">BTC Price</div>
          <div className="text-xl font-black text-white">${btcPrice ? btcPrice.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '...'}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Win Rate</div>
          <div className={`text-xl font-black ${parseFloat(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate}%</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">W / L</div>
          <div className="text-xl font-black text-white">{wins} / {losses}</div>
        </div>
      </div>
    </div>
  );
}

// ── Live BTC price card ────────────────────────────────────────────────────────
function LiveBtcCard({ price, prevPrice, isUp }) {
  const flash = price && prevPrice ? (isUp ? 'text-emerald-400' : 'text-red-400') : 'text-white';
  return (
    <div className="rounded-2xl border-2 border-yellow-700 bg-yellow-950/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">₿</span>
          <span className="text-xs font-black text-yellow-400 uppercase tracking-widest">BTC-USDT Live</span>
        </div>
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
      </div>
      <div className="text-4xl font-black text-white tabular-nums">
        ${price ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '...'}
      </div>
      {prevPrice && (
        <div className={`text-sm font-mono mt-1 ${flash}`}>
          {isUp ? '▲' : '▼'} ${Math.abs(price - prevPrice).toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ── Robot status card ──────────────────────────────────────────────────────────
function RobotStatusCard({ execLog }) {
  if (!execLog?.execution_time) {
    return (
      <div className="bg-slate-900/60 border border-blue-800 rounded-xl p-5">
        <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">🤖 Robot1 Status</div>
        <div className="text-slate-400 text-sm">No execution yet.</div>
      </div>
    );
  }
  const decision = execLog.decision || '—';
  const decColor = decision === 'BUY' ? 'text-emerald-400' : decision === 'SELL' ? 'text-red-400' : decision === 'ERROR' ? 'text-red-500' : 'text-slate-300';

  return (
    <div className="bg-slate-900/60 border border-blue-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-blue-400 uppercase tracking-widest">🤖 Robot1 Status</div>
        <span className="text-xs text-slate-500">{new Date(execLog.execution_time).toLocaleTimeString('de-DE')}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Decision</div>
          <div className={`text-lg font-black ${decColor}`}>{decision}</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">OKX</div>
          <div className={`text-lg font-black ${execLog.okx_status === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>{execLog.okx_status || '—'}</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Polygon</div>
          <div className={`text-lg font-black ${execLog.polygon_status === 'OK' ? 'text-emerald-400' : 'text-yellow-400'}`}>{execLog.polygon_status || '—'}</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Free USDT</div>
          <div className="text-lg font-black text-white">{parseFloat(execLog.free_usdt || 0).toFixed(2)}</div>
        </div>
      </div>
      {execLog.reason && (
        <div className="mt-3 bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-xs text-slate-300">{execLog.reason}</div>
      )}
    </div>
  );
}

// ── Recent trades list ─────────────────────────────────────────────────────────
function RecentTrades({ trades }) {
  const recent = [...trades].sort((a, b) => new Date(b.sellTime || b.buyTime || 0).getTime() - new Date(a.sellTime || a.buyTime || 0).getTime()).slice(0, 8);
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Recent Trades</div>
      {recent.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">No trades yet. Robot is scanning for profitable setups…</div>
      ) : (
        <div className="space-y-2">
          {recent.map((t, i) => {
            const pnl = t.realizedPnL || 0;
            const pnlClr = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
            return (
              <div key={t.id || i} className="flex items-center justify-between bg-slate-900/70 rounded-lg p-3 border border-slate-700 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">{t.instId || 'BTC-USDT'}</span>
                  <span className="text-slate-500">{t.sellTime ? new Date(t.sellTime).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div className={`font-black ${pnlClr}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} USDT
                </div>
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
  const { price, prevPrice, isUp } = useLiveBtcPrice();

  // OKX Live Balance — refresh every 5s
  const { data: balance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['dashboard-okx-balance', user?.email],
    queryFn: async () => { const r = await base44.functions.invoke('okxLiveBalance', {}); return r.data || {}; },
    enabled: !!user, staleTime: 0, refetchInterval: 5000, gcTime: 0
  });

  // All VerifiedTrades — refresh every 5s
  const { data: allTrades = [], isLoading: loadTrades } = useQuery({
    queryKey: ['dashboard-all-trades', user?.email],
    queryFn: async () => base44.asServiceRole.entities.VerifiedTrade.list(),
    enabled: !!user, staleTime: 0, refetchInterval: 5000, gcTime: 0
  });

  // Robot1 Execution Log — refresh every 3s
  const { data: execLog = {}, isLoading: loadExec } = useQuery({
    queryKey: ['dashboard-exec-log', user?.email],
    queryFn: async () => { const l = await base44.asServiceRole.entities.Robot1ExecutionLog.list('-execution_time', 1); return l[0] || {}; },
    enabled: !!user, staleTime: 0, refetchInterval: 3000, gcTime: 0
  });

  const totalPnL = allTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const equity = parseFloat(balance?.totalEquityUSDT || balance?.totalEquity || 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Trading
            </h1>
            <p className="text-slate-400 text-xs mt-1">BTC-USDT · Real-time · OKX + Polygon + AI</p>
          </div>
          <div className="flex gap-2">
            <Link to="/SignalDashboard" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-700/30 border border-blue-700 hover:bg-blue-700/50 text-blue-300 transition-all">📡 Signals</Link>
            <Link to="/Transactions" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-700/30 border border-slate-700 hover:bg-slate-700/50 text-slate-300 transition-all">📒 Trades</Link>
          </div>
        </div>

        {/* Accumulation + BTC price side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {loadTrades ? <Skeleton className="h-56 bg-slate-800 rounded-2xl" /> : <AccumulationClock totalPnL={totalPnL} equity={equity} trades={allTrades} btcPrice={price} />}
          </div>
          <div>
            <LiveBtcCard price={price} prevPrice={prevPrice} isUp={isUp} />
          </div>
        </div>

        {/* OKX balance strip */}
        <div className={`rounded-xl border-2 p-4 ${balance?.success !== false ? 'border-emerald-700/50 bg-emerald-950/10' : 'border-red-700/50 bg-red-950/10'}`}>
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">OKX Balance</div>
          {loadBalance ? <Skeleton className="h-16 bg-slate-800" /> : (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                <div className="text-slate-400 mb-1">Total Equity</div>
                <div className="text-xl font-black text-emerald-400">${equity.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                <div className="text-slate-400 mb-1">Available</div>
                <div className="text-xl font-black text-white">${parseFloat(balance?.availableUSDT || 0).toFixed(2)}</div>
              </div>
              <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                <div className="text-slate-400 mb-1">Frozen</div>
                <div className="text-xl font-black text-yellow-400">${parseFloat(balance?.frozenUSDT || 0).toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Robot status */}
        {loadExec ? <Skeleton className="h-32 bg-slate-800 rounded-xl" /> : <RobotStatusCard execLog={execLog} />}

        {/* Recent trades */}
        <RecentTrades trades={allTrades} />

      </div>
    </div>
  );
}