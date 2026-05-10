import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Wallet, TrendingUp, Activity, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Robot1Panel from '@/components/dashboard/Robot1Panel';
import PairScoringTable from '@/components/dashboard/PairScoringTable';
import Robot1LivePnL from '@/components/dashboard/Robot1LivePnL';
import SecondOptimizer from '@/components/dashboard/SecondOptimizer';
import Robot1ModePanel from '@/components/dashboard/Robot1ModePanel.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState('idle');
  const [pairScores, setPairScores] = useState([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [scalpRunning, setScalpRunning] = useState(false);
  const [scalpResult, setScalpResult] = useState(null);

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      await base44.functions.invoke('syncOKXOrderLedger', {});
      refetchLedger();
      refetchVerified();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  // 1. OKX Live Balance
  const { data: balance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSuzanaBalance', {});
      const d = res.data || {};
      // Flatten balances array into a lookup map for easy access
      const map = { totalEquity: d.balance_usdt, freeUSDT: 0 };
      for (const b of (d.balances || [])) {
        map[b.asset] = b.free;
        if (b.asset === 'USDT') map.freeUSDT = b.free;
      }
      return map;
    },
    enabled: !!user,
    staleTime: 30000
  });

  // 3. Robot 1 Verified Trades
  const { data: robot1Trades = [], refetch: refetchVerified, isLoading: loadVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      const all = await base44.entities.VerifiedTrade.list();
      return all
        .filter(t => t.robotId === 'robot1' && ALLOWED_PAIRS.includes(t.instId))
        .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());
    },
    enabled: !!user,
    staleTime: 30000
  });

  // 4. OKX Raw Orders
  const { data: ledger = [], refetch: refetchLedger, isLoading: loadLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      const all = await base44.entities.OXXOrderLedger.list();
      return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user,
    staleTime: 30000
  });

  const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
  const robot1PnL = robot1Trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Robot 1 Dashboard</h1>
            <p className="text-slate-500 text-xs mt-0.5">OKX live data · verified fills only</p>
          </div>
          <Button
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            size="sm"
            className={`gap-2 text-xs ${syncStatus === 'success' ? 'bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            <Activity className="w-3.5 h-3.5" />
            {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'success' ? '✓ Synced' : 'Sync OKX Ledger'}
          </Button>
        </div>

        {/* 1. OKX Live Balance */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-yellow-400" />
            <h2 className="font-bold text-sm">OKX Live Balance</h2>
          </div>
          {loadBalance ? <Skeleton className="h-16 bg-slate-800" /> :
            balance.error ? <div className="text-red-400 text-xs">{balance.error}</div> : (
              <div className="grid grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Total Equity', value: `$${parseFloat(balance.totalEquity || 0).toFixed(2)}`, color: 'text-emerald-400' },
                  { label: 'Free USDT', value: `$${parseFloat(balance.freeUSDT || 0).toFixed(2)}`, color: 'text-white' },
                  { label: 'BTC', value: parseFloat(balance.BTC || 0).toFixed(6), color: 'text-yellow-400' },
                  { label: 'ETH', value: parseFloat(balance.ETH || 0).toFixed(6), color: 'text-white' },
                  { label: 'SOL', value: parseFloat(balance.SOL || 0).toFixed(4), color: 'text-white' },
                  { label: 'DOGE', value: parseFloat(balance.DOGE || 0).toFixed(2), color: 'text-white' },
                  { label: 'XRP', value: parseFloat(balance.XRP || 0).toFixed(2), color: 'text-white' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}
        </section>

        {/* Mode & Scheduler Panel */}
        <Robot1ModePanel />

        {/* 2. Second Optimizer */}
        <SecondOptimizer />

        {/* 2b. Robot 1 Live P&L */}
        <Robot1LivePnL />

        {/* 2b. Robot 1 Scalping Mode */}
        <section className="bg-slate-900/50 border border-purple-700/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="w-4 h-4 text-purple-400" />
              <h2 className="font-bold text-sm">Robot 1 — Scalping Mode</h2>
              <span className="text-xs text-slate-500 ml-1">TP=0.18% · SL=-0.18% · µTrail@0.07%/0.08%/0.04% · minNet=0.02 USDT · Cooldown=30s</span>
            </div>
            <Button
              size="sm"
              disabled={scalpRunning}
              onClick={async () => {
                setScalpRunning(true);
                setScalpResult(null);
                try {
                  const res = await base44.functions.invoke('robot1Scalp', {});
                  setScalpResult(res.data);
                } catch (e) {
                  setScalpResult({ error: e.message });
                } finally {
                  setScalpRunning(false);
                }
              }}
              className="bg-purple-700 hover:bg-purple-600 text-white text-xs h-8 px-3 gap-1.5"
            >
              <Zap className="w-3 h-3" />
              {scalpRunning ? 'Running…' : 'Run Scalp'}
            </Button>
          </div>
          {scalpResult && (
            <div className="mt-2 space-y-2">
              {/* Main status line */}
              <div className={`rounded-lg px-3 py-2 border text-xs ${
                scalpResult.error ? 'bg-red-900/30 border-red-700 text-red-300' :
                scalpResult.buy?.decision === 'BUY_EXECUTED' ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' :
                scalpResult.sells?.length > 0 ? 'bg-blue-900/30 border-blue-700 text-blue-300' :
                'bg-slate-800/50 border-slate-600 text-slate-300'
              }`}>
                {scalpResult.error ? `Error: ${scalpResult.error}` :
                 scalpResult.sells?.length > 0 ? `✓ SOLD ${scalpResult.sells.map(s => s.pair).join(', ')} [${scalpResult.sells.map(s => s.exitMode).join(', ')}] → back to USDT` :
                 scalpResult.buy?.decision === 'BUY_EXECUTED' ? `✓ BUY ${scalpResult.buy.pair} @ $${scalpResult.buy.avgPx} · ${scalpResult.buy.usedUSDT} USDT${scalpResult.buy.tradeSizeScaled ? ' [SCALED]' : ''}` :
                 `WAIT · ${scalpResult.positionCount}/${scalpResult.maxPositions} positions · $${scalpResult.freeUsdt?.toFixed(2)} free`}
              </div>
              {/* BUY sizing diagnostics */}
              {scalpResult.buy?.decision === 'BUY_EXECUTED' && scalpResult.buy.sizing && (
                <div className="text-xs bg-emerald-900/20 rounded-lg p-3 border border-emerald-700/40">
                  <div className="text-emerald-400 font-bold mb-2">Trade Sizing Analysis</div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-slate-900/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Required Move %</div>
                      <div className="font-mono font-bold text-yellow-400">{scalpResult.buy.sizing.requiredPriceMovePercent?.toFixed(4)}%</div>
                    </div>
                    <div className="bg-slate-900/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Min Trade For Profit</div>
                      <div className="font-mono font-bold text-cyan-400">{scalpResult.buy.sizing.minTradeAmountForProfit?.toFixed(2)} USDT</div>
                    </div>
                    <div className="bg-slate-900/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Est. Fees</div>
                      <div className="font-mono font-bold text-red-400">{scalpResult.buy.sizing.estimatedFees?.toFixed(4)} USDT</div>
                    </div>
                    <div className="bg-slate-900/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Net Profit @ TP</div>
                      <div className={`font-mono font-bold ${scalpResult.buy.sizing.expectedNetProfitAtTP >= 0.02 ? 'text-emerald-400' : 'text-yellow-400'}`}>{scalpResult.buy.sizing.expectedNetProfitAtTP?.toFixed(4)} USDT</div>
                    </div>
                  </div>
                </div>
              )}
              {/* TP below fees global warning */}
              {scalpResult.sizingPreview && Object.values(scalpResult.sizingPreview).some(s => s.tpBelowFees) && (
                <div className="text-xs bg-red-900/30 border border-red-600 rounded-lg px-3 py-2 text-red-300 font-semibold">
                  ⚠️ Current TP ({scalpResult.config?.TAKE_PROFIT_PCT}%) is below round-trip fees (~{(scalpResult.config?.OKX_FEE_RATE * 200).toFixed(2)}%). Trading disabled until TP &gt; fees.
                </div>
              )}
              {/* Sizing preview table for all pairs */}
              {scalpResult.sizingPreview && Object.keys(scalpResult.sizingPreview).length > 0 && (
                <div className="text-xs bg-slate-900/40 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-slate-400 font-bold mb-2">Fee Sizing Preview — default {scalpResult.config?.DEFAULT_TRADE_USDT ?? 20} USDT</div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-slate-600 border-b border-slate-800">
                        <th className="text-left py-1">Pair</th>
                        <th className="text-right py-1">Required Move %</th>
                        <th className="text-right py-1">Min Trade USDT</th>
                        <th className="text-right py-1">Est. Fees</th>
                        <th className="text-right py-1">Net @ TP</th>
                        <th className="text-right py-1">Viable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(scalpResult.sizingPreview).map(([pair, s]) => (
                        <tr key={pair} className="border-b border-slate-800/30">
                          <td className="py-1 font-bold">{pair}</td>
                          <td className={`py-1 text-right font-mono ${s.requiredPriceMovePercent > scalpResult.config?.TAKE_PROFIT_PCT ? 'text-red-400' : 'text-yellow-400'}`}>{s.requiredPriceMovePercent?.toFixed(4)}%</td>
                          <td className="py-1 text-right font-mono text-cyan-400">{s.minTradeAmountForProfit?.toFixed(2)}</td>
                          <td className="py-1 text-right font-mono text-red-400">{s.estimatedFees?.toFixed(4)}</td>
                          <td className={`py-1 text-right font-mono ${s.netProfitAtTP >= 0.02 ? 'text-emerald-400' : 'text-yellow-400'}`}>{s.netProfitAtTP?.toFixed(4)}</td>
                          <td className={`py-1 text-right font-bold ${s.viable ? 'text-emerald-400' : 'text-red-400'}`}>{s.viable ? '✓' : s.tpBelowFees ? '✗ TP<fees' : '✗'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Per-position diagnostics */}
              {scalpResult.positionDiagnostics?.map((d, i) => (
                <div key={i} className="text-xs bg-slate-900/40 rounded-lg p-3 border border-slate-700/50 space-y-2">
                  {/* Row 1: identity + exit mode */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white text-sm">{d.pair}</span>
                      <span className="font-mono text-slate-400">${d.entryPx?.toFixed(2)} → ${d.currentPx?.toFixed(2)}</span>
                    </div>
                    <div className={`font-bold text-sm px-2 py-0.5 rounded ${
                      d.exitMode === 'TP' ? 'bg-emerald-900/50 text-emerald-300' :
                      d.exitMode === 'MICRO_TRAIL' ? 'bg-yellow-900/50 text-yellow-300' :
                      d.exitMode === 'TRAIL' ? 'bg-blue-900/50 text-blue-300' :
                      d.exitMode === 'SL' ? 'bg-red-900/50 text-red-300' :
                      d.exitMode === 'WAIT_NET_TOO_LOW' ? 'bg-orange-900/40 text-orange-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      Exit Mode: {d.exitMode}
                    </div>
                  </div>
                  {/* Row 2: the 5 required metrics */}
                  <div className="grid grid-cols-5 gap-2">
                    <div className="bg-slate-800/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">P&L %</div>
                      <div className={`font-mono font-bold ${d.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {d.pnlPercent >= 0 ? '+' : ''}{d.pnlPercent?.toFixed(4)}%
                      </div>
                    </div>
                    <div className="bg-slate-800/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Best PnL %</div>
                      <div className="font-mono font-bold text-purple-400">
                        {d.bestPnlPercent?.toFixed(4)}%
                      </div>
                    </div>
                    <div className="bg-slate-800/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Trailing Dist</div>
                      <div className="font-mono font-bold text-cyan-400">
                        {d.trailingDistance?.toFixed(4)}%
                      </div>
                    </div>
                    <div className="bg-slate-800/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Micro Trail</div>
                      <div className={`font-bold ${d.microTrailingActive ? 'text-yellow-400' : 'text-slate-500'}`}>
                        {d.microTrailingActive ? '✓ ACTIVE' : '✗ off'}
                      </div>
                    </div>
                    <div className="bg-slate-800/60 rounded p-2">
                      <div className="text-slate-500 mb-0.5">Net PnL After Fees</div>
                      <div className={`font-mono font-bold ${d.netPnL >= 0.02 ? 'text-emerald-400' : d.netPnL >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {d.netPnL >= 0 ? '+' : ''}{d.netPnL?.toFixed(4)} U
                      </div>
                    </div>
                  </div>
                  {/* Row 3: fees + ordId */}
                  <div className="flex gap-4 text-slate-500">
                    <span>Est. Fees: <span className="text-yellow-400 font-mono">{d.estimatedFees?.toFixed(4)} USDT</span></span>
                    <span>Gross: <span className={`font-mono ${d.grossPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d.grossPnL >= 0 ? '+' : ''}{d.grossPnL?.toFixed(4)}</span></span>
                    <span className="ml-auto font-mono text-slate-600 truncate max-w-xs">ordId: …{d.buyOrdId?.slice(-12)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Robot 1 Live Status (scheduler) */}
        <Robot1Panel onRunResult={(data) => { if (data?.pairScores) setPairScores(data.pairScores); }} />

        {/* 2b. Pair Scoring */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h2 className="font-bold text-sm">Pair Scoring — Last Run</h2>
            <span className="ml-auto text-xs text-slate-500">score ≥ 40 required to BUY</span>
          </div>
          <PairScoringTable pairScores={pairScores} isLoading={scoresLoading} />
        </section>

        {/* 3. Robot 1 Verified Trades */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-sm">Robot 1 Verified Trades</h2>
            <span className="ml-auto text-xs text-slate-500">BTC / ETH / SOL / DOGE / XRP · all 5 pairs</span>
          </div>
          {loadVerified ? <Skeleton className="h-24 bg-slate-800" /> :
            robot1Trades.length === 0 ? (
              <div className="text-slate-500 text-xs py-4 text-center">No verified trades yet. BUY→SELL pairs appear here after close.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-slate-500">Closed Trades</div>
                    <div className="text-xl font-bold">{robot1Trades.length}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-slate-500">Win Rate</div>
                    <div className="text-xl font-bold text-white">
                      {robot1Trades.length > 0
                        ? `${Math.round(robot1Trades.filter(t => t.realizedPnL > 0).length / robot1Trades.length * 100)}%`
                        : '—'}
                    </div>
                  </div>
                  <div className={`bg-slate-800/50 rounded-lg p-3 border ${robot1PnL >= 0 ? 'border-emerald-700/40' : 'border-red-700/40'}`}>
                    <div className="text-xs text-slate-500">Total P&L</div>
                    <div className={`text-xl font-bold font-mono ${robot1PnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {robot1PnL >= 0 ? '+' : ''}{robot1PnL.toFixed(2)} USDT
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 border-b border-slate-700">
                      <tr>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-right px-2 py-2">Buy Px</th>
                        <th className="text-right px-2 py-2">Sell Px</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">P&L</th>
                        <th className="text-right px-2 py-2">%</th>
                        <th className="text-right px-2 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {robot1Trades.slice(0, 10).map((t, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 font-bold">{t.instId}</td>
                          <td className="px-2 py-2 text-right font-mono">${t.buyPrice?.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono">${t.sellPrice?.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono">{t.buyQty?.toFixed(4)}</td>
                          <td className={`px-2 py-2 text-right font-mono ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.realizedPnL >= 0 ? '+' : ''}{t.realizedPnL?.toFixed(4)}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.realizedPnLPct?.toFixed(2)}%
                          </td>
                          <td className="px-2 py-2 text-right text-slate-500">
                            {t.sellTime ? new Date(t.sellTime).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
        </section>

        {/* 4. OKX Raw Orders */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="font-bold text-sm">OKX Raw Orders</h2>
            <span className="ml-auto text-xs text-slate-500">Verified fills · robot1 only</span>
          </div>
          {loadLedger ? <Skeleton className="h-32 bg-slate-800" /> :
            ledger.length === 0 ? (
              <div className="text-slate-500 text-xs py-4 text-center">No orders. Click "Sync OKX Ledger" above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 border-b border-slate-700">
                    <tr>
                      <th className="text-left px-2 py-2">Ord ID</th>
                      <th className="text-left px-2 py-2">Pair</th>
                      <th className="text-left px-2 py-2">Side</th>
                      <th className="text-right px-2 py-2">Qty</th>
                      <th className="text-right px-2 py-2">Avg Px</th>
                      <th className="text-right px-2 py-2">Quote USDT</th>
                      <th className="text-right px-2 py-2">Fee</th>
                      <th className="text-left px-2 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(0, 20).map(o => (
                      <tr key={o.ordId} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-2 py-2 font-mono text-cyan-400">…{o.ordId?.slice(-8)}</td>
                        <td className="px-2 py-2 font-bold">{o.instId}</td>
                        <td className="px-2 py-2">
                          <span className={o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                            {o.side?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono">{o.accFillSz?.toFixed(4)}</td>
                        <td className="px-2 py-2 text-right font-mono">${o.avgPx?.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">${o.quoteUSDT?.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-400">{o.fee?.toFixed(4)}</td>
                        <td className="px-2 py-2 text-slate-500 text-xs">{new Date(o.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ledger.length > 20 && (
                  <div className="text-xs text-slate-600 text-center mt-2">…{ledger.length - 20} more</div>
                )}
              </div>
            )}
        </section>

      </div>
    </div>
  );
}