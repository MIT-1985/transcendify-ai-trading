import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const STATUS_CONFIG = {
  COLLECTING_LINKAGE_DATA:                  { color: 'text-slate-400',   border: 'border-slate-600',   bg: 'bg-slate-800/50',   icon: '⏳' },
  SNAPSHOT_LINKAGE_PROMISING:               { color: 'text-yellow-400',  border: 'border-yellow-600',  bg: 'bg-yellow-900/20',  icon: '🌟' },
  READY_SNAPSHOT_EDGE_CONFIRMED_SHORT_TERM: { color: 'text-emerald-400', border: 'border-emerald-600', bg: 'bg-emerald-900/20', icon: '✅' },
  READY_SNAPSHOT_EDGE_CONFIRMED_7D:         { color: 'text-cyan-400',    border: 'border-cyan-600',    bg: 'bg-cyan-900/20',    icon: '🏆' },
  READY_SNAPSHOT_NOT_PROFITABLE_YET:        { color: 'text-red-400',     border: 'border-red-600',     bg: 'bg-red-900/20',     icon: '❌' },
};

function Chip({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2 text-center">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`font-black text-base ${color}`}>{value}</div>
    </div>
  );
}

function ConversionBar({ hot, ready, pct }) {
  const filled = Math.min(100, pct);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>HOT <span className="text-orange-400 font-bold">{hot}</span></span>
        <span>READY <span className="text-emerald-400 font-bold">{ready}</span></span>
        <span className={`font-black ${pct >= 30 ? 'text-emerald-400' : 'text-yellow-400'}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 30 ? 'bg-emerald-500' : 'bg-yellow-500'}`}
          style={{ width: `${filled}%` }}
        />
      </div>
    </div>
  );
}

