import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingUp, Clock } from 'lucide-react';

export default function RobotLiveClockProfit() {
  const [clockTime, setClockTime] = useState(0);
  const [pnlPerSec, setPnlPerSec] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // Fetch verified trades from today
  const { data: trades = [] } = useQuery({
    queryKey: ['todayTrades'],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.filter({ robotId: 'robot1' });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return all.filter(t => t.sellTime && new Date(t.sellTime) >= today);
    },
    refetchInterval: 10000,
  });

  // Fetch active position from OXXOrderLedger
  const { data: activePos } = useQuery({
    queryKey: ['activePosition'],
    queryFn: async () => {
      const ledger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
      const sorted = ledger.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // FIFO: match buys to sells
      const buyStack = {};
      for (const ord of sorted.reverse()) {
        if (!buyStack[ord.instId]) buyStack[ord.instId] = [];
        if (ord.side === 'buy') {
          buyStack[ord.instId].push(ord);
        } else if (ord.side === 'sell' && buyStack[ord.instId].length > 0) {
          buyStack[ord.instId].pop();
        }
      }
      
      // Return first active position
      for (const [pair, stack] of Object.entries(buyStack)) {
        if (stack.length > 0) return { pair, entry: stack[stack.length - 1], entryTime: new Date(stack[stack.length - 1].timestamp) };
      }
      return null;
    },
    refetchInterval: 5000,
  });

  // Fetch latest execution log
  const { data: latestExecution } = useQuery({
    queryKey: ['latestExecution'],
    queryFn: async () => {
      const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.filter({});
      return logs.sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time))[0] || null;
    },
    refetchInterval: 10000,
  });

  // Calculate realized PnL today
  const realizedPnLToday = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  // Calculate unrealized PnL if position active
  let unrealizedPnL = 0;
  if (activePos && latestExecution?.signal_data?.tickerMap) {
    const curPrice = latestExecution.signal_data.tickerMap[activePos.pair]?.last || 0;
    unrealizedPnL = (curPrice - activePos.entry.avgPx) * activePos.entry.accFillSz - (activePos.entry.avgPx * activePos.entry.accFillSz * 0.002);
  }

  // Get last BUY/SELL times
  const lastBuy = trades.length > 0 ? trades.reduce((a, b) => (new Date(a.buyTime) > new Date(b.buyTime) ? a : b)) : null;
  const lastSell = trades.length > 0 ? trades.reduce((a, b) => (new Date(a.sellTime) > new Date(b.sellTime) ? a : b)) : null;

  // Session clock effect
  useEffect(() => {
    if (!sessionStartTime) {
      setSessionStartTime(Date.now());
    }
    const timer = setInterval(() => {
      if (sessionStartTime) {
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        setClockTime(elapsed);
        const totalPnL = realizedPnLToday + unrealizedPnL;
        setPnlPerSec(totalPnL / (elapsed || 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime, realizedPnLToday, unrealizedPnL]);

  // Get current state
  const getState = () => {
    if (latestExecution?.okx_status === 'FAILED') return 'BLOCKED';
    if (activePos) return 'HOLDING';
    if (latestExecution?.decision === 'BUY') return 'BUYING';
    if (latestExecution?.decision === 'SELL') return 'SELLING';
    return 'SCANNING';
  };

  const state = getState();
  const totalPnL = realizedPnLToday + unrealizedPnL;
  const pnlPerMin = pnlPerSec * 60;

  const stateColor = {
    SCANNING: 'text-blue-400',
    BUYING: 'text-green-400',
    HOLDING: 'text-yellow-400',
    SELLING: 'text-orange-400',
    COOLDOWN: 'text-purple-400',
    BLOCKED: 'text-red-500',
  }[state] || 'text-gray-400';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Main Profit Clock */}
      <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Robot Live Clock Profit
            </h3>
            <p className="text-sm text-slate-400 mt-1">Session performance tracker</p>
          </div>
          <div className={`text-2xl font-bold ${stateColor}`}>
            {state}
          </div>
        </div>

        {/* Big PnL Display */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
          <div className="text-sm text-slate-400 mb-2">Current Session P&L</div>
          <div className={`text-4xl font-bold font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-500'}`}>
            {totalPnL.toFixed(4)} USDT
          </div>
        </div>

        {/* PnL Rates */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">P&L/sec</div>
            <div className={`text-lg font-bold font-mono ${pnlPerSec >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {pnlPerSec.toFixed(6)} USDT
            </div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">P&L/min</div>
            <div className={`text-lg font-bold font-mono ${pnlPerMin >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {pnlPerMin.toFixed(4)} USDT
            </div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Session Time</div>
            <div className="text-lg font-bold font-mono text-blue-400">
              {Math.floor(clockTime)}s
            </div>
          </div>
        </div>

        {/* Today's Totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Realized Today</div>
            <div className={`text-lg font-bold font-mono ${realizedPnLToday >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {realizedPnLToday.toFixed(4)} USDT
            </div>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Unrealized</div>
            <div className={`text-lg font-bold font-mono ${unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {unrealizedPnL.toFixed(4)} USDT
            </div>
          </div>
        </div>
      </div>

      {/* Last Action Info */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Last Action
        </h3>

        <div className="space-y-3">
          {lastSell ? (
            <>
              <div>
                <div className="text-xs text-slate-400">Last SELL</div>
                <div className="text-sm font-mono text-green-400">
                  {new Date(lastSell.sellTime).toLocaleTimeString()}
                </div>
                <div className="text-xs text-slate-500">OrdId: {lastSell.sellOrdId?.slice(0, 8)}</div>
              </div>
            </>
          ) : null}

          {lastBuy ? (
            <>
              <div>
                <div className="text-xs text-slate-400">Last BUY</div>
                <div className="text-sm font-mono text-yellow-400">
                  {new Date(lastBuy.buyTime).toLocaleTimeString()}
                </div>
                <div className="text-xs text-slate-500">OrdId: {lastBuy.buyOrdId?.slice(0, 8)}</div>
              </div>
            </>
          ) : null}

          {activePos ? (
            <>
              <div className="border-t border-slate-700 pt-3 mt-3">
                <div className="text-xs text-slate-400">Active Position</div>
                <div className="text-sm font-bold text-yellow-400">{activePos.pair}</div>
                <div className="text-xs text-slate-500">Entry: {activePos.entry.avgPx.toFixed(4)}</div>
              </div>
            </>
          ) : null}

          {!lastSell && !lastBuy && !activePos ? (
            <div className="text-xs text-slate-500 italic">No trades yet today</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}