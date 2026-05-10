import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, AlertCircle } from 'lucide-react';

export default function AlphaScalperRuntime({ enabled = true }) {
  const [clock, setClock] = useState({
    timestamp: new Date(),
    activePair: null,
    currentCommand: 'INIT',
    realizedPnLToday: 0,
    unrealizedPnL: 0,
    pnlPerSecondEstimate: 0,
    pnlPerMinuteEstimate: 0,
    pnlPerHourEstimate: 0,
    sessionTimer: 0,
    lastBuyOrdId: null,
    lastSellOrdId: null,
    entryPx: null,
    currentPx: null,
    sellableQty: 0
  });

  const [scanner, setScanner] = useState({
    timestamp: new Date(),
    pairs: {},
    selectedPair: null,
    signalSource: 'INITIALIZING',
    constantsScore: 0
  });

  const [execution, setExecution] = useState({
    timestamp: new Date(),
    runtimeActive: false,
    lastCommand: 'IDLE',
    tradeAllowed: false,
    blocker: null,
    buyOrdId: null,
    sellOrdId: null,
    realizedPnL: 0
  });

  const [verifiedTrades, setVerifiedTrades] = useState([]);
  const [safety, setSafety] = useState({ status: 'OK', message: '' });

  const clockIntervalRef = useRef(null);
  const scannerIntervalRef = useRef(null);
  const executionIntervalRef = useRef(null);
  const sessionStartRef = useRef(new Date());

  // ========== LIVE CLOCK (1s) ==========
  useEffect(() => {
    if (!enabled) return;

    const updateClock = async () => {
      try {
        // Fetch all verified trades
        const all = await base44.asServiceRole.entities.VerifiedTrade.list();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todaysTrades = all.filter(t => 
          t.robotId === 'robot1' && 
          t.status === 'closed' &&
          new Date(t.sellTime) >= todayStart
        ).sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());

        setVerifiedTrades(todaysTrades);

        const realizedPnLToday = todaysTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
        const sessionDuration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
        
        // Calculate unrealized P&L if active position
        let unrealizedPnL = 0;
        let entryPx = null;
        let currentPx = null;
        let sellableQty = 0;
        let activePair = null;

        if (todaysTrades.length > 0) {
          const lastTrade = todaysTrades[0];
          entryPx = lastTrade.buyPrice;
          currentPx = lastTrade.sellPrice;
          activePair = lastTrade.instId;
        }

        const pnlPerSecond = sessionDuration > 0 ? realizedPnLToday / sessionDuration : 0;
        const pnlPerMinute = sessionDuration > 0 ? realizedPnLToday / (sessionDuration / 60) : 0;
        const pnlPerHour = sessionDuration > 0 ? realizedPnLToday / (sessionDuration / 3600) : 0;

        setClock(prev => ({
          ...prev,
          timestamp: new Date(),
          activePair,
          currentCommand: execution.lastCommand || 'SCANNING',
          realizedPnLToday,
          unrealizedPnL,
          pnlPerSecondEstimate: pnlPerSecond,
          pnlPerMinuteEstimate: pnlPerMinute,
          pnlPerHourEstimate: pnlPerHour,
          sessionTimer: sessionDuration,
          lastBuyOrdId: todaysTrades[0]?.buyOrdId || null,
          lastSellOrdId: todaysTrades[0]?.sellOrdId || null,
          entryPx,
          currentPx,
          sellableQty
        }));
      } catch (e) {
        console.error('[Clock Error]', e.message);
      }
    };

    clockIntervalRef.current = setInterval(updateClock, 1000);
    updateClock(); // Immediate call

    return () => clearInterval(clockIntervalRef.current);
  }, [enabled, execution.lastCommand]);

  // ========== MARKET SCANNER (2s) ==========
  useEffect(() => {
    if (!enabled) return;

    const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

    const updateScanner = async () => {
      try {
        const pairData = {};
        let bestPair = null;
        let bestScore = -Infinity;

        for (const pair of ALLOWED_PAIRS) {
          const tickRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${pair}`);
          const tickData = await tickRes.json();
          
          if (tickData.code === '0' && tickData.data && tickData.data.length > 0) {
            const ticker = tickData.data[0];
            const askPx = parseFloat(ticker.askPx || 0);
            const bidPx = parseFloat(ticker.bidPx || 0);
            const lastPx = parseFloat(ticker.last || 0);
            const spread = askPx > 0 && bidPx > 0 ? ((askPx - bidPx) / bidPx * 100) : 0;

            // Simple score: lower spread = higher score
            const score = Math.max(0, 100 - spread * 1000);

            pairData[pair] = {
              ask: askPx,
              bid: bidPx,
              last: lastPx,
              spread: spread.toFixed(4),
              score: score.toFixed(2),
              signal: 'OKX_LIVE'
            };

            if (score > bestScore) {
              bestScore = score;
              bestPair = pair;
            }
          }
        }

        setScanner(prev => ({
          ...prev,
          timestamp: new Date(),
          pairs: pairData,
          selectedPair: bestPair,
          signalSource: 'OKX_LIVE',
          constantsScore: bestScore.toFixed(2)
        }));
      } catch (e) {
        console.error('[Scanner Error]', e.message);
        setScanner(prev => ({
          ...prev,
          signalSource: 'ERROR'
        }));
      }
    };

    scannerIntervalRef.current = setInterval(updateScanner, 2000);
    updateScanner(); // Immediate call

    return () => clearInterval(scannerIntervalRef.current);
  }, [enabled]);

  // ========== EXECUTION PULSE (10s) ==========
  useEffect(() => {
    if (!enabled) return;

    const executeScalp = async () => {
      try {
        const res = await base44.functions.invoke('robot1LiveScalp', {});
        const result = res.data || {};

        setExecution(prev => ({
          ...prev,
          timestamp: new Date(),
          runtimeActive: true,
          lastCommand: result.decision || 'IDLE',
          tradeAllowed: result.tradeAllowed || false,
          blocker: result.blocker || null,
          buyOrdId: result.buy_order?.ordId || null,
          sellOrdId: result.sell_order?.ordId || null,
          realizedPnL: result.realizedPnL || 0
        }));

        // Check safety conditions
        if (result.reason && result.reason.includes('2 consecutive losses')) {
          setSafety({ status: 'PAUSED', message: '2 consecutive losses detected' });
        } else if (result.reason && result.reason.includes('daily loss')) {
          setSafety({ status: 'PAUSED', message: 'Daily loss limit exceeded' });
        } else if (result.code && result.code !== '0') {
          setSafety({ status: 'ERROR', message: result.msg || 'OKX API error' });
        } else {
          setSafety({ status: 'OK', message: '' });
        }
      } catch (e) {
        console.error('[Execution Error]', e.message);
        setExecution(prev => ({
          ...prev,
          lastCommand: 'ERROR',
          blocker: e.message
        }));
        setSafety({ status: 'ERROR', message: e.message });
      }
    };

    executionIntervalRef.current = setInterval(executeScalp, 10000);
    executeScalp(); // Immediate call

    return () => clearInterval(executionIntervalRef.current);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const nextExecutionIn = execution.timestamp ? Math.max(0, 10 - ((new Date().getTime() - execution.timestamp.getTime()) / 1000)) : 0;

  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
          <div>
            <div className="text-sm font-bold text-white">Alpha Scalper Runtime</div>
            <div className="text-xs text-emerald-400">ACTIVE • {clock.timestamp.toLocaleTimeString()}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold ${safety.status === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
            {safety.status}
          </div>
          {safety.message && <div className="text-xs text-red-400">{safety.message}</div>}
        </div>
      </div>

      {/* Live Clock */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Session PnL</div>
          <div className={`font-mono font-bold ${clock.realizedPnLToday >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {clock.realizedPnLToday >= 0 ? '+' : ''}{clock.realizedPnLToday.toFixed(4)} USDT
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">PnL/Sec</div>
          <div className={`font-mono font-bold ${clock.pnlPerSecondEstimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {clock.pnlPerSecondEstimate >= 0 ? '+' : ''}{clock.pnlPerSecondEstimate.toFixed(4)}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">PnL/Min</div>
          <div className={`font-mono font-bold ${clock.pnlPerMinuteEstimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {clock.pnlPerMinuteEstimate >= 0 ? '+' : ''}{clock.pnlPerMinuteEstimate.toFixed(3)}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Session Time</div>
          <div className="font-mono font-bold text-cyan-400">
            {Math.floor(clock.sessionTimer)}s
          </div>
        </div>
      </div>

      {/* Execution Status */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Last Command</div>
          <div className="font-mono font-bold text-yellow-400">{execution.lastCommand}</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Pair Selected</div>
          <div className="font-mono font-bold text-blue-400">{scanner.selectedPair || '—'}</div>
        </div>
        <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Next Exec In</div>
          <div className="font-mono font-bold text-cyan-400">{nextExecutionIn.toFixed(1)}s</div>
        </div>
      </div>

      {/* Last Trade IDs */}
      {(clock.lastBuyOrdId || clock.lastSellOrdId) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {clock.lastBuyOrdId && (
            <div className="bg-emerald-900/20 rounded p-2 border border-emerald-700/50">
              <div className="text-emerald-400 mb-0.5">Last BUY ordId</div>
              <div className="font-mono text-emerald-300 text-xs truncate">…{clock.lastBuyOrdId?.slice(-8)}</div>
            </div>
          )}
          {clock.lastSellOrdId && (
            <div className="bg-red-900/20 rounded p-2 border border-red-700/50">
              <div className="text-red-400 mb-0.5">Last SELL ordId</div>
              <div className="font-mono text-red-300 text-xs truncate">…{clock.lastSellOrdId?.slice(-8)}</div>
            </div>
          )}
        </div>
      )}

      {/* Blocker if Present */}
      {execution.blocker && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-2 text-xs">
          <div className="text-red-400 font-bold mb-1">Blocker</div>
          <div className="text-red-300">{execution.blocker}</div>
        </div>
      )}

      {/* Verified Trades Count */}
      <div className="text-xs text-slate-500 text-center">
        {verifiedTrades.length} verified cycles today
      </div>
    </div>
  );
}