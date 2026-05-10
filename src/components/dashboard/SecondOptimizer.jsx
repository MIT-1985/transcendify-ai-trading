/**
 * Second Optimizer — Display-only live performance widget
 * Reads: OXXOrderLedger (active position), OKX live ticker, Robot1ExecutionLog
 * No fake data. No old Trade entity. No random values.
 */
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const OKX_FEE_RATE = 0.001;
const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
const REFRESH_MS = 15000;

function getStatus(pos, lastLog) {
  if (!pos) {
    if (lastLog?.decision === 'SELL') return 'SELLING';
    return 'SCANNING';
  }
  if (lastLog?.decision === 'SELL') return 'SELLING';
  return 'HOLDING';
}

const STATUS_STYLES = {
  SCANNING:  { label: 'SCANNING',  color: 'text-cyan-400',    border: 'border-cyan-700/50',    bg: 'bg-cyan-900/20'    },
  HOLDING:   { label: 'HOLDING',   color: 'text-emerald-400', border: 'border-emerald-700/50', bg: 'bg-emerald-900/20' },
  SELLING:   { label: 'SELLING',   color: 'text-yellow-400',  border: 'border-yellow-700/50',  bg: 'bg-yellow-900/20'  },
  COOLDOWN:  { label: 'COOLDOWN',  color: 'text-slate-400',   border: 'border-slate-600',      bg: 'bg-slate-800/30'   },
};

