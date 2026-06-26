import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

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
        // Subscribe to BTC-USDT ticker
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'tickers', instId: 'BTC-USDT' }]
        }));
        // Also subscribe to books for bid/ask
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'bbo-tbt', instId: 'BTC-USDT' }]
        }));
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const msg = JSON.parse(ev.data);
          // Ticker data
          if (msg.arg?.channel === 'tickers' && msg.data?.[0]) {
            const d = msg.data[0];
            setTick(prev => ({
              ...prev,
              last: parseFloat(d.last),
              lastSz: parseFloat(d.lastSz),
              bidPx: parseFloat(d.bidPx),
              bidSz: parseFloat(d.bidSz),
              askPx: parseFloat(d.askPx),
              askSz: parseFloat(d.askSz),
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
          // Best bid/offer tick-by-tick
          if (msg.arg?.channel === 'bbo-tbt' && msg.data?.[0]) {
            const d = msg.data[0];
            setTick(prev => ({
              ...prev,
              bidPx: parseFloat(d.bids?.[0]?.[0] || d.bidPx || prev?.bidPx),
              bidSz: parseFloat(d.bids?.[0]?.[1] || d.bidSz || prev?.bidSz),
              askPx: parseFloat(d.asks?.[0]?.[0] || d.askPx || prev?.askPx),
              askSz: parseFloat(d.asks?.[0]?.[1] || d.askSz || prev?.askSz),
              bboTs: parseInt(d.ts),
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

// ── Growing profit clock — connected to real OKX equity + verified trades ──────
function GrowingProfitClock({ totalPnL, equity, tradeCount, tick, protected_: isProtected }) {
  const [now, setNow] = useState(new Date());
  const [displayPnL, setDisplayPnL] = useState(totalPnL);
  const pnlRef = useRef(totalPnL);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Smooth animation when P&L changes
  useEffect(() => {
    const start = pnlRef.current;
    const end = totalPnL;
    const diff = end - start;
    if (Math.abs(diff) < 0.00001) return;
    let frame = 0;
    const totalFrames = 30;
    const anim = setInterval(() => {
      frame++;
      const val = start + diff * (frame / totalFrames);
      setDisplayPnL(val);
      if (frame >= totalFrames) {
        clearInterval(anim);
        pnlRef.current = end;
        setDisplayPnL(end);
      }
    }, 33);
    return () => clearInterval(anim);
  }, [totalPnL]);

  const pnlColor = displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400';
  const pnlSign = displayPnL >= 0 ? '+' : '';
  const protectedColor = displayPnL >= 0 ? 'border-emerald-600' : 'border-red-600';
  const bgGradient = displayPnL >= 0
    ? 'from-emerald-950/30 to-slate-950/50'
    : 'from-red-950/30 to-slate-950/50';

  const bid = tick?.bidPx;
  const ask = tick?.askPx;
  const spread = bid && ask ? ask - bid : 0;
  const spreadPct = bid && ask ? (spread / bid) * 100 : 0;

  return (
    <div className={`rounded-2xl border-2 ${protectedColor} bg-gradient-to-br ${bgGradient} p-5 lg:p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${tick ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
          <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Growing Profit</span>
        </div>
        <span className="text-sm font-mono text-slate-400">{now.toLocaleTimeString('de-DE')}</span>
      </div>

      {/* Big P&L */}
      <div className="mb-5">
        <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Net Profit (USDT)</div>
        <div className={`text-5xl lg:text-6xl font-black ${pnlColor} tabular-nums`}>
          {pnlSign}{displayPnL.toFixed(4)}
        </div>
      </div>

      {/* Equity + protection */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-3">
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">OKX Equity</div>
          <div className="text-xl font-black text-emerald-400">${equity.toFixed(2)}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">BTC Price</div>
          <div className="text-xl font-black text-white">${tick?.last ? tick.last.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '...'}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">24h Change</div>
          <div className={`text-xl font-black ${(tick?.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {tick?.changePct != null ? `${tick.changePct >= 0 ? '+' : ''}${tick.changePct.toFixed(2)}%` : '—'}
          </div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Trades</div>
          <div className="text-xl font-black text-white">{tradeCount}</div>
        </div>
      </div>

      {/* Bid / Ask / Spread */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-900/70 rounded-xl p-3 border border-emerald-800/50">
          <div className="text-slate-400 mb-1">Bid</div>
          <div className="text-lg font-black text-emerald-400">${bid ? bid.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '...'}</div>
          <div className="text-slate-500 text-xs">{bid && tick?.bidSz ? `${tick.bidSz.toFixed(4)} BTC` : ''}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-red-800/50">
          <div className="text-slate-400 mb-1">Ask</div>
          <div className="text-lg font-black text-red-400">${ask ? ask.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '...'}</div>
          <div className="text-slate-500 text-xs">{ask && tick?.askSz ? `${tick.askSz.toFixed(4)} BTC` : ''}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Spread</div>
          <div className="text-lg font-black text-yellow-400">${spread.toFixed(2)}</div>
          <div className="text-slate-500 text-xs">{spreadPct.toFixed(4)}%</div>
        </div>
      </div>

      {/* Protection indicator */}
      <div className={`mt-3 flex items-center gap-2 rounded-xl p-3 border ${displayPnL >= 0 ? 'bg-emerald-900/20 border-emerald-700' : 'bg-red-900/30 border-red-600'}`}>
        <span className={`text-sm ${displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {displayPnL >= 0 ? '🛡️' : '🚨'}
        </span>
        <div className="text-xs">
          <span className={`font-bold ${displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {displayPnL >= 0 ? 'PROTECTION ACTIVE — P&L above zero' : 'PROTECTION TRIGGERED — P&L below zero, trading should stop'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Live signal display ───────────────────────────────────────────────────────
function LiveSignalPanel({ tick, connected }) {
  if (!tick) {
    return (
      <div className="rounded-2xl border-2 border-slate-700 bg-slate-900/40 p-5">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">📡 Live Signal</div>
        <div className="text-slate-500 text-sm">{connected ? 'Waiting for data…' : 'Connecting to OKX…'}</div>
      </div>
    );
  }

  const spreadPct = tick.bidPx && tick.askPx
    ? ((tick.askPx - tick.bidPx) / tick.bidPx) * 100
    : 0;

  // Simple signal logic from live tick data
  const buyPressure = tick.bidSz && tick.askSz ? tick.bidSz / (tick.bidSz + tick.askSz) : 0.5;
  const signal = buyPressure > 0.6 ? 'BUY' : buyPressure < 0.4 ? 'SELL' : 'NEUTRAL';
  const signalColor = signal === 'BUY' ? 'text-emerald-400' : signal === 'SELL' ? 'text-red-400' : 'text-slate-300';
  const signalBg = signal === 'BUY' ? 'bg-emerald-900/30 border-emerald-700' : signal === 'SELL' ? 'bg-red-900/30 border-red-700' : 'bg-slate-800/30 border-slate-600';
  const spreadOk = spreadPct < 0.05; // good for scalping

  return (
    <div className={`rounded-2xl border-2 ${signalBg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">📡 Live Signal (OKX WS)</span>
        </div>
        <span className="text-xs text-slate-500 font-mono">{connected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Signal</div>
          <div className={`text-2xl font-black ${signalColor}`}>{signal}</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Buy Pressure</div>
          <div className={`text-2xl font-black ${(buyPressure * 100) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{(buyPressure * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Spread OK?</div>
          <div className={`text-lg font-black ${spreadOk ? 'text-emerald-400' : 'text-yellow-400'}`}>{spreadOk ? '✅ YES' : '⚠️ WIDE'}</div>
        </div>
        <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">24h Vol</div>
          <div className="text-lg font-black text-white">{tick.vol24h ? `${(tick.vol24h).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Micro-scalp strategy: tight spread + buy pressure = small stable profits
      </div>
    </div>
  );
}

// ── Recent trades list ─────────────────────────────────────────────────────────
function RecentTrades({ trades }) {
  const recent = [...trades]
    .sort((a, b) => new Date(b.sellTime || b.buyTime || 0).getTime() - new Date(a.sellTime || a.buyTime || 0).getTime())
    .slice(0, 8);

  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Recent Verified Trades</div>
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
                <div className={`font-black ${pnlClr}`}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} USDT</div>
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

  const totalPnL = allTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const equity = parseFloat(balance?.totalEquityUSDT || balance?.totalEquity || 0);
  const available = parseFloat(balance?.availableUSDT || 0);
  const frozen = parseFloat(balance?.frozenUSDT || 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
              Live Trading
            </h1>
            <p className="text-slate-400 text-xs mt-1">BTC-USDT · OKX WebSocket · Micro-stable profits</p>
          </div>
          <div className="flex gap-2">
            <Link to="/SignalDashboard" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-700/30 border border-blue-700 hover:bg-blue-700/50 text-blue-300 transition-all">📡 Signals</Link>
            <Link to="/Transactions" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-700/30 border border-slate-700 hover:bg-slate-700/50 text-slate-300 transition-all">📒 Trades</Link>
          </div>
        </div>

        {/* Growing profit + live signal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {loadTrades ? <Skeleton className="h-96 bg-slate-800 rounded-2xl" /> : (
              <GrowingProfitClock
                totalPnL={totalPnL}
                equity={equity}
                tradeCount={allTrades.length}
                tick={tick}
                protected_={totalPnL >= 0}
              />
            )}
          </div>
          <div>
            <LiveSignalPanel tick={tick} connected={connected} />
          </div>
        </div>

        {/* Real OKX portfolio balance */}
        <div className="rounded-2xl border-2 border-emerald-700/50 bg-emerald-950/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">💼 Real OKX Portfolio</div>
            <span className={`text-xs font-mono ${connected ? 'text-emerald-400' : 'text-red-400'}`}>{connected ? '● LIVE' : '● OFFLINE'}</span>
          </div>
          {loadBalance ? <Skeleton className="h-24 bg-slate-800" /> : (
            <>
              <div className="mb-4">
                <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Real Equity</div>
                <div className="text-4xl font-black text-emerald-400">${equity.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                  <div className="text-slate-400 mb-1">Available</div>
                  <div className="text-xl font-black text-white">${available.toFixed(2)}</div>
                </div>
                <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                  <div className="text-slate-400 mb-1">Frozen</div>
                  <div className="text-xl font-black text-yellow-400">${frozen.toFixed(2)}</div>
                </div>
                <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-700">
                  <div className="text-slate-400 mb-1">BTC Value</div>
                  <div className="text-xl font-black text-white">{tick?.last && equity ? (equity / tick.last).toFixed(6) : '—'}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Recent trades */}
        <RecentTrades trades={allTrades} />

      </div>
    </div>
  );
}