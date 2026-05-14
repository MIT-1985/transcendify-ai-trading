import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const pnlColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const pnlSign   = v => v >= 0 ? '+' : '';

const STATUS_STYLE = {
  COLLECTING_BTC_ONLY_DATA:    { bg: 'bg-blue-900/20 border-blue-700/40',   text: 'text-blue-300',   badge: 'bg-blue-800/40 text-blue-200'   },
  BTC_ONLY_NOT_PROFITABLE_YET: { bg: 'bg-red-900/20 border-red-700/40',     text: 'text-red-300',    badge: 'bg-red-800/40 text-red-200'     },
  BTC_ONLY_PROMISING:          { bg: 'bg-yellow-900/20 border-yellow-700/40',text: 'text-yellow-300', badge: 'bg-yellow-800/40 text-yellow-200'},
  BTC_ONLY_STRONG_PAPER_EDGE:  { bg: 'bg-emerald-900/20 border-emerald-700/40', text: 'text-emerald-300', badge: 'bg-emerald-800/40 text-emerald-200' },
};

function MetricRow({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-bold ${valueClass || 'text-white'}`}>{value}</span>
    </div>
  );
}

function TradeCard({ trade, label }) {
  if (!trade) return null;
  return (
    <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl px-3 py-2.5 text-xs">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1.5 font-bold">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <MetricRow label="Status"   value={trade.status} valueClass={trade.status === 'CLOSED_TP' ? 'text-emerald-400' : trade.status === 'CLOSED_SL' ? 'text-red-400' : 'text-yellow-400'} />
        <MetricRow label="Net PnL"  value={`${pnlSign(trade.netPnL)}${(trade.netPnL||0).toFixed(4)} USDT`} valueClass={pnlColor(trade.netPnL)} />
        <MetricRow label="Entry"    value={trade.entryPrice} />
        <MetricRow label="Exit"     value={trade.exitPrice ?? '—'} />
        <MetricRow label="Score"    value={trade.signalScore ?? '—'} valueClass="text-cyan-400" />
        <MetricRow label="Held"     value={trade.holdingMin != null ? `${trade.holdingMin}min` : '—'} />
      </div>
    </div>
  );
}

export default function Phase4FReportPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke('phase4FPerformanceReport', {});
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const d = data;
  const m = d?.metrics;
  const dec = d?.decision;
  const style = dec ? (STATUS_STYLE[dec.status] || STATUS_STYLE.COLLECTING_BTC_ONLY_DATA) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4F — BTC-Only Performance Report</h3>
          <p className="text-slate-400 text-xs mt-0.5">Tracks only BTC-USDT trades opened under Phase 4F. ETH/SOL/DOGE/XRP excluded.</p>
        </div>
        <Button size="sm" onClick={load} disabled={loading} className="bg-cyan-800 hover:bg-cyan-700 text-white text-xs shrink-0">
          {loading ? '⏳ Loading…' : '📊 Generate Report'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {/* Config block — always show */}
      <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">⚙️ Active Config</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            ['Pair',          'BTC-USDT',  'text-cyan-400'],
            ['TP',            '1.30%',     'text-emerald-400'],
            ['SL',            '0.65%',     'text-red-400'],
            ['R:R',           '1:2',       'text-white'],
            ['Expiry',        '60min',     'text-white'],
            ['Score ≥',       '75',        'text-yellow-400'],
            ['Tick ≥',        '15',        'text-yellow-400'],
            ['Max Open',      '1',         'text-white'],
          ].map(([l, v, c]) => (
            <div key={l}>
              <div className="text-slate-500 mb-0.5">{l}</div>
              <div className={`font-bold ${c}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {d && m && (
        <>
          {/* Decision status banner */}
          <div className={`rounded-xl border-2 px-5 py-4 ${style.bg}`}>
            <div className={`font-black text-base mb-1 ${style.text}`}>{dec.emoji} {dec.status}</div>
            <p className="text-xs text-white/70 mb-2">{dec.note}</p>
            <p className={`text-xs font-mono ${style.text}`}>{dec.verdict}</p>
          </div>

          {/* Top-level metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Total BTC Trades</div>
              <div className="text-white font-black text-xl">{m.totalBTCTrades}</div>
              <div className="text-slate-500 text-xs">{m.openBTCTrades} open · {m.closedBTCTrades} closed</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Win Rate</div>
              <div className={`font-black text-xl ${m.winRate >= 55 ? 'text-emerald-400' : m.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{m.winRate.toFixed(1)}%</div>
              <div className="text-slate-500 text-xs">{m.wins}W / {m.losses}L</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Net PnL</div>
              <div className={`font-black text-xl ${pnlColor(m.netPnL)}`}>{pnlSign(m.netPnL)}{m.netPnL.toFixed(4)}</div>
              <div className="text-slate-500 text-xs">USDT</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Fee Drag</div>
              <div className={`font-black text-xl ${m.feeDragPercent < 50 ? 'text-emerald-400' : m.feeDragPercent < 70 ? 'text-yellow-400' : 'text-red-400'}`}>{m.feeDragPercent.toFixed(1)}%</div>
              <div className="text-slate-500 text-xs">of gross PnL</div>
            </div>
          </div>

          {/* TP/SL/Expiry breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-xl px-3 py-2.5 text-center">
              <div className="text-emerald-400 font-black text-xl">{m.tpHits}</div>
              <div className="text-xs text-slate-400">TP Hits</div>
            </div>
            <div className="bg-red-900/10 border border-red-800/30 rounded-xl px-3 py-2.5 text-center">
              <div className="text-red-400 font-black text-xl">{m.slHits}</div>
              <div className="text-xs text-slate-400">SL Hits</div>
            </div>
            <div className="bg-yellow-900/10 border border-yellow-800/30 rounded-xl px-3 py-2.5 text-center">
              <div className="text-yellow-400 font-black text-xl">{m.expiredTrades}</div>
              <div className="text-xs text-slate-400">Expired</div>
            </div>
          </div>

          {/* Detailed metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">💰 P&L Breakdown</div>
              <MetricRow label="Gross PnL"       value={`${pnlSign(m.grossPnL)}${m.grossPnL.toFixed(6)} USDT`} valueClass={pnlColor(m.grossPnL)} />
              <MetricRow label="Total Fees"      value={`-${m.fees.toFixed(6)} USDT`}       valueClass="text-red-400" />
              <MetricRow label="Spread Cost"     value={`-${m.spreadCost.toFixed(6)} USDT`} valueClass="text-orange-400" />
              <MetricRow label="Net PnL"         value={`${pnlSign(m.netPnL)}${m.netPnL.toFixed(6)} USDT`} valueClass={pnlColor(m.netPnL)} />
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📈 Per-Trade Averages</div>
              <MetricRow label="Avg Gross"       value={`${pnlSign(m.averageGrossPerTrade)}${m.averageGrossPerTrade.toFixed(6)}`} valueClass={pnlColor(m.averageGrossPerTrade)} />
              <MetricRow label="Avg Fee"         value={`-${m.averageFeePerTrade.toFixed(6)}`} valueClass="text-red-400" />
              <MetricRow label="Avg Net"         value={`${pnlSign(m.averageNetPerTrade)}${m.averageNetPerTrade.toFixed(6)}`} valueClass={pnlColor(m.averageNetPerTrade)} />
              <MetricRow label="Avg Duration"    value={`${m.averageDurationMinutes}min`} />
              <MetricRow label="Avg Score"       value={m.averageSignalScore} valueClass="text-cyan-400" />
            </div>
          </div>

          {/* Break-even info */}
          {m.breakEvenTPPct != null && (
            <div className="bg-slate-900/40 border border-slate-700/30 rounded-xl px-4 py-3 text-xs">
              <span className="text-slate-400">Break-even TP estimate: </span>
              <span className="text-cyan-300 font-bold">{m.breakEvenTPPct}%</span>
              <span className="text-slate-500 ml-2">(based on avg fee per trade)</span>
            </div>
          )}

          {/* Best / worst */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TradeCard trade={d.bestTrade}  label="🏆 Best Trade" />
            <TradeCard trade={d.worstTrade} label="⚠️ Worst Trade" />
          </div>

          {/* Recent 5 */}
          {d.recent5?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🕒 Recent 5 Closed Trades</div>
              <div className="space-y-1.5">
                {d.recent5.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <span className={`font-bold w-24 shrink-0 ${t.status === 'CLOSED_TP' ? 'text-emerald-400' : t.status === 'CLOSED_SL' ? 'text-red-400' : 'text-yellow-400'}`}>{t.status}</span>
                    <span className="text-slate-400">entry: <span className="text-white">{t.entryPrice}</span></span>
                    <span className="text-slate-400">exit: <span className="text-white">{t.exitPrice ?? '—'}</span></span>
                    <span className={`font-bold ml-auto shrink-0 ${pnlColor(t.netPnL)}`}>{pnlSign(t.netPnL)}{(t.netPnL||0).toFixed(4)}</span>
                    <span className="text-cyan-400 shrink-0">⚡{t.signalScore}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disabled pairs */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🚫 Disabled Pairs</div>
            <div className="flex flex-wrap gap-2">
              {d.disabledPairs.map(p => (
                <span key={p.instId} className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2.5 py-1 rounded-lg font-mono">
                  {p.instId} — {p.reason}
                </span>
              ))}
            </div>
          </div>

          {/* Safety */}
          <div className="flex flex-wrap gap-2">
            {[
              'realTradeAllowed: false', 'realTradeUnlockAllowed: false',
              'killSwitchActive: true',  'noOKXOrderEndpoint: true',
            ].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-600">Generated {new Date(d.generatedAt).toLocaleString('de-DE')} · {d.requestedBy}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-12">
          Click <strong className="text-cyan-400">Generate Report</strong> to analyze Phase 4F BTC-only performance.
        </div>
      )}
    </div>
  );
}