export default function SecondOptimizer() {
  const [pos, setPos] = useState(null);          // active position from OXXOrderLedger
  const [ticker, setTicker] = useState(null);    // live OKX ticker for active pair
  const [lastLog, setLastLog] = useState(null);  // most recent Robot1ExecutionLog
  const [tick, setTick] = useState(0);           // forces re-render every second
  const [lastTickTime, setLastTickTime] = useState(null);
  const intervalRef = useRef(null);
  const tickRef = useRef(null);

  // FIFO position from OXXOrderLedger
  const fetchPosition = async () => {
    const all = await base44.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
    const sorted = all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const buyStack = {};
    for (const ord of sorted) {
      if (!PAIRS.includes(ord.instId)) continue;
      if (!buyStack[ord.instId]) buyStack[ord.instId] = [];
      if (ord.side === 'buy') buyStack[ord.instId].push(ord);
      else if (ord.side === 'sell' && buyStack[ord.instId].length > 0) buyStack[ord.instId].shift();
    }
    for (const pair of PAIRS) {
      const stack = buyStack[pair] || [];
      if (stack.length > 0) return stack[0]; // first open position found
    }
    return null;
  };

  // Live ticker via okxMarketData backend
  const fetchTicker = async (instId) => {
    try {
      const res = await base44.functions.invoke('okxMarketData', { action: 'ticker', instId });
      return res.data?.data || null;
    } catch { return null; }
  };

  // Latest execution log
  const fetchLastLog = async () => {
    try {
      const logs = await base44.entities.Robot1ExecutionLog.list('-execution_time', 1);
      return logs[0] || null;
    } catch { return null; }
  };

  const refresh = async () => {
    const [p, log] = await Promise.all([fetchPosition(), fetchLastLog()]);
    setPos(p);
    setLastLog(log);
    if (p?.instId) {
      const t = await fetchTicker(p.instId);
      setTicker(t);
    } else {
      setTicker(null);
    }
    setLastTickTime(Date.now());
  };

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_MS);
    // stagger start by 5s to avoid colliding with Robot1LivePnL
    const staggerTimer = setTimeout(() => {
      refresh();
    }, 5000);
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(tickRef.current);
      clearTimeout(staggerTimer);
    };
  }, []);

  // --- Derived metrics ---
  const currentPrice = ticker ? parseFloat(ticker.last || 0) : null;
  const entryPrice = pos ? pos.avgPx : null;
  const qty = pos ? pos.accFillSz : null;

  const unrealizedRaw = currentPrice && entryPrice && qty
    ? (currentPrice - entryPrice) * qty : null;
  const fees = currentPrice && entryPrice && qty
    ? (entryPrice * qty * OKX_FEE_RATE) + (currentPrice * qty * OKX_FEE_RATE) : null;
  const netPnL = unrealizedRaw !== null && fees !== null
    ? parseFloat((unrealizedRaw - fees).toFixed(4)) : null;
  const pnlPct = currentPrice && entryPrice
    ? parseFloat(((currentPrice - entryPrice) / entryPrice * 100).toFixed(3)) : null;

  const holdMs = pos?.timestamp ? Date.now() - new Date(pos.timestamp).getTime() : null;
  const holdSec = holdMs ? holdMs / 1000 : null;
  const pnlPerSec = holdSec && holdSec > 5 && netPnL !== null
    ? parseFloat((netPnL / holdSec).toFixed(6)) : null;
  const pnlPerMin = pnlPerSec !== null
    ? parseFloat((pnlPerSec * 60).toFixed(4)) : null;

  const status = getStatus(pos, lastLog);
  const st = STATUS_STYLES[status] || STATUS_STYLES.SCANNING;
  const isGain = netPnL !== null && netPnL >= 0;
  const pnlColor = netPnL === null ? 'text-slate-400' : isGain ? 'text-emerald-400' : 'text-red-400';

  // Seconds counter (live from holdMs)
  const secCounter = holdSec ? Math.floor(holdSec) : null;

  return (
    <div className={`relative bg-[#0A1A0E] border rounded-xl p-5 overflow-hidden ${st.border}`}
         style={{ boxShadow: '0 0 24px 2px rgba(34,197,94,0.08)' }}>
      {/* Green glow top edge */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Green glowing clock */}
          <div className="relative flex items-center justify-center w-7 h-7">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse" />
            <svg className="w-5 h-5 text-emerald-400 relative z-10" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-white">Second Optimizer</div>
            <div className="text-xs text-slate-500">live OKX · verified ledger · real fees</div>
          </div>
        </div>
        <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${st.color} ${st.border} ${st.bg}`}>
          {st.label}
        </div>
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {/* Live seconds counter */}
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500 mb-1">Hold Time</div>
          <div className="text-xl font-mono font-bold text-emerald-400">
            {secCounter !== null ? `${secCounter}s` : <span className="text-slate-600">—</span>}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            {holdMs ? `${Math.floor(holdMs / 60000)}m ${Math.floor((holdMs % 60000) / 1000)}s` : '—'}
          </div>
        </div>

        {/* Net P&L after fees */}
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500 mb-1">Net P&L (after fees)</div>
          <div className={`text-xl font-mono font-bold ${pnlColor}`}>
            {netPnL !== null ? `${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(4)}` : '—'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">USDT · fees: {fees ? fees.toFixed(4) : '—'}</div>
        </div>

        {/* P&L per second */}
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500 mb-1">P&L / sec</div>
          <div className={`text-xl font-mono font-bold ${pnlColor}`}>
            {pnlPerSec !== null ? `${pnlPerSec >= 0 ? '+' : ''}${pnlPerSec.toFixed(5)}` : '—'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">USDT/s</div>
        </div>

        {/* P&L per minute */}
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-500 mb-1">P&L / min</div>
          <div className={`text-xl font-mono font-bold ${pnlColor}`}>
            {pnlPerMin !== null ? `${pnlPerMin >= 0 ? '+' : ''}${pnlPerMin.toFixed(4)}` : '—'}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">USDT/min</div>
        </div>
      </div>

      {/* Position detail */}
      {pos ? (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800">
            <div className="text-xs text-slate-500 mb-0.5">Active Pair</div>
            <div className="text-sm font-bold text-white">{pos.instId}</div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800">
            <div className="text-xs text-slate-500 mb-0.5">Entry → Current</div>
            <div className="text-xs font-mono">
              <span className="text-slate-400">${entryPrice?.toFixed(2)}</span>
              <span className="text-slate-600"> → </span>
              <span className={pnlColor}>${currentPrice?.toFixed(2) ?? '…'}</span>
            </div>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800">
            <div className="text-xs text-slate-500 mb-0.5">Change</div>
            <div className={`text-sm font-mono font-bold ${pnlColor}`}>
              {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct}%` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600 text-center py-2 mb-3">No open position · holding USDT</div>
      )}

      {/* Last log + tick time */}
      <div className="flex justify-between items-center text-xs text-slate-600 border-t border-slate-800/50 pt-2">
        <span>
          Last decision:&nbsp;
          <span className={
            lastLog?.decision === 'BUY' ? 'text-emerald-400' :
            lastLog?.decision === 'SELL' ? 'text-red-400' :
            lastLog?.decision === 'ERROR' ? 'text-red-500' :
            'text-slate-500'
          }>
            {lastLog?.decision ?? '—'}
          </span>
          {lastLog?.reason ? <span className="text-slate-700 ml-1">· {lastLog.reason.slice(0, 60)}{lastLog.reason.length > 60 ? '…' : ''}</span> : null}
        </span>
        <span className="flex items-center gap-1 text-slate-700 shrink-0 ml-2">
          last tick: {lastTickTime ? new Date(lastTickTime).toLocaleTimeString() : '—'}
        </span>
      </div>
    </div>
  );
}