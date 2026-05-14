import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

function MetricBox({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-center">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-black text-xl ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function SnapshotRow({ snap }) {
  const isoStr = snap.timestamp || snap.created_date;
  const time   = isoStr ? new Date(isoStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const date   = isoStr ? new Date(isoStr).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }) : '';
  const isReady = snap.alertLevel === 'READY';
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${isReady ? 'border-emerald-700/40 bg-emerald-950/20' : 'border-orange-700/30 bg-orange-950/10'}`}>
      <span className={`font-black w-14 text-center ${isReady ? 'text-emerald-400' : 'text-orange-400'}`}>
        {isReady ? '🟢 READY' : '🔥 HOT'}
      </span>
      <span className="text-slate-300 font-mono">{time}</span>
      <span className="text-slate-600 text-xs">{date}</span>
      <span className="text-slate-400">Score <span className={`font-bold ${snap.totalScore >= snap.requiredScore ? 'text-emerald-400' : 'text-orange-300'}`}>{snap.totalScore}</span></span>
      <span className="text-slate-400">BTC <span className="text-white font-bold">${snap.lastPrice?.toLocaleString()}</span></span>
      <span className="text-slate-400">RSI <span className="text-white">{snap.rsi}</span></span>
      <span className="text-slate-400">Momentum <span className="text-white">{snap.momentumPercent?.toFixed(3)}%</span></span>
      {snap.failedBarriers?.length > 0 && (
        <span className="text-slate-600 truncate max-w-[180px]">
          ✗ {snap.failedBarriers.slice(0, 2).join(', ')}{snap.failedBarriers.length > 2 ? ` +${snap.failedBarriers.length - 2}` : ''}
        </span>
      )}
    </div>
  );
}

export default function Phase4FSnapshotPanel() {
  const [snapshots, setSnapshots] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastAt,    setLastAt]    = useState(null);

  const loadSnapshots = async () => {
    setLoading(true); setError(null);
    try {
      const all = await base44.entities.SignalSnapshot.filter(
        { mode: 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE' },
        '-timestamp',
        200
      );
      setSnapshots(all);
      setLastAt(new Date());
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const now24h = Date.now() - 24 * 60 * 60 * 1000;
  const recent = snapshots ? snapshots.filter(s => new Date(s.timestamp || s.created_date).getTime() > now24h) : [];
  const ready24h   = recent.filter(s => s.alertLevel === 'READY').length;
  const hot24h     = recent.filter(s => s.alertLevel === 'HOT').length;
  const total24h   = ready24h + hot24h;
  const convRate   = hot24h > 0 ? ((ready24h / (hot24h + ready24h)) * 100).toFixed(1) : null;
  const lastReady  = snapshots ? snapshots.find(s => s.alertLevel === 'READY') : null;
  const lastHot    = snapshots ? snapshots.find(s => s.alertLevel === 'HOT')   : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">📸 READY Signal Snapshots</h3>
          <p className="text-slate-400 text-xs mt-0.5">Tracks HOT & READY occurrences — read-only, no orders, kill switch active.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastAt && <span className="text-xs text-slate-600">{lastAt.toLocaleTimeString('de-DE')}</span>}
          <Button size="sm" onClick={loadSnapshots} disabled={loading} className="bg-slate-700 hover:bg-slate-600 text-white text-xs">
            {loading ? '⏳' : '🔄 Load'}
          </Button>
        </div>
      </div>

      {/* Safety strip */}
      <div className="flex flex-wrap gap-2">
        {['realTradeAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true'].map(l => (
          <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
        ))}
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {!snapshots && !loading && (
        <div className="text-center text-slate-500 text-sm py-10">
          <div className="text-2xl mb-2">📸</div>
          Click Load to fetch HOT &amp; READY snapshots.
        </div>
      )}

      {snapshots && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBox
              label="READY (24h)"
              value={ready24h}
              sub={`of ${total24h} total`}
              color={ready24h > 0 ? 'text-emerald-400' : 'text-slate-400'}
            />
            <MetricBox
              label="HOT (24h)"
              value={hot24h}
              color={hot24h > 0 ? 'text-orange-400' : 'text-slate-400'}
            />
            <MetricBox
              label="HOT→READY Rate"
              value={convRate !== null ? `${convRate}%` : 'N/A'}
              sub={convRate !== null ? `${ready24h} READY / ${hot24h} HOT` : 'Need HOT data'}
              color={convRate !== null && parseFloat(convRate) > 20 ? 'text-emerald-400' : 'text-yellow-400'}
            />
            <MetricBox
              label="Total Snapshots"
              value={snapshots.length}
              sub="all time"
              color="text-slate-300"
            />
          </div>

          {/* Last READY snapshot */}
          {lastReady && (
            <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2">🟢 Last READY Snapshot</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ['Time',      new Date(lastReady.timestamp || lastReady.created_date).toLocaleString('de-DE')],
                  ['Score',     `${lastReady.totalScore} / ${lastReady.requiredScore}`],
                  ['BTC Price', `$${lastReady.lastPrice?.toLocaleString()}`],
                  ['RSI',       lastReady.rsi],
                  ['Momentum',  `${lastReady.momentumPercent?.toFixed(4)}%`],
                  ['BuyPress',  `${lastReady.buyPressurePercent?.toFixed(1)}%`],
                  ['TickScore', lastReady.tickScore],
                  ['Barriers ✓', lastReady.passedBarriers?.length ?? '—'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-slate-900/40 rounded-lg px-2 py-1.5">
                    <div className="text-slate-500 mb-0.5">{l}</div>
                    <div className="text-emerald-300 font-bold">{v}</div>
                  </div>
                ))}
              </div>
              {lastReady.failedBarriers?.length === 0 && (
                <div className="mt-2 text-xs text-emerald-400 font-bold">✅ All barriers passed — full READY signal</div>
              )}
            </div>
          )}

          {/* Recent snapshot list */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Recent Snapshots (latest 30)</div>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {snapshots.slice(0, 30).map((s, i) => (
                <SnapshotRow key={s.id || i} snap={s} />
              ))}
              {snapshots.length === 0 && (
                <div className="text-slate-600 text-sm text-center py-6">No HOT or READY snapshots yet. Run the diagnostic to generate them.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}