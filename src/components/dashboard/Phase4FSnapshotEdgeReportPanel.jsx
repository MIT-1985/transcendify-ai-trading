import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const STATUS_CONFIG = {
  COLLECTING_LINKAGE_DATA:                  { color: 'text-slate-400',   bg: 'bg-slate-800/60 border-slate-600',   icon: '⏳', label: 'Collecting Data' },
  SNAPSHOT_LINKAGE_PROMISING:               { color: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-600', icon: '🌟', label: 'Promising' },
  READY_SNAPSHOT_EDGE_CONFIRMED_SHORT_TERM: { color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-600', icon: '✅', label: 'Edge Confirmed (24h)' },
  READY_SNAPSHOT_EDGE_CONFIRMED_7D:         { color: 'text-cyan-400',    bg: 'bg-cyan-900/30 border-cyan-600',     icon: '🏆', label: 'Edge Confirmed (7d)' },
  READY_SNAPSHOT_NOT_PROFITABLE_YET:        { color: 'text-red-400',     bg: 'bg-red-900/30 border-red-600',       icon: '❌', label: 'Not Profitable Yet' },
};

function Metric({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-lg ${color}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function EdgeCompare({ label24h, linked24h, unlinked24h, label7d, linked7d, unlinked7d, colorFn }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label24h} vs Unlinked</div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500 mb-0.5">Linked 24h</div>
          <div className={`font-black text-base ${colorFn ? colorFn(linked24h) : 'text-white'}`}>{linked24h}</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Unlinked 24h</div>
          <div className={`font-black text-base ${colorFn ? colorFn(unlinked24h) : 'text-white'}`}>{unlinked24h}</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Linked 7d</div>
          <div className={`font-black text-base ${colorFn ? colorFn(linked7d) : 'text-white'}`}>{linked7d}</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Unlinked 7d</div>
          <div className={`font-black text-base ${colorFn ? colorFn(unlinked7d) : 'text-white'}`}>{unlinked7d}</div>
        </div>
      </div>
    </div>
  );
}

export default function Phase4FSnapshotEdgeReportPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    const res = await base44.functions.invoke('phase4FSnapshotEdgeReport', {});
    if (res.data?.error) {
      setError(res.data.error);
    } else {
      setData(res.data);
    }
    setLoading(false);
  };

  const s    = data?.snapshotStats || {};
  const tl   = data?.tradeLinkageStats || {};
  const dec  = data?.decision || {};
  const meta = data?.meta || {};
  const safe = data?.safety || {};
  const st   = STATUS_CONFIG[dec.status] || STATUS_CONFIG.COLLECTING_LINKAGE_DATA;

  const pnlColor   = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
  const rateColor  = v => v >= 55 ? 'text-emerald-400' : v >= 45 ? 'text-yellow-400' : 'text-red-400';
  const edgeColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PHASE 4F</div>
          <h2 className="text-xl font-black text-white">Snapshot Edge Report</h2>
          <div className="text-xs text-slate-400 mt-1">
            Analyzes SignalSnapshot → PaperTrade linkage to quantify READY-snapshot edge vs unlinked trades.
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-5 py-2.5 text-xs font-bold rounded-xl bg-purple-700/30 border border-purple-600 hover:bg-purple-700/50 text-purple-300 disabled:opacity-50 transition-all shrink-0"
        >
          {loading ? '⏳ Analysing…' : '▶ Run Edge Report'}
        </button>
      </div>

      {/* Safety */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-red-950/40 border border-red-700 text-red-400 rounded-lg px-3 py-1 font-bold">🛑 Kill Switch Active</span>
        <span className="bg-slate-800 border border-slate-700 text-slate-400 rounded-lg px-3 py-1">realTradeAllowed: false</span>
        <span className="bg-slate-800 border border-slate-700 text-slate-400 rounded-lg px-3 py-1">noOKXOrderEndpointCalled: true</span>
        <span className="bg-purple-950/40 border border-purple-700 text-purple-400 rounded-lg px-3 py-1 font-bold">📊 PHASE_4F_SNAPSHOT_EDGE_REPORT</span>
        <span className="bg-cyan-950/40 border border-cyan-700 text-cyan-400 rounded-lg px-3 py-1 font-bold">🔍 filterMode: PHASE_4F_ONLY</span>
      </div>

      {/* Phase 4F filter notice */}
      <div className="bg-cyan-950/20 border border-cyan-800 rounded-xl px-4 py-3 text-xs">
        <span className="text-cyan-400 font-black">Phase 4F-only data. Legacy BTC trades excluded.</span>
        <span className="text-cyan-300/70 ml-2">Only trades created after Phase 4F activation are analyzed. Old BTC trades visible only in Archive / Legacy.</span>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {loading && (
        <div className="text-center text-slate-400 py-16 text-sm animate-pulse">Running analysis…</div>
      )}

      {data && (
        <div className="space-y-6">

          {/* Decision Status */}
          <div className={`border-2 rounded-2xl px-6 py-5 ${st.bg}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="text-4xl">{st.icon}</div>
              <div>
                <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${st.color}`}>{st.label}</div>
                <div className={`text-xl font-black ${st.color}`}>{dec.status}</div>
                <div className="text-slate-300 text-sm mt-1">{dec.statusReason}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div className="bg-slate-900/40 rounded-lg px-3 py-2">
                <div className="text-slate-500 mb-0.5">Generated At</div>
                <div className="text-white font-bold">{data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('de-DE') : '—'}</div>
              </div>
              <div className="bg-cyan-950/40 border border-cyan-800 rounded-lg px-3 py-2">
                <div className="text-cyan-500 mb-0.5">Phase 4F Trades</div>
                <div className="text-cyan-300 font-black">{data.includedPhase4FTrades ?? 0}</div>
              </div>
              <div className="bg-amber-950/30 border border-amber-800 rounded-lg px-3 py-2">
                <div className="text-amber-500 mb-0.5">Legacy Excluded</div>
                <div className="text-amber-400 font-black">{data.excludedLegacyBTCTrades ?? 0}</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg px-3 py-2">
                <div className="text-slate-500 mb-0.5">P4F Snapshots</div>
                <div className="text-white font-bold">{data.includedPhase4FSnapshots ?? 0}</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg px-3 py-2">
                <div className="text-slate-500 mb-0.5">Snapshots (24h)</div>
                <div className="text-white font-bold">{meta.totalSnapshotsAnalyzed24h}</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg px-3 py-2">
                <div className="text-slate-500 mb-0.5">All BTC in DB</div>
                <div className="text-slate-400 font-bold">{meta.totalBTCTradesInDB}</div>
              </div>
            </div>
            {data.phase4FActivationTimestamp && (
              <div className="mt-2 text-xs text-cyan-600 font-mono">
                Activation cutoff: {data.phase4FActivationTimestamp}
              </div>
            )}
          </div>

          {/* Snapshot Stats */}
          <Section title="📸 Snapshot Statistics — 24h">
            <Metric label="HOT Snapshots" value={s.hotSnapshots24h} color="text-orange-400" />
            <Metric label="READY Snapshots" value={s.readySnapshots24h} color="text-emerald-400" />
            <Metric
              label="HOT→READY Conversion"
              value={`${s.hotToReadyConversion24h}%`}
              color={s.hotToReadyConversion24h >= 30 ? 'text-emerald-400' : 'text-yellow-400'}
              sub="% of HOTs that became READY"
            />
          </Section>

          <Section title="📸 Snapshot Statistics — 7d">
            <Metric label="HOT Snapshots" value={s.hotSnapshots7d} color="text-orange-400" />
            <Metric label="READY Snapshots" value={s.readySnapshots7d} color="text-emerald-400" />
            <Metric
              label="HOT→READY Conversion"
              value={`${s.hotToReadyConversion7d}%`}
              color={s.hotToReadyConversion7d >= 30 ? 'text-emerald-400' : 'text-yellow-400'}
              sub="% of HOTs that became READY"
            />
          </Section>

          {/* Trade Linkage 24h */}
          <Section title="🔗 Trade Linkage — 24h">
            <Metric label="Total BTC Trades" value={tl.totalBTCTrades24h} />
            <Metric label="Linked Trades" value={tl.linkedTrades24h} color="text-emerald-400" />
            <Metric label="Unlinked Trades" value={tl.unlinkedTrades24h} color="text-slate-400" />
            <Metric
              label="Edge Delta (avg PnL)"
              value={`${tl.linkageEdgeDelta24h >= 0 ? '+' : ''}${tl.linkageEdgeDelta24h} USDT`}
              color={edgeColor(tl.linkageEdgeDelta24h)}
              sub="Linked avg − Unlinked avg"
            />
            <Metric label="Linked Win Rate" value={`${tl.linkedWinRate24h}%`} color={rateColor(tl.linkedWinRate24h)} />
            <Metric label="Unlinked Win Rate" value={`${tl.unlinkedWinRate24h}%`} color={rateColor(tl.unlinkedWinRate24h)} />
            <Metric label="Linked Net PnL" value={`${tl.linkedNetPnL24h >= 0 ? '+' : ''}${tl.linkedNetPnL24h} USDT`} color={pnlColor(tl.linkedNetPnL24h)} />
            <Metric label="Unlinked Net PnL" value={`${tl.unlinkedNetPnL24h >= 0 ? '+' : ''}${tl.unlinkedNetPnL24h} USDT`} color={pnlColor(tl.unlinkedNetPnL24h)} />
            <Metric label="Linked Avg PnL" value={`${tl.linkedAverageNetPnL24h >= 0 ? '+' : ''}${tl.linkedAverageNetPnL24h} USDT`} color={pnlColor(tl.linkedAverageNetPnL24h)} />
            <Metric label="Unlinked Avg PnL" value={`${tl.unlinkedAverageNetPnL24h >= 0 ? '+' : ''}${tl.unlinkedAverageNetPnL24h} USDT`} color={pnlColor(tl.unlinkedAverageNetPnL24h)} />
          </Section>

          {/* Trade Linkage 7d */}
          <Section title="🔗 Trade Linkage — 7d">
            <Metric label="Total BTC Trades" value={tl.totalBTCTrades7d} />
            <Metric label="Linked Trades" value={tl.linkedTrades7d} color="text-emerald-400" />
            <Metric label="Unlinked Trades" value={tl.unlinkedTrades7d} color="text-slate-400" />
            <Metric
              label="Edge Delta (avg PnL)"
              value={`${tl.linkageEdgeDelta7d >= 0 ? '+' : ''}${tl.linkageEdgeDelta7d} USDT`}
              color={edgeColor(tl.linkageEdgeDelta7d)}
              sub="Linked avg − Unlinked avg"
            />
            <Metric label="Linked Win Rate" value={`${tl.linkedWinRate7d}%`} color={rateColor(tl.linkedWinRate7d)} />
            <Metric label="Unlinked Win Rate" value={`${tl.unlinkedWinRate7d}%`} color={rateColor(tl.unlinkedWinRate7d)} />
            <Metric label="Linked Net PnL" value={`${tl.linkedNetPnL7d >= 0 ? '+' : ''}${tl.linkedNetPnL7d} USDT`} color={pnlColor(tl.linkedNetPnL7d)} />
            <Metric label="Unlinked Net PnL" value={`${tl.unlinkedNetPnL7d >= 0 ? '+' : ''}${tl.unlinkedNetPnL7d} USDT`} color={pnlColor(tl.unlinkedNetPnL7d)} />
            <Metric label="Linked Avg PnL" value={`${tl.linkedAverageNetPnL7d >= 0 ? '+' : ''}${tl.linkedAverageNetPnL7d} USDT`} color={pnlColor(tl.linkedAverageNetPnL7d)} />
            <Metric label="Unlinked Avg PnL" value={`${tl.unlinkedAverageNetPnL7d >= 0 ? '+' : ''}${tl.unlinkedAverageNetPnL7d} USDT`} color={pnlColor(tl.unlinkedAverageNetPnL7d)} />
          </Section>

          {/* Visual Comparison */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1">⚖️ Linked vs Unlinked Comparison</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EdgeCompare
                label24h="Win Rate"
                linked24h={`${tl.linkedWinRate24h}%`}
                unlinked24h={`${tl.unlinkedWinRate24h}%`}
                linked7d={`${tl.linkedWinRate7d}%`}
                unlinked7d={`${tl.unlinkedWinRate7d}%`}
                colorFn={v => parseFloat(v) >= 55 ? 'text-emerald-400' : parseFloat(v) >= 45 ? 'text-yellow-400' : 'text-red-400'}
              />
              <EdgeCompare
                label24h="Net PnL (USDT)"
                linked24h={`${tl.linkedNetPnL24h >= 0 ? '+' : ''}${tl.linkedNetPnL24h}`}
                unlinked24h={`${tl.unlinkedNetPnL24h >= 0 ? '+' : ''}${tl.unlinkedNetPnL24h}`}
                linked7d={`${tl.linkedNetPnL7d >= 0 ? '+' : ''}${tl.linkedNetPnL7d}`}
                unlinked7d={`${tl.unlinkedNetPnL7d >= 0 ? '+' : ''}${tl.unlinkedNetPnL7d}`}
                colorFn={v => parseFloat(v) > 0 ? 'text-emerald-400' : parseFloat(v) < 0 ? 'text-red-400' : 'text-slate-400'}
              />
              <EdgeCompare
                label24h="Avg PnL/Trade"
                linked24h={`${tl.linkedAverageNetPnL24h >= 0 ? '+' : ''}${tl.linkedAverageNetPnL24h}`}
                unlinked24h={`${tl.unlinkedAverageNetPnL24h >= 0 ? '+' : ''}${tl.unlinkedAverageNetPnL24h}`}
                linked7d={`${tl.linkedAverageNetPnL7d >= 0 ? '+' : ''}${tl.linkedAverageNetPnL7d}`}
                unlinked7d={`${tl.unlinkedAverageNetPnL7d >= 0 ? '+' : ''}${tl.unlinkedAverageNetPnL7d}`}
                colorFn={v => parseFloat(v) > 0 ? 'text-emerald-400' : parseFloat(v) < 0 ? 'text-red-400' : 'text-slate-400'}
              />
            </div>
          </div>

          {/* Safety Footer */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">🛡 Safety Verification</div>
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(safe).map(([k, v]) => (
                <span key={k} className={`px-2 py-1 rounded-lg border font-bold ${
                  v === true && k !== 'killSwitchActive' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/20' :
                  v === true && k === 'killSwitchActive' ? 'text-red-400 border-red-800 bg-red-950/20' :
                  v === false ? 'text-red-400 border-red-800 bg-red-950/20' :
                  'text-slate-400 border-slate-700 bg-slate-800/40'
                }`}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          </div>

        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 py-16 text-sm">
          Click <span className="text-purple-400 font-bold">Run Edge Report</span> to analyse snapshot linkage performance.
        </div>
      )}
    </div>
  );
}