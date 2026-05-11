import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Dashboard() {
  const { user } = useAuth();
  const [killSwitchStatus, setKillSwitchStatus] = useState('CHECKING');

  // OKX Live Balance — refresh every 5s
  const { data: okxBalance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance-final', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('okxLiveBalance', {});
        const d = res.data || {};
        if (!d.success) return { success: false, error: 'OKX API unreachable' };
        const raw = d.raw_usdt_balance || {};
        return {
          success: true,
          totalEquityUSDT: d.totalEquityUSDT || '0',
          availableUSDT: d.availableUSDT || '0',
          frozenUSDT: d.frozenUSDT || '0',
          nonFreeBal: d.nonFreeBal || '0',
          openOrdersCount: d.openOrdersCount || 0,
          assetCount: d.assetCount || 0,
          rawUsdt: raw,
          timestamp: d.fetchedAt
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 5000,
    gcTime: 0
  });

  // Clean Metrics — refresh every 10s
  const { data: cleanMetrics = {}, isLoading: loadMetrics } = useQuery({
    queryKey: ['final-clean-metrics-dedup', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('finalCleanMetricsWithDedup', {});
      if (!res.data.success) throw new Error('Failed to get clean metrics');
      return res.data;
    },
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 10000,
    gcTime: 0
  });

  // Kill Switch check — every 15s
  useEffect(() => {
    const check = async () => {
      try {
        const res = await base44.functions.invoke('checkKillSwitch', {});
        setKillSwitchStatus(res.data?.kill_switch_active ? 'ACTIVE' : 'INACTIVE');
      } catch { setKillSwitchStatus('ERROR'); }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  const metrics = cleanMetrics?.clean_metrics || {};
  const counts = cleanMetrics?.unique_counts || {};
  const totals = cleanMetrics?.total_counts || {};
  const latestOrders = metrics.latest_orders || [];
  const latestTrades = metrics.latest_trades || [];

  const fmt2 = (v) => parseFloat(v || 0).toFixed(2);
  const fmt4 = (v) => parseFloat(v || 0).toFixed(4);
  const fmt6 = (v) => parseFloat(v || 0).toFixed(6);

  // Compute dust asset value: totalEquity - eq (raw USDT eq)
  const dustValue = (() => {
    const total = parseFloat(okxBalance?.totalEquityUSDT || 0);
    const eq = parseFloat(okxBalance?.rawUsdt?.eq || 0);
    const diff = total - eq;
    return diff > 0 ? diff : 0;
  })();

  const fmtHoldTime = (ms) => {
    if (!ms || ms <= 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">

      {/* ── STATUS BADGE ── always visible ── */}
      <div className="max-w-7xl mx-auto mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-red-950/80 border-2 border-red-600 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-xl">🛑</span>
          <div>
            <div className="text-sm font-black text-red-400 uppercase tracking-widest">TRADING PAUSED BY KILL SWITCH</div>
            <div className="text-xs text-red-300 mt-0.5">No BUY/SELL orders will be executed · status: PAUSED_KILL_SWITCH</div>
          </div>
        </div>
        <div className="flex-1 bg-emerald-950/60 border-2 border-emerald-600 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-xl">👁</span>
          <div>
            <div className="text-sm font-black text-emerald-400 uppercase tracking-widest">READ MODE ACTIVE</div>
            <div className="text-xs text-emerald-300 mt-0.5">READ_ONLY_MONITORING_CONFIRMED · OKX data live</div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* ══════════════════════════════════════════════
            SECTION 1: BALANCE
        ══════════════════════════════════════════════ */}
        <div className={`rounded-2xl p-6 border-2 shadow-2xl ${okxBalance?.success ? 'border-emerald-600 bg-emerald-950/20' : 'border-red-600 bg-red-950/20'}`}>
          <div className="text-xs font-bold text-emerald-400 uppercase mb-4 tracking-widest">
            OKX DATA: LIVE &nbsp;|&nbsp; READ MODE: ACTIVE &nbsp;|&nbsp; TRADING: OFF
          </div>

          {/* Total Equity */}
          <div className="text-5xl font-black text-emerald-400 mb-6">
            {loadBalance ? '...' : `$${fmt2(okxBalance?.totalEquityUSDT)}`}
          </div>

          {/* Balance breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Tile label="Total Equity" value={`$${fmt2(okxBalance?.totalEquityUSDT)}`} color="emerald" loading={loadBalance} />
            <Tile label="Available USDT" value={`$${fmt2(okxBalance?.availableUSDT)}`} color="emerald" loading={loadBalance} />
            <Tile label="Frozen USDT" value={`$${fmt2(okxBalance?.frozenUSDT)}`} color="yellow" loading={loadBalance} />
            <Tile label="Open Orders" value={okxBalance?.openOrdersCount ?? 0} color="slate" loading={loadBalance} />
            <Tile label="Active Positions" value={parseFloat(okxBalance?.nonFreeBal || 0) > 0.01 ? 'YES' : 'NONE'} color={parseFloat(okxBalance?.nonFreeBal || 0) > 0.01 ? 'red' : 'slate'} loading={loadBalance} />
            <Tile label="Dust Assets Value" value={`$${fmt2(dustValue)}`} color="slate" loading={loadBalance} />
          </div>

          {/* Raw OKX USDT object */}
          {okxBalance?.rawUsdt?.eq && (
            <div className="mt-5 p-4 bg-slate-800/30 rounded-lg border border-slate-700 text-xs font-mono">
              <div className="text-slate-400 font-bold mb-2">Raw USDT from OKX API:</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-slate-500">
                {[
                  ['ccy', okxBalance.rawUsdt?.ccy || 'USDT', 'emerald'],
                  ['eq (total)', `$${fmt2(okxBalance.rawUsdt?.eq)}`, 'emerald'],
                  ['cashBal', `$${fmt2(okxBalance.rawUsdt?.cashBal)}`, 'emerald'],
                  ['availBal', `$${fmt2(okxBalance.rawUsdt?.availBal)}`, 'emerald'],
                  ['availEq', `$${fmt2(okxBalance.rawUsdt?.availEq)}`, 'slate'],
                  ['frozenBal', `$${fmt2(okxBalance.rawUsdt?.frozenBal)}`, 'yellow'],
                  ['ordFrozen', `$${fmt2(okxBalance.rawUsdt?.ordFrozen)}`, 'yellow'],
                  ['disEq', `$${fmt2(okxBalance.rawUsdt?.disEq)}`, 'slate'],
                ].map(([k, v, c]) => (
                  <div key={k}>
                    <span className="text-slate-400">{k}:</span>{' '}
                    <span className={`text-${c}-400`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                Mapping: totalEquity=eq | Available=availBal | Frozen=frozenBal+ordFrozen | InPositions=cashBal−availBal
              </div>
            </div>
          )}
          {okxBalance?.timestamp && (
            <div className="text-xs text-slate-500 mt-3">Last fetched: {okxBalance.timestamp}</div>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 2: CLEAN ACCOUNTING SUMMARY
        ══════════════════════════════════════════════ */}
        <div className="rounded-2xl p-6 border-2 border-emerald-600 bg-emerald-950/10">
          <h2 className="text-xl font-bold text-emerald-400 mb-5">✅ CLEAN ACCOUNTING (DEDUPED · SUSPECT FILTERED)</h2>

          {loadMetrics ? <Skeleton className="h-32 bg-slate-800" /> : (
            <>
              {/* Orders row */}
              <div className="mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Orders</div>
              <div className="grid grid-cols-3 lg:grid-cols-3 gap-3 mb-5">
                <Tile label="Total Ledger Records" value={totals.all_ledger ?? 0} color="slate" />
                <Tile label="Unique Clean Orders" value={counts.unique_orders ?? 0} color="emerald" />
                <Tile label="Duplicates Excluded" value={counts.duplicate_orders ?? 0} color="yellow" />
              </div>

              {/* Trades row */}
              <div className="mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Trades</div>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
                <Tile label="Total VerifiedTrade Records" value={totals.all_trades ?? 0} color="slate" />
                <Tile label="Unique Clean Trades" value={counts.unique_trades ?? 0} color="emerald" />
                <Tile label="Duplicates Excluded" value={counts.duplicate_trades ?? 0} color="yellow" />
                <Tile label="Mismatched PnL Excl." value={counts.mismatched_pnl_trades ?? 0} color="orange" />
                <Tile label="Suspect Excluded" value={counts.suspect_trades ?? 0} color="red" />
                <Tile label="Invalid Excluded" value={counts.invalid_trades ?? 0} color="red" />
              </div>

              {/* P&L row */}
              <div className="mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Performance</div>
              <div className="grid grid-cols-3 gap-3">
                <Tile
                  label="Clean Net P&L"
                  value={`${(metrics.net_pnl || 0) >= 0 ? '+' : ''}${fmt4(metrics.net_pnl)} USDT`}
                  color={(metrics.net_pnl || 0) >= 0 ? 'emerald' : 'red'}
                />
                <Tile label="Clean Fees" value={`${fmt4(metrics.fees)} USDT`} color="red" />
                <Tile
                  label="Clean Win Rate"
                  value={`${parseFloat(metrics.win_rate || 0).toFixed(1)}%  (${metrics.wins || 0}W/${metrics.losses || 0}L)`}
                  color="cyan"
                />
              </div>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 3: CLEAN DATA TABLES
        ══════════════════════════════════════════════ */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="orders" className="text-sm">Latest 10 Clean Orders</TabsTrigger>
            <TabsTrigger value="trades" className="text-sm">Latest 10 Clean Trades</TabsTrigger>
          </TabsList>

          {/* ORDERS TABLE */}
          <TabsContent value="orders" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-emerald-400">Last 10 Clean Orders</h3>
              <span className="text-xs text-slate-500">Unique by ordId · instId · side</span>
              </div>
              {loadMetrics ? <Skeleton className="h-40 bg-slate-800" /> :
              latestOrders.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No clean orders</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400">
                        <th className="text-left px-2 py-2">#</th>
                        <th className="text-left px-2 py-2">ordId (full)</th>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-left px-2 py-2">Side</th>
                        <th className="text-right px-2 py-2">Price</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">Fee</th>
                        <th className="text-left px-2 py-2">fillTime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestOrders.map((o, i) => (
                        <tr key={o.ordId || i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-2 py-2 font-mono text-slate-200 text-xs select-all">
                            {o.ordId || '—'}
                          </td>
                          <td className="px-2 py-2 font-bold text-white">{o.instId}</td>
                          <td className={`px-2 py-2 font-bold ${o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {o.side?.toUpperCase()}
                          </td>
                          <td className="px-2 py-2 text-right">${fmt2(o.avgPx)}</td>
                          <td className="px-2 py-2 text-right text-slate-400">{fmt6(o.accFillSz)}</td>
                          <td className="px-2 py-2 text-right text-red-400">{fmt4(o.fee)}</td>
                          <td className="px-2 py-2 text-slate-400 text-xs whitespace-nowrap">
                            {o.timestamp ? new Date(o.timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TRADES TABLE */}
          <TabsContent value="trades" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-emerald-400">Last 10 Clean Closed Trades</h3>
                <span className="text-xs text-slate-500">Unique by buyOrdId+sellOrdId · verified · no suspect/mismatch</span>
              </div>
              {loadMetrics ? <Skeleton className="h-40 bg-slate-800" /> :
                latestTrades.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">No clean trades</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-slate-700">
                        <tr className="text-slate-400">
                          <th className="text-left px-2 py-2">#</th>
                          <th className="text-left px-2 py-2">Pair</th>
                          <th className="text-left px-2 py-2">buyOrdId (full)</th>
                          <th className="text-left px-2 py-2">sellOrdId (full)</th>
                          <th className="text-right px-2 py-2">Entry</th>
                          <th className="text-right px-2 py-2">Exit</th>
                          <th className="text-right px-2 py-2">netPnL</th>
                          <th className="text-right px-2 py-2">pnl%</th>
                          <th className="text-right px-2 py-2">holdTime</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestTrades.map((t, i) => {
                          const pnl = parseFloat(t.realizedPnL || 0);
                          const pnlPct = parseFloat(t.realizedPnLPct || 0);
                          const pnlClass = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
                          return (
                            <tr key={`${t.buyOrdId}-${t.sellOrdId}`} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                              <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                              <td className="px-2 py-2 font-bold text-white">{t.instId}</td>
                              <td className="px-2 py-2 font-mono text-emerald-300 text-xs select-all">
                                {t.buyOrdId || '—'}
                              </td>
                              <td className="px-2 py-2 font-mono text-red-300 text-xs select-all">
                                {t.sellOrdId || '—'}
                              </td>
                              <td className="px-2 py-2 text-right">${fmt2(t.buyPrice)}</td>
                              <td className="px-2 py-2 text-right">${fmt2(t.sellPrice)}</td>
                              <td className={`px-2 py-2 text-right font-bold ${pnlClass}`}>
                                {pnl >= 0 ? '+' : ''}{fmt4(pnl)}
                              </td>
                              <td className={`px-2 py-2 text-right font-bold ${pnlClass}`}>
                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(3)}%
                              </td>
                              <td className="px-2 py-2 text-right text-slate-400">
                                {fmtHoldTime(t.holdingMs)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ══════════════════════════════════════════════
            SECTION 4: ACTION PANEL
        ══════════════════════════════════════════════ */}
        <div className="rounded-2xl p-5 border border-slate-700 bg-slate-900/50">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Actions</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {/* ENABLED safe actions */}
            <ActionBtn label="🔄 Refresh OKX Balance" enabled onClick={() => base44.functions.invoke('okxLiveBalance', {})} />
            <ActionBtn label="📥 Sync OKX Fills" enabled onClick={() => base44.functions.invoke('syncOKXOrderLedger', {})} />
            <ActionBtn label="🔧 Rebuild Accounting" enabled onClick={() => base44.functions.invoke('finalCleanMetricsWithDedup', {})} />
            <ActionBtn label="📋 View Audit" enabled onClick={() => window.open('/OKXDataSync', '_blank')} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* DISABLED — trading buttons */}
            <ActionBtn label="🚫 Start Alpha Scalper" enabled={false} disabledReason="Kill switch active" />
            <ActionBtn label="🚫 Run One Cycle" enabled={false} disabledReason="Kill switch active" />
            <ActionBtn label="🚫 Execute Trade" enabled={false} disabledReason="Kill switch active" />
            <ActionBtn label="🚫 Run Bot Trades" enabled={false} disabledReason="Kill switch active" />
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            SECTION 5: SYSTEM STATUS
        ══════════════════════════════════════════════ */}
        <div className="rounded-2xl p-5 border-2 border-red-700 bg-red-950/20">
          <h3 className="text-base font-bold text-red-400 mb-4">🔒 SYSTEM STATUS</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatusBadge label="Kill Switch Active" value={true} trueColor="red" />
            <StatusBadge label="Trading Paused" value={true} trueColor="red" />
            <StatusBadge label="Read Mode Active" value={true} trueColor="emerald" />
            <StatusBadge label="Trading Mode OFF" value={true} trueColor="emerald" />
          </div>
          <div className="mt-4 text-xs text-red-300 font-mono">
            PAUSED_KILL_SWITCH · OKX DATA: LIVE · No BUY/SELL orders will be placed
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Small reusable tile ──
function Tile({ label, value, color = 'slate', loading = false }) {
  const colorMap = {
    emerald: 'text-emerald-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400',
    orange: 'text-orange-400',
    slate: 'text-slate-300',
  };
  return (
    <div className="bg-slate-900/70 rounded-xl p-4 border border-slate-700">
      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      {loading ? (
        <div className="h-6 bg-slate-700 rounded animate-pulse w-16" />
      ) : (
        <div className={`text-xl font-bold ${colorMap[color] || 'text-white'}`}>{value}</div>
      )}
    </div>
  );
}

// ── Action button ──
function ActionBtn({ label, enabled, onClick, disabledReason }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      title={!enabled ? disabledReason : undefined}
      className={`rounded-xl px-4 py-3 text-xs font-bold border transition-all text-left ${
        enabled
          ? 'bg-slate-800 border-emerald-700 text-emerald-300 hover:bg-emerald-900/40 cursor-pointer'
          : 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
      }`}
    >
      {label}
      {!enabled && <div className="text-slate-700 font-normal mt-0.5">{disabledReason}</div>}
    </button>
  );
}

// ── Status badge ──
function StatusBadge({ label, value, trueColor = 'emerald' }) {
  const on = value === true;
  const colorMap = { emerald: 'text-emerald-400', red: 'text-red-400' };
  return (
    <div className="bg-slate-900/70 rounded-xl p-4 border border-slate-700 flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-bold ${on ? colorMap[trueColor] : 'text-slate-500'}`}>
        {on ? '● YES' : '○ NO'}
      </span>
    </div>
  );
}