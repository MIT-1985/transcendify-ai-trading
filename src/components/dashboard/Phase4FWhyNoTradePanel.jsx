import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const REASON_STYLE = {
  BEARISH_MARKET:            { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '📉' },
  WEAK_TICK_PRESSURE:        { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40', icon: '🫥' },
  SCORE_TOO_LOW:             { color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/40', icon: '📊' },
  TP_NOT_REALISTIC:          { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40', icon: '🎯' },
  FEE_EFFICIENCY_FAIL:       { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '💸' },
  OPEN_TRADE_ALREADY_EXISTS: { color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-700/40',   icon: '🔓' },
  MAX_OPEN_TRADES_REACHED:   { color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-700/40',   icon: '🔒' },
  INSUFFICIENT_MOMENTUM:     { color: 'text-slate-400',  bg: 'bg-slate-900/40 border-slate-700/40', icon: '💤' },
  NET_PROFIT_BELOW_MINIMUM:  { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '⚠️' },
  SPREAD_TOO_WIDE:           { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40', icon: '↔️' },
  VOLATILITY_TOO_HIGH:       { color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/40', icon: '🌊' },
  GROSS_PROFIT_BELOW_FLOOR:  { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '📉' },
  PAPER_SIGNAL_READY:        { color: 'text-emerald-400',bg: 'bg-emerald-900/20 border-emerald-700/40', icon: '✅' },
  ALL_CLEAR_WAITING_FOR_SIGNAL: { color: 'text-cyan-400', bg: 'bg-cyan-900/20 border-cyan-700/40', icon: '👀' },
  NO_MARKET_DATA:            { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '❌' },
  DIAGNOSTIC_ERROR:          { color: 'text-red-400',    bg: 'bg-red-900/20 border-red-700/40',     icon: '🔴' },
};

const ACTION_STYLE = {
  WAIT:              'bg-red-900/20 border-red-700/30 text-red-300',
  WATCH:             'bg-yellow-900/20 border-yellow-700/30 text-yellow-300',
  PAPER_SIGNAL_ONLY: 'bg-emerald-900/20 border-emerald-700/30 text-emerald-300',
};

const PROGRESS_STATUS = {
  COLLECTING_BTC_ONLY_DATA:    { color: 'text-blue-400',    label: '🔵 COLLECTING_BTC_ONLY_DATA (< 10 trades)' },
  FIRST_EVALUATION_POSSIBLE:   { color: 'text-cyan-400',    label: '🔵 FIRST_EVALUATION_POSSIBLE (10+ trades)' },
  NORMAL_EVALUATION:           { color: 'text-yellow-400',  label: '🟡 NORMAL_EVALUATION (20+ trades)' },
  SERIOUS_PAPER_EVALUATION:    { color: 'text-emerald-400', label: '🟢 SERIOUS_PAPER_EVALUATION (50+ trades)' },
};

function BarrierRow({ label, pass, note }) {
  return (
    <div className={`flex items-center justify-between text-xs py-1.5 border-b border-slate-800/40 last:border-0 ${pass === false ? 'bg-red-950/10' : ''}`}>
      <span className={`flex items-center gap-1.5 ${pass ? 'text-slate-300' : 'text-red-300 font-semibold'}`}>
        <span>{pass ? '✓' : '✗'}</span> {label}
      </span>
      <div className="flex items-center gap-2">
        {note && <span className="text-slate-500 font-mono">{note}</span>}
        <span className={`font-bold ${pass ? 'text-emerald-400' : 'text-red-400'}`}>{pass ? 'PASS' : 'FAIL'}</span>
      </div>
    </div>
  );
}

export default function Phase4FWhyNoTradePanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke('phase4FWhyNoTrade', {});
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const d    = data;
  const rs   = d?.mainBlockingReason ? (REASON_STYLE[d.mainBlockingReason] || REASON_STYLE.ALL_CLEAR_WAITING_FOR_SIGNAL) : null;
  const dp   = d?.dataCollection;
  const dpSt = dp ? (PROGRESS_STATUS[dp.collectionStatus] || PROGRESS_STATUS.COLLECTING_BTC_ONLY_DATA) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4F — Why No BTC Trade?</h3>
          <p className="text-slate-400 text-xs mt-0.5">Reads live BTC-USDT market, runs all Phase 4F barriers, explains the exact block.</p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-amber-700 hover:bg-amber-600 text-white text-xs shrink-0">
          {loading ? '⏳ Scanning…' : '🔎 Diagnose BTC'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {d && (
        <>
          {/* Main blocking reason */}
          <div className={`rounded-xl border-2 px-5 py-4 ${rs?.bg || ''}`}>
            <div className={`font-black text-base mb-1 ${rs?.color || 'text-white'}`}>
              {rs?.icon} {d.mainBlockingReason}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className={`text-xs font-bold border rounded px-2.5 py-1 ${ACTION_STYLE[d.recommendedAction] || ''}`}>
                → {d.recommendedAction}
              </span>
              <span className="text-xs text-slate-400">score: <span className={`font-bold ${d.totalScore >= d.requiredScore ? 'text-emerald-400' : 'text-red-400'}`}>{d.totalScore}</span> / need {d.requiredScore} (missing: {d.missingScore})</span>
              {d.currentOpenBTCTrades > 0 && <span className="text-xs text-blue-400 font-bold">⚠️ {d.currentOpenBTCTrades} BTC trade(s) already open</span>}
            </div>
          </div>

          {/* Market snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ['BTC Price',    `$${d.lastPrice?.toLocaleString()}`,                    'text-white'],
              ['Signal',       d.currentSignal,                                        d.currentSignal === 'BULLISH' ? 'text-emerald-400' : d.currentSignal === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'],
              ['Tick',         d.tickDirection,                                        d.tickDirection === 'BUY_PRESSURE' ? 'text-emerald-400' : d.tickDirection === 'SELL_PRESSURE' ? 'text-red-400' : 'text-slate-400'],
              ['Score',        `${d.totalScore} / ${d.requiredScore}`,                 d.totalScore >= d.requiredScore ? 'text-emerald-400' : 'text-red-400'],
              ['Tick Score',   `${d.tickScore} / ${d.minTickScore}`,                   d.tickScore >= d.minTickScore ? 'text-emerald-400' : 'text-red-400'],
              ['RSI',          d.rsi,                                                  d.rsi > 55 ? 'text-emerald-400' : d.rsi < 45 ? 'text-red-400' : 'text-slate-400'],
              ['Momentum',     `${d.momentum10?.toFixed(4)}%`,                         Math.abs(d.momentum10) >= 0.03 ? 'text-emerald-400' : 'text-yellow-400'],
              ['Spread',       `${d.spreadPct?.toFixed(4)}%`,                          d.spreadPct <= 0.05 ? 'text-emerald-400' : 'text-red-400'],
            ].map(([l, v, c]) => (
              <div key={l} className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 mb-0.5">{l}</div>
                <div className={`font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Fee math */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">💰 Fee Math (TP=1.30%, $10 size)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><div className="text-slate-500 mb-0.5">Gross Est.</div><div className="text-white font-bold">{d.grossEstimate?.toFixed(4)} USDT</div></div>
              <div><div className="text-slate-500 mb-0.5">Fees Est.</div><div className="text-red-400 font-bold">-{d.feesEstimate?.toFixed(4)} USDT</div></div>
              <div><div className="text-slate-500 mb-0.5">Spread Est.</div><div className="text-orange-400 font-bold">-{d.spreadEstimate?.toFixed(4)} USDT</div></div>
              <div><div className="text-slate-500 mb-0.5">Net Est.</div><div className={`font-bold ${d.netEstimate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d.netEstimate >= 0 ? '+' : ''}{d.netEstimate?.toFixed(4)} USDT</div></div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Fee efficiency ratio: <span className={`font-bold ${d.feeEffRatio <= 0.30 ? 'text-emerald-400' : 'text-red-400'}`}>{(d.feeEffRatio * 100)?.toFixed(1)}%</span>
              <span className="ml-2 text-slate-600">(max allowed: 30%)</span>
            </div>
          </div>

          {/* Barriers */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🚧 Barrier Checklist</div>
            <BarrierRow label="Intraday signal (not BEARISH)"       pass={d.intradayBarrier}      note={d.currentSignal} />
            <BarrierRow label="Score ≥ 75"                          pass={d.scoreBarrier}         note={`${d.totalScore}`} />
            <BarrierRow label="Tick score ≥ 15"                     pass={d.tickBarrier}          note={`${d.tickScore}`} />
            <BarrierRow label="TP realism (momentum × 3 ≥ TP)"     pass={d.tpRealismBarrier} />
            <BarrierRow label="Fee efficiency ≤ 30%"                pass={d.feeEfficiencyBarrier} note={`${(d.feeEffRatio*100)?.toFixed(1)}%`} />
            <BarrierRow label="Gross profit ≥ 0.15 USDT"           pass={d.grossProfitBarrier}   note={`${d.grossEstimate?.toFixed(4)}`} />
            <BarrierRow label="Net profit > 0"                      pass={d.feeBarrier}           note={`${d.netEstimate?.toFixed(4)}`} />
            <BarrierRow label="Momentum ≥ 0.03%"                   pass={d.momentumBarrier}      note={`${d.momentum10?.toFixed(4)}%`} />
            <BarrierRow label="Spread ≤ 0.05%"                     pass={d.spreadBarrier}        note={`${d.spreadPct?.toFixed(4)}%`} />
            <BarrierRow label="Volatility ≤ 2%"                    pass={d.volatilityBarrier}    note={`${d.volatilityPct?.toFixed(4)}%`} />
            <BarrierRow label="No duplicate BTC open trade"         pass={!d.duplicateOpenTradeBlocked} note={`${d.currentOpenBTCTrades} open`} />
            <BarrierRow label="Max open trades not exceeded (≤1)"   pass={!d.maxOpenTradesBlocked} note={`${d.currentOpenAllTrades} total`} />
          </div>

          {/* Data collection progress */}
          {dp && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📈 BTC Data Collection</div>
              <div className={`font-black text-sm mb-2 ${dpSt?.color}`}>{dpSt?.label}</div>
              <div className="w-full bg-slate-800 rounded-full h-2 mb-1">
                <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${dp.pctTo50}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-600 mb-2">
                <span>0</span><span>10</span><span>20</span><span>50 trades</span>
              </div>
              <p className="text-xs text-slate-500">
                <span className="text-white font-bold">{dp.btcTradesCollected}</span> BTC trades collected under Phase 4F.
                Real evaluation begins at <span className="text-yellow-400">10+</span>, serious at <span className="text-emerald-400">50+</span>.
              </p>
              <div className="flex gap-2 mt-2">
                <span className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded font-mono">🔒 DO_NOT_UNLOCK_PHASE_5</span>
                <span className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded font-mono">🔒 REAL_TRADING_LOCKED</span>
              </div>
            </div>
          )}

          {/* Safety */}
          <div className="flex flex-wrap gap-2">
            {['realTradeAllowed: false', 'realTradeUnlockAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true'].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-600">Checked {new Date(d.checkedAt).toLocaleString('de-DE')} · {d.requestedBy}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-10">
          Click <strong className="text-amber-400">Diagnose BTC</strong> to see exactly why no BTC paper trade is opening.
        </div>
      )}
    </div>
  );
}