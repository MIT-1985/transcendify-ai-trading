import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const pnlColor = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';

function DiffRow({ label, oldVal, newVal }) {
  const changed = String(oldVal) !== String(newVal);
  return (
    <div className={`grid grid-cols-3 gap-2 text-xs py-1.5 border-b border-slate-800/50 last:border-0 ${changed ? 'bg-yellow-950/10' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <span className={`text-right font-mono ${changed ? 'text-orange-400 line-through opacity-60' : 'text-slate-500'}`}>{String(oldVal)}</span>
      <span className={`text-right font-mono font-bold ${changed ? 'text-cyan-300' : 'text-slate-400'}`}>{String(newVal)}</span>
    </div>
  );
}

function MetricCard({ label, value, color, sub }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-lg leading-none ${color || 'text-white'}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function ScanResultRow({ r }) {
  if (r.action === 'DISABLED') {
    return (
      <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
        <span className="text-slate-400 font-mono">{r.instId}</span>
        <span className="text-red-400 font-bold">DISABLED</span>
        <span className="text-slate-500">{r.reason}</span>
      </div>
    );
  }
  const color = r.action === 'PAPER_BUY' ? 'border-emerald-700/50 bg-emerald-950/10'
    : r.action === 'NO_SIGNAL' ? 'border-slate-700/50 bg-slate-800/20'
    : 'border-slate-700/30 bg-slate-900/20';
  return (
    <div className={`text-xs px-3 py-2 rounded-lg border ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-white">{r.instId}</span>
        <span className={`font-bold ${r.action === 'PAPER_BUY' ? 'text-emerald-400' : 'text-slate-400'}`}>{r.action}</span>
        {r.score != null && <span className="text-cyan-400">score: {r.score}</span>}
      </div>
      <div className="text-slate-400 leading-relaxed">{r.reason}</div>
      {r.barriers && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(r.barriers).map(([k, v]) => (
            <span key={k} className={`px-1.5 py-0.5 rounded text-xs border ${v ? 'border-emerald-800/40 text-emerald-400' : 'border-red-800/40 text-red-400'}`}>
              {v ? '✓' : '✗'} {k.replace('Barrier', '')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Phase4FBTCOnlyPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4FBTCOnlyPaperMode', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const d = data;
  const r = d?.report24h;
  const btc = d?.btcVerifiedSnapshot;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4F — BTC-Only Economic Paper Mode</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            BTC-USDT only · TP=1.3% · SL=0.65% · 60min expiry · score≥75 · maxOpen=1 · kill switch active
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-orange-700 hover:bg-orange-600 text-white text-xs shrink-0">
          {loading ? '⏳ Running…' : '🚀 Run Phase 4F Cycle'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {/* Mode badge — always visible */}
      <div className="rounded-xl border-2 border-orange-600 bg-orange-950/20 px-5 py-3">
        <div className="font-black text-sm text-orange-300 mb-1">⚡ PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE</div>
        <div className="text-xs text-orange-200/80 leading-relaxed">
          Based on Phase 4E clean accounting: EDGE_EXISTS_BUT_FEE_DRAIN. BTC-USDT is the only verified profitable pair.
          ETH / SOL / DOGE / XRP disabled — NO_VERIFIED_EDGE_OR_FEE_DRAIN.
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {['ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'].map(p => (
            <span key={p} className="text-xs bg-red-900/30 border border-red-700/40 text-red-300 px-2 py-0.5 rounded">
              🚫 {p} — NO_VERIFIED_EDGE
            </span>
          ))}
          <span className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-2 py-0.5 rounded">
            ✓ BTC-USDT — ACTIVE
          </span>
        </div>
      </div>

      {d && (
        <>
          {/* Verdict banner */}
          <div className="bg-slate-900/60 border border-cyan-700/30 rounded-xl px-4 py-3">
            <div className="text-xs text-cyan-400 font-bold uppercase tracking-wide mb-1">Final Verdict</div>
            <p className="text-xs text-slate-300 leading-relaxed">{d.finalVerdict}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className={`font-bold ${d.safetyStatus === 'SAFE' ? 'text-emerald-400' : 'text-red-400'}`}>safety: {d.safetyStatus}</span>·
              <span className={`font-bold ${d.realTradingEndpointDetected ? 'text-red-400' : 'text-emerald-400'}`}>realEndpoint: {String(d.realTradingEndpointDetected)}</span>·
              <span className="text-slate-400">opened: {d.openedThisRun}</span>·
              <span className="text-slate-400">closed: {d.closedThisRun}</span>
            </div>
          </div>

          {/* Constants diff */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-2 text-xs mb-2 pb-1.5 border-b-2 border-slate-600">
              <span className="text-slate-500 font-bold uppercase tracking-wide">Constant</span>
              <span className="text-right text-orange-400 font-bold uppercase tracking-wide">Phase 4D (Old)</span>
              <span className="text-right text-cyan-400 font-bold uppercase tracking-wide">Phase 4F (New)</span>
            </div>
            <DiffRow label="activePairs"     oldVal="5 pairs" newVal="BTC-USDT only" />
            <DiffRow label="tpPercent"       oldVal={`${d.oldTP}%`}   newVal={`${d.newTP}%`} />
            <DiffRow label="slPercent"       oldVal={`${d.oldSL}%`}   newVal={`${d.newSL}%`} />
            <DiffRow label="riskReward"      oldVal="1:1.5"            newVal={d.riskReward} />
            <DiffRow label="expiry"          oldVal={d.oldExpiry}      newVal={d.newExpiry} />
            <DiffRow label="requiredScore"   oldVal={d.oldScore}       newVal={d.newScore} />
            <DiffRow label="minTickScore"    oldVal={d.oldTickScore}   newVal={d.newTickScore} />
            <DiffRow label="maxOpenTrades"   oldVal={d.oldMaxOpen}     newVal={d.newMaxOpen} />
          </div>

          {/* This run stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Opened"       value={d.openedThisRun}  color={d.openedThisRun > 0 ? 'text-emerald-400' : 'text-slate-400'} />
            <MetricCard label="Closed"       value={d.closedThisRun}  color="text-white" />
            <MetricCard label="Open Now"     value={d.openPositions}  color="text-cyan-400" />
            <MetricCard label="Mode"         value="4F"               color="text-orange-400" sub="BTC-Only Economic" />
          </div>

          {/* Scan results */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🔍 Scan Results</div>
            <div className="space-y-2">
              {(d.scanResults || []).map((r, i) => <ScanResultRow key={i} r={r} />)}
            </div>
          </div>

          {/* 24h report */}
          {r && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📅 24h Phase 4F Report</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-2">
                <div><div className="text-slate-500 mb-0.5">Closed</div><div className="text-white font-bold">{r.closedTrades}</div></div>
                <div><div className="text-slate-500 mb-0.5">Win Rate</div><div className={`font-bold ${r.winRate >= 60 ? 'text-emerald-400' : r.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{r.winRate.toFixed(1)}%</div></div>
                <div><div className="text-slate-500 mb-0.5">Net PnL</div><div className={`font-bold ${pnlColor(r.netPnL)}`}>{r.netPnL >= 0 ? '+' : ''}{r.netPnL.toFixed(4)}</div></div>
                <div><div className="text-slate-500 mb-0.5">TP/SL/Exp</div><div className="text-white font-bold">{r.tpHits}/{r.slHits}/{r.expired}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><div className="text-slate-500 mb-0.5">Gross</div><div className={pnlColor(r.grossPnL)}>{r.grossPnL >= 0 ? '+' : ''}{r.grossPnL.toFixed(4)}</div></div>
                <div><div className="text-slate-500 mb-0.5">Fees</div><div className="text-red-400">-{r.fees.toFixed(4)}</div></div>
                <div><div className="text-slate-500 mb-0.5">Open</div><div className="text-cyan-400">{r.openPositions}</div></div>
              </div>
              <p className="text-xs text-slate-600 mt-1">{r.note}</p>
            </div>
          )}

          {/* BTC verified snapshot */}
          {btc && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📊 BTC VerifiedTrade Snapshot</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><div className="text-slate-500 mb-0.5">Trades</div><div className="text-white font-bold">{btc.totalTrades}</div></div>
                <div><div className="text-slate-500 mb-0.5">Wins</div><div className="text-emerald-400 font-bold">{btc.wins}</div></div>
                <div><div className="text-slate-500 mb-0.5">Win Rate</div><div className={`font-bold ${btc.winRate >= 60 ? 'text-emerald-400' : 'text-yellow-400'}`}>{btc.winRate.toFixed(1)}%</div></div>
                <div><div className="text-slate-500 mb-0.5">Net PnL</div><div className={`font-bold ${pnlColor(btc.netPnL)}`}>{btc.netPnL >= 0 ? '+' : ''}{btc.netPnL.toFixed(4)}</div></div>
              </div>
              <p className="text-xs text-slate-600 mt-1">{btc.source}</p>
            </div>
          )}

          {/* Closed this run */}
          {d.closedNow?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">✅ Closed This Run</div>
              <div className="space-y-1">
                {d.closedNow.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/40">
                    <span className="font-bold text-white">{c.instId}</span>
                    <span className={c.status === 'CLOSED_TP' ? 'text-emerald-400' : c.status === 'CLOSED_SL' ? 'text-red-400' : 'text-yellow-400'}>{c.status}</span>
                    <span className={`font-bold ${pnlColor(c.netPnL)}`}>{c.netPnL >= 0 ? '+' : ''}{c.netPnL.toFixed(4)} USDT</span>
                    <span className="text-slate-500 flex-1 truncate">{c.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safety */}
          <div className="flex flex-wrap gap-2">
            {[
              'realTradeAllowed: false', 'realTradeUnlockAllowed: false',
              'killSwitchActive: true', 'noOKXOrderEndpoint: true',
              `phase: ${d.phase}`,
            ].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-500">Run at {new Date(d.runAt).toLocaleString('de-DE')} · {d.requestedBy}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-12">
          Click <strong className="text-orange-400">Run Phase 4F Cycle</strong> to execute a BTC-only paper scan with updated constants.
        </div>
      )}
    </div>
  );
}