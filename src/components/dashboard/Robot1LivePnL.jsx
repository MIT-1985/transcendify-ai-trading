/**
 * Robot 1 Live P&L Panel
 * Shows real-time unrealized P&L for active Robot1 positions.
 * Uses live OKX ticker + verified OXXOrderLedger positions only.
 * No fake profit, no simulation, no random numbers.
 */
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, Zap, Clock, RefreshCw } from 'lucide-react';

const OKX_FEE_RATE = 0.001; // 0.1% taker per side

function calcFees(entryPrice, currentPrice, qty) {
  const buyFee = entryPrice * qty * OKX_FEE_RATE;
  const sellFee = currentPrice * qty * OKX_FEE_RATE;
  return parseFloat((buyFee + sellFee).toFixed(6));
}

function PositionCard({ pos, ticker, lastUpdate }) {
  const currentPrice = ticker ? parseFloat(ticker.last || 0) : null;
  const entryPrice = pos.entryPrice;
  const qty = pos.qty;

  const unrealizedRaw = currentPrice ? (currentPrice - entryPrice) * qty : null;
  const fees = currentPrice ? calcFees(entryPrice, currentPrice, qty) : null;
  const netPnL = unrealizedRaw !== null ? parseFloat((unrealizedRaw - fees).toFixed(4)) : null;
  const pnlPct = currentPrice ? parseFloat(((currentPrice - entryPrice) / entryPrice * 100).toFixed(3)) : null;

  // P&L per second / per minute (based on hold time)
  const holdMs = pos.buyTimestamp ? Date.now() - new Date(pos.buyTimestamp).getTime() : null;
  const holdSec = holdMs ? holdMs / 1000 : null;
  const pnlPerSec = holdSec && holdSec > 5 && netPnL !== null ? parseFloat((netPnL / holdSec).toFixed(6)) : null;
  const pnlPerMin = pnlPerSec !== null ? parseFloat((pnlPerSec * 60).toFixed(4)) : null;

  const isGain = netPnL !== null && netPnL >= 0;
  const pnlColor = netPnL === null ? 'text-slate-400' : isGain ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className={`bg-slate-900 border rounded-xl p-4 ${isGain ? 'border-emerald-700/50' : 'border-red-700/50'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isGain ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="font-bold text-white text-sm">{pos.instId}</span>
          <span className="text-xs text-slate-500">LIVE</span>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded border ${isGain ? 'text-emerald-400 border-emerald-700 bg-emerald-900/30' : 'text-red-400 border-red-700 bg-red-900/30'}`}>
          {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct}%` : '…'}
        </div>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-800/60 rounded-lg p-2.5">
          <div className="text-xs text-slate-500 mb-1">Entry Price</div>
          <div className="text-sm font-mono text-white">${entryPrice?.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2.5">
          <div className="text-xs text-slate-500 mb-1">Current Price</div>
          <div className={`text-sm font-mono ${pnlColor}`}>
            {currentPrice ? `$${currentPrice.toFixed(4)}` : <span className="text-slate-600">loading…</span>}
          </div>
        </div>
      </div>

      {/* P&L breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-slate-800/60 rounded-lg p-2.5">
          <div className="text-xs text-slate-500 mb-1">Unrealized P&L</div>
          <div className={`text-sm font-mono font-bold ${pnlColor}`}>
            {unrealizedRaw !== null ? `${unrealizedRaw >= 0 ? '+' : ''}${unrealizedRaw.toFixed(4)}` : '—'} <span className="text-xs font-normal">USDT</span>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2.5">
          <div className="text-xs text-slate-500 mb-1">Est. Fees</div>
          <div className="text-sm font-mono text-yellow-400">
            -{fees !== null ? fees.toFixed(4) : '—'} <span className="text-xs font-normal text-slate-500">USDT</span>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-2.5">
          <div className="text-xs text-slate-500 mb-1">Net P&L</div>
          <div className={`text-sm font-mono font-bold ${pnlColor}`}>
            {netPnL !== null ? `${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(4)}` : '—'} <span className="text-xs font-normal">USDT</span>
          </div>
        </div>
      </div>

      {/* Rate row */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-slate-800/40 rounded-lg p-2">
          <div className="text-xs text-slate-500 mb-0.5">P&L / sec</div>
          <div className={`text-xs font-mono ${pnlColor}`}>
            {pnlPerSec !== null ? `${pnlPerSec >= 0 ? '+' : ''}${pnlPerSec.toFixed(6)} USDT` : '—'}
          </div>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-2">
          <div className="text-xs text-slate-500 mb-0.5">P&L / min</div>
          <div className={`text-xs font-mono ${pnlColor}`}>
            {pnlPerMin !== null ? `${pnlPerMin >= 0 ? '+' : ''}${pnlPerMin.toFixed(4)} USDT` : '—'}
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex justify-between items-center text-xs text-slate-600 mt-1">
        <span>qty: {qty?.toFixed(6)} · hold: {holdSec ? `${Math.floor(holdSec)}s` : '—'}</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '—'}
        </span>
      </div>
    </div>
  );
}

export default function Robot1LivePnL() {
  const [positions, setPositions] = useState([]);
  const [tickers, setTickers] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  // Fetch active positions from OXXOrderLedger (FIFO Robot1 only)
  const fetchPositions = async () => {
    const all = await base44.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
    const sorted = all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const buyStack = {};
    const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
    for (const ord of sorted) {
      if (!PAIRS.includes(ord.instId)) continue;
      if (!buyStack[ord.instId]) buyStack[ord.instId] = [];
      if (ord.side === 'buy') {
        buyStack[ord.instId].push({ ordId: ord.ordId, avgPx: ord.avgPx, accFillSz: ord.accFillSz, fee: ord.fee, timestamp: ord.timestamp });
      } else if (ord.side === 'sell' && buyStack[ord.instId].length > 0) {
        buyStack[ord.instId].shift();
      }
    }
    const active = [];
    for (const pair of PAIRS) {
      const stack = buyStack[pair] || [];
      if (stack.length > 0) {
        const b = stack[0];
        active.push({ instId: pair, qty: b.accFillSz, entryPrice: b.avgPx, buyOrdId: b.ordId, buyTimestamp: b.timestamp });
      }
    }
    return active;
  };

  // Fetch OKX tickers for active pairs
  const fetchTickers = async (pairs) => {
    if (!pairs.length) return {};
    const results = await Promise.all(
      pairs.map(async (pair) => {
        const res = await base44.functions.invoke('okxMarketData', { action: 'ticker', instId: pair });
        const t = res.data?.data || null;
        return { pair, ticker: t };
      })
    );
    const map = {};
    for (const { pair, ticker } of results) map[pair] = ticker;
    return map;
  };

  const refresh = async () => {
    const pos = await fetchPositions();
    setPositions(pos);
    if (pos.length > 0) {
      const tickerMap = await fetchTickers(pos.map(p => p.instId));
      setTickers(tickerMap);
    }
    setLastUpdate(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 10000); // refresh every 10s
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <h2 className="font-bold text-sm text-white">Robot 1 — Live P&L</h2>
          <span className="text-xs text-slate-500 ml-1">Real OKX ticker · verified positions only</span>
        </div>
        <button
          onClick={refresh}
          className="text-slate-500 hover:text-white transition-colors"
          title="Refresh now"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-xs text-center py-6 animate-pulse">Loading live positions…</div>
      ) : positions.length === 0 ? (
        <div className="text-slate-600 text-xs text-center py-6 flex flex-col items-center gap-2">
          <TrendingUp className="w-6 h-6 text-slate-700" />
          <span>No active positions. Robot is holding USDT.</span>
          <span className="text-slate-700">Next BUY will appear here in real-time.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {positions.map(pos => (
            <PositionCard
              key={pos.instId}
              pos={pos}
              ticker={tickers[pos.instId]}
              lastUpdate={lastUpdate}
            />
          ))}
        </div>
      )}

      {/* Cycle indicator */}
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-600">
        <span className="text-slate-500">Cycle:</span>
        <span className={positions.length > 0 ? 'text-yellow-400 font-bold' : 'text-slate-600'}>USDT</span>
        <span>→</span>
        <span className={positions.length > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
          {positions.length > 0 ? positions.map(p => p.instId.replace('-USDT', '')).join(' + ') : 'COIN'}
        </span>
        <span>→</span>
        <span className="text-slate-500">USDT</span>
        <span className="ml-auto text-slate-700">fee rate: 0.1%/side · refreshes every 3s</span>
      </div>
    </div>
  );
}