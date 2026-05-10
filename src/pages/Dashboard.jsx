import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Play, Pause, Zap, TrendingUp, Activity, DollarSign, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import AlphaScalperRuntime from '@/components/dashboard/AlphaScalperRuntime';
import LiveMarketPrices from '@/components/dashboard/LiveMarketPrices';

const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

export default function Dashboard() {
  const { user } = useAuth();
  const [alphaScalperEnabled, setAlphaScalperEnabled] = useState(true);
  const [clock, setClock] = useState({
    realizedPnL: 0,
    sessionTimer: 0,
    pnlPerSec: 0,
    pnlPerMin: 0,
    pnlPerHour: 0,
    status: 'INITIALIZING',
    lastCommand: '—',
    nextExecIn: 0,
    runtimeActive: false
  });

  const sessionStartRef = React.useRef(new Date());

  // Verified Trades (both robot1 and alphaScalper)
  const { data: verifiedTrades = [], isLoading: loadVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.list();
      return all
        .filter(t => (t.robotId === 'robot1' || t.robotId === 'alphaScalper') && ALLOWED_PAIRS.includes(t.instId) && t.status === 'closed')
        .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());
    },
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: 5000
  });

  // Live Balance
  const { data: balance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSuzanaBalance', {});
      const d = res.data || {};
      const map = { totalEquity: d.balance_usdt || 0, freeUSDT: 0 };
      for (const b of (d.balances || [])) {
        map[b.asset] = b.free;
        if (b.asset === 'USDT') map.freeUSDT = b.free;
      }
      return map;
    },
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 30000
  });

  // OKX Ledger (both robot1 and alphaScalper)
  const { data: ledger = [], isLoading: loadLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
      return all
        .filter(o => (o.robotId === 'robot1' || o.robotId === 'alphaScalper') && ALLOWED_PAIRS.includes(o.instId) && o.verified === true)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: 5000
  });

  // Update clock every second
  useEffect(() => {
    const updateClock = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
      const realizedPnL = todaysTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
      const sessionDuration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      
      setClock(prev => ({
        ...prev,
        realizedPnL,
        sessionTimer: sessionDuration,
        pnlPerSec: sessionDuration > 0 ? realizedPnL / sessionDuration : 0,
        pnlPerMin: sessionDuration > 0 ? realizedPnL / (sessionDuration / 60) : 0,
        pnlPerHour: sessionDuration > 0 ? realizedPnL / (sessionDuration / 3600) : 0,
        runtimeActive: alphaScalperEnabled
      }));
    };

    const interval = setInterval(updateClock, 1000);
    updateClock();
    return () => clearInterval(interval);
  }, [verifiedTrades, alphaScalperEnabled]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
  const wins = todaysTrades.filter(t => t.realizedPnL > 0).length;
  const losses = todaysTrades.filter(t => t.realizedPnL < 0).length;

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [killSwitchStatus, setKillSwitchStatus] = useState('CHECKING');

  useEffect(() => {
    const checkKillSwitch = async () => {
      try {
        const res = await base44.functions.invoke('checkKillSwitch', {});
        setKillSwitchStatus(res.data?.kill_switch_active ? 'ACTIVE' : 'INACTIVE');
      } catch (e) {
        setKillSwitchStatus('ERROR');
      }
    };
    checkKillSwitch();
    const interval = setInterval(checkKillSwitch, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      {killSwitchStatus === 'ACTIVE' && (
        <div className="max-w-7xl mx-auto mb-6 bg-red-950/90 border-2 border-red-600 rounded-2xl p-6 text-center">
          <div className="text-2xl font-black text-red-400 mb-2">🛑 TRADING HARD PAUSED</div>
          <div className="text-sm text-red-300">KILL SWITCH ACTIVE — No BUY/SELL orders allowed</div>
          <div className="text-xs text-red-400 mt-2">Status: PAUSED_ACCOUNTING_MISMATCH</div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">

        {/* SECTION 1: BIG LIVE CLOCK */}
        <div className={`rounded-2xl p-8 border-2 ${killSwitchStatus === 'ACTIVE' ? 'border-red-600 bg-red-950/30' : clock.realizedPnL >= 0 ? 'border-emerald-500 bg-emerald-950/30' : 'border-red-500 bg-red-950/30'} shadow-2xl`}>
          <div className="text-center space-y-4">
            <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Real-Time Earnings</div>
            
            <div className={`text-6xl font-black font-mono ${killSwitchStatus === 'ACTIVE' ? 'text-red-400' : clock.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {clock.realizedPnL >= 0 ? '+' : ''}{clock.realizedPnL.toFixed(4)} USDT
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-8">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Session Time</div>
                <div className="font-mono font-bold text-cyan-400">{formatTime(clock.sessionTimer)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">P&L / Second</div>
                <div className={`font-mono font-bold ${clock.pnlPerSec >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {clock.pnlPerSec >= 0 ? '+' : ''}{clock.pnlPerSec.toFixed(5)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">P&L / Minute</div>
                <div className={`font-mono font-bold ${clock.pnlPerMin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {clock.pnlPerMin >= 0 ? '+' : ''}{clock.pnlPerMin.toFixed(3)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">P&L / Hour</div>
                <div className={`font-mono font-bold ${clock.pnlPerHour >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {clock.pnlPerHour >= 0 ? '+' : ''}{clock.pnlPerHour.toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Status</div>
                <div className={`font-mono font-bold text-sm ${killSwitchStatus === 'ACTIVE' ? 'text-red-400' : alphaScalperEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {killSwitchStatus === 'ACTIVE' ? 'PAUSED_KILL_SWITCH' : alphaScalperEnabled ? 'ACTIVE' : 'OFF'}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Runtime</div>
                <div className={`font-mono font-bold text-sm ${killSwitchStatus === 'ACTIVE' ? 'text-red-400' : clock.runtimeActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
                  {killSwitchStatus === 'ACTIVE' ? '● PAUSED_KILL_SWITCH' : clock.runtimeActive ? '● LIVE' : '○ OFF'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: ACCOUNT SUMMARY */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              <div className="text-xs text-slate-500 uppercase">Total Equity</div>
            </div>
            {loadBalance ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className="text-3xl font-bold text-white">${parseFloat(balance.totalEquity || 0).toFixed(2)}</div>
            )}
          </div>

          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              <div className="text-xs text-slate-500 uppercase">Free USDT</div>
            </div>
            {loadBalance ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className="text-3xl font-bold text-emerald-400">${parseFloat(balance.freeUSDT || 0).toFixed(2)}</div>
            )}
          </div>

          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <div className="text-xs text-slate-500 uppercase">Verified Profit</div>
            </div>
            {loadVerified ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className={`text-3xl font-bold ${clock.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {clock.realizedPnL >= 0 ? '+' : ''}{clock.realizedPnL.toFixed(4)}
              </div>
            )}
          </div>

          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-cyan-500" />
              <div className="text-xs text-slate-500 uppercase">Trades Today</div>
            </div>
            {loadVerified ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className="text-3xl font-bold text-cyan-400">{todaysTrades.length}</div>
            )}
          </div>
        </div>

        {/* SECTION 3: ALPHA SCALPER STATUS */}
        <AlphaScalperRuntime enabled={alphaScalperEnabled} />

        <div className="flex gap-3">
          <Button
            onClick={() => setAlphaScalperEnabled(true)}
            disabled={alphaScalperEnabled || killSwitchStatus === 'ACTIVE'}
            className="gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Start Alpha Scalper
          </Button>
          <Button
            onClick={() => setAlphaScalperEnabled(false)}
            disabled={!alphaScalperEnabled}
            className="gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-50"
          >
            <Pause className="w-4 h-4" />
            Pause Alpha Scalper
          </Button>
          <Button
            onClick={async () => {
              try {
                await base44.functions.invoke('robot1LiveScalp', {});
              } catch (e) {
                console.error(e);
              }
            }}
            disabled={killSwitchStatus === 'ACTIVE'}
            className="gap-2 bg-blue-700 hover:bg-blue-600 ml-auto disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            Run One Cycle
          </Button>
        </div>

        {/* SECTION 4: ACTIVE BOTS */}
        <div>
          <h2 className="text-xl font-bold mb-4">Active Bots</h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {['Swing Master', 'Momentum Rider', 'Grid Profit Pro', 'Alpha Scalper', 'DCA Warrior'].map(botName => {
              const isAlpha = botName === 'Alpha Scalper';
              const shouldShowActive = isAlpha && killSwitchStatus !== 'ACTIVE' && alphaScalperEnabled;
              return (
                <div key={botName} className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="font-bold text-sm">{botName}</div>
                    <div className={`text-xs font-bold px-2 py-1 rounded ${
                      isAlpha && killSwitchStatus === 'ACTIVE' ? 'bg-red-900/50 text-red-400' :
                      shouldShowActive ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isAlpha && killSwitchStatus === 'ACTIVE' ? 'PAUSED_KILL_SWITCH' : shouldShowActive ? 'ACTIVE' : 'PAUSED'}
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div>Strategy: {isAlpha ? 'Scalping' : '—'}</div>
                    <div>P&L: {isAlpha ? `+${clock.realizedPnL.toFixed(4)}` : '—'}</div>
                    <div>Trades: {isAlpha ? todaysTrades.length : '0'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: LIVE MARKET PRICES */}
        <LiveMarketPrices />

        {/* SECTION 6: LAST VERIFIED ORDERS */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Last Verified Orders</h2>
          {loadLedger ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : ledger.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700 m-4">
              OXXOrderLedger missing — OKX fills not synced
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 10).map(o => (
                    <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 text-slate-400 text-xs">
                        {new Date(o.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 font-bold">{o.instId}</td>
                      <td className={`px-3 py-2 font-bold ${o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {o.side.toUpperCase()}
                      </td>
                      <td className="px-3 py-2 text-right">${parseFloat(o.avgPx).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{parseFloat(o.accFillSz).toFixed(6)}</td>
                      <td className="px-3 py-2 text-right text-red-400">{parseFloat(o.fee).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SECTION 7: CLOSED VERIFIED TRADES */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Closed Verified Trades</h2>
          {loadVerified ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : todaysTrades.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700 m-4">
              {ledger.length > 0 ? 'Reconciliation missing — OKX fills found but VerifiedTrade not created' : 'No closed trades yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Entry</th>
                    <th className="text-left px-3 py-2">Exit</th>
                    <th className="text-right px-3 py-2">P&L</th>
                    <th className="text-right px-3 py-2">P&L %</th>
                    <th className="text-right px-3 py-2">Hold</th>
                    <th className="text-left px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysTrades.slice(0, 15).map((t, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 font-bold">{t.instId}</td>
                      <td className="px-3 py-2 text-slate-400">${parseFloat(t.buyPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-400">${parseFloat(t.sellPrice).toFixed(2)}</td>
                      <td className={`px-3 py-2 font-bold text-right ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnL >= 0 ? '+' : ''}{parseFloat(t.realizedPnL).toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 font-bold text-right ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnLPct >= 0 ? '+' : ''}{parseFloat(t.realizedPnLPct).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">{(t.holdingMs / 1000).toFixed(2)}s</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">
                        {new Date(t.sellTime).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}