export default function Phase4FSnapshotEdgeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshed, setRefreshed] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase4FSnapshotEdgeReport', {});
    if (res.data?.error) {
      setError(res.data.error);
    } else {
      setData(res.data);
      setRefreshed(new Date().toLocaleTimeString('de-DE'));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const s   = data?.snapshotStats || {};
  const tl  = data?.tradeLinkageStats || {};
  const dec = data?.decision || {};
  const st  = STATUS_CONFIG[dec.status] || STATUS_CONFIG.COLLECTING_LINKAGE_DATA;

  const pnlColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
  const edgeColor = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
  const rateColor = v => v >= 55 ? 'text-emerald-400' : v >= 45 ? 'text-yellow-400' : 'text-red-400';
  const sign      = v => (v >= 0 ? '+' : '') + v;

  return (
    <div className="space-y-4">

      {/* Safety Banner */}
      <div className="bg-red-950/40 border-2 border-red-700 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xl">🔒</span>
        <div>
          <div className="text-red-400 font-black text-sm">REAL TRADING LOCKED</div>
          <div className="text-red-300 text-xs mt-0.5">
            killSwitchActive=true · realTradeAllowed=false · noOKXOrderEndpointCalled=true · PAPER ONLY
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {refreshed && <span className="text-slate-500 text-xs">Loaded {refreshed}</span>}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-all"
          >
            {loading ? '⏳' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-600 rounded-xl p-3 text-red-300 text-xs">{error}</div>
      )}

      {loading && !data && (
        <div className="text-center text-slate-500 py-12 text-sm animate-pulse">Loading snapshot edge data…</div>
      )}

      {data && (
        <div className="space-y-4">

          {/* Decision Status */}
          <div className={`border-2 rounded-2xl px-5 py-4 ${st.bg} ${st.border}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{st.icon}</span>
              <div>
                <div className={`text-xs font-bold uppercase tracking-widest ${st.color}`}>Decision Status</div>
                <div className={`text-lg font-black ${st.color}`}>{dec.status}</div>
              </div>
            </div>
            <div className="text-slate-300 text-xs leading-relaxed">{dec.statusReason}</div>
          </div>

          {/* HOT → READY Conversion */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4 space-y-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">📸 HOT → READY Conversion</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 mb-1.5">Last 24h</div>
                <ConversionBar hot={s.hotSnapshots24h ?? 0} ready={s.readySnapshots24h ?? 0} pct={s.hotToReadyConversion24h ?? 0} />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1.5">Last 7 days</div>
                <ConversionBar hot={s.hotSnapshots7d ?? 0} ready={s.readySnapshots7d ?? 0} pct={s.hotToReadyConversion7d ?? 0} />
              </div>
            </div>
          </div>

          {/* Linked vs Unlinked 24h */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">🔗 Linked vs Unlinked Trades — 24h</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Chip label="Total Trades" value={tl.totalBTCTrades24h ?? '—'} />
              <Chip label="Linked" value={tl.linkedTrades24h ?? '—'} color="text-emerald-400" />
              <Chip label="Unlinked" value={tl.unlinkedTrades24h ?? '—'} color="text-slate-400" />
              <Chip
                label="Edge Delta"
                value={tl.linkageEdgeDelta24h != null ? `${sign(tl.linkageEdgeDelta24h)} USDT` : '—'}
                color={edgeColor(tl.linkageEdgeDelta24h ?? 0)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Chip label="Linked Win%" value={tl.linkedWinRate24h != null ? `${tl.linkedWinRate24h}%` : '—'} color={rateColor(tl.linkedWinRate24h ?? 0)} />
              <Chip label="Unlinked Win%" value={tl.unlinkedWinRate24h != null ? `${tl.unlinkedWinRate24h}%` : '—'} color={rateColor(tl.unlinkedWinRate24h ?? 0)} />
              <Chip label="Linked PnL" value={tl.linkedNetPnL24h != null ? `${sign(tl.linkedNetPnL24h)} USDT` : '—'} color={pnlColor(tl.linkedNetPnL24h ?? 0)} />
              <Chip label="Unlinked PnL" value={tl.unlinkedNetPnL24h != null ? `${sign(tl.unlinkedNetPnL24h)} USDT` : '—'} color={pnlColor(tl.unlinkedNetPnL24h ?? 0)} />
            </div>
          </div>

          {/* Linked vs Unlinked 7d */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4 space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">🔗 Linked vs Unlinked Trades — 7d</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Chip label="Total Trades" value={tl.totalBTCTrades7d ?? '—'} />
              <Chip label="Linked" value={tl.linkedTrades7d ?? '—'} color="text-emerald-400" />
              <Chip label="Unlinked" value={tl.unlinkedTrades7d ?? '—'} color="text-slate-400" />
              <Chip
                label="Edge Delta"
                value={tl.linkageEdgeDelta7d != null ? `${sign(tl.linkageEdgeDelta7d)} USDT` : '—'}
                color={edgeColor(tl.linkageEdgeDelta7d ?? 0)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Chip label="Linked Win%" value={tl.linkedWinRate7d != null ? `${tl.linkedWinRate7d}%` : '—'} color={rateColor(tl.linkedWinRate7d ?? 0)} />
              <Chip label="Unlinked Win%" value={tl.unlinkedWinRate7d != null ? `${tl.unlinkedWinRate7d}%` : '—'} color={rateColor(tl.unlinkedWinRate7d ?? 0)} />
              <Chip label="Linked PnL" value={tl.linkedNetPnL7d != null ? `${sign(tl.linkedNetPnL7d)} USDT` : '—'} color={pnlColor(tl.linkedNetPnL7d ?? 0)} />
              <Chip label="Unlinked PnL" value={tl.unlinkedNetPnL7d != null ? `${sign(tl.unlinkedNetPnL7d)} USDT` : '—'} color={pnlColor(tl.unlinkedNetPnL7d ?? 0)} />
            </div>
          </div>

          {/* Edge Delta Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`rounded-2xl border-2 px-5 py-4 ${(tl.linkageEdgeDelta24h ?? 0) > 0 ? 'border-emerald-700 bg-emerald-950/20' : 'border-red-800 bg-red-950/10'}`}>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">📈 P&L Edge Delta — 24h</div>
              <div className={`text-3xl font-black ${edgeColor(tl.linkageEdgeDelta24h ?? 0)}`}>
                {tl.linkageEdgeDelta24h != null ? `${sign(tl.linkageEdgeDelta24h)} USDT` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-1">Linked avg/trade − Unlinked avg/trade</div>
            </div>
            <div className={`rounded-2xl border-2 px-5 py-4 ${(tl.linkageEdgeDelta7d ?? 0) > 0 ? 'border-emerald-700 bg-emerald-950/20' : 'border-red-800 bg-red-950/10'}`}>
              <div className="text-xs text-slate-400 uppercase tracking-widest mb-1">📈 P&L Edge Delta — 7d</div>
              <div className={`text-3xl font-black ${edgeColor(tl.linkageEdgeDelta7d ?? 0)}`}>
                {tl.linkageEdgeDelta7d != null ? `${sign(tl.linkageEdgeDelta7d)} USDT` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-1">Linked avg/trade − Unlinked avg/trade</div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}