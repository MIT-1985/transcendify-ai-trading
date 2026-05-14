import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const ALERT_CONFIG = {
  COLD:  { bg: 'bg-slate-900/80 border-slate-600',      text: 'text-slate-300',  badge: 'bg-slate-700 text-slate-200',    icon: '🔵', bar: 'bg-slate-500' },
  WARM:  { bg: 'bg-yellow-950/40 border-yellow-700/60', text: 'text-yellow-300', badge: 'bg-yellow-800/60 text-yellow-200', icon: '🟡', bar: 'bg-yellow-500' },
  HOT:   { bg: 'bg-orange-950/40 border-orange-700/60', text: 'text-orange-300', badge: 'bg-orange-800/60 text-orange-200', icon: '🔥', bar: 'bg-orange-500' },
  READY: { bg: 'bg-emerald-950/40 border-emerald-600',  text: 'text-emerald-300',badge: 'bg-emerald-800/60 text-emerald-200', icon: '🟢', bar: 'bg-emerald-500' },
};

const ACTION_BADGE = {
  WAIT:              'bg-slate-700/50 text-slate-300 border-slate-600',
  WATCH:             'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
  WATCH_CLOSELY:     'bg-orange-900/40 text-orange-300 border-orange-700/50',
  PAPER_SIGNAL_ONLY: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
};

function ScoreBar({ score, required = 75 }) {
  const pct = Math.min(100, Math.round(score / required * 100));
  const color = score >= required ? 'bg-emerald-500' : score >= 70 ? 'bg-orange-500' : score >= 60 ? 'bg-yellow-500' : 'bg-slate-500';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Score</span>
        <span className={score >= required ? 'text-emerald-400' : 'text-slate-400'}>{score} / {required}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-700 mt-0.5">
        <span>0</span><span>60</span><span>70</span><span>75✓</span>
      </div>
    </div>
  );
}

export default function Phase4FAlertWidget({ autoRefreshSeconds = 0 }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [lastAt,  setLastAt]  = useState(null);
  const timerRef = useRef(null);

  const fetch4F = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke('phase4FWhyNoTrade', {});
      setData(res.data);
      setLastAt(new Date());
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  useEffect(() => {
    fetch4F();
    if (autoRefreshSeconds > 0) {
      timerRef.current = setInterval(fetch4F, autoRefreshSeconds * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefreshSeconds]);

  const d   = data;
  const cfg = d?.alertLevel ? (ALERT_CONFIG[d.alertLevel] || ALERT_CONFIG.COLD) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">BTC Watch-Level Alert</h3>
          <p className="text-slate-400 text-xs mt-0.5">Live signal proximity — how close BTC is to a valid Phase 4F paper entry.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastAt && <span className="text-xs text-slate-600">{lastAt.toLocaleTimeString('de-DE')}</span>}
          <Button size="sm" onClick={fetch4F} disabled={loading} className="bg-slate-700 hover:bg-slate-600 text-white text-xs">
            {loading ? '⏳' : '🔄 Refresh'}
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {d && cfg && (
        <>
          {/* Main alert banner */}
          <div className={`rounded-2xl border-2 px-5 py-4 ${cfg.bg}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`font-black text-xl ${cfg.text}`}>{cfg.icon} {d.alertLevel}</div>
              <span className={`text-xs font-bold border rounded-lg px-2.5 py-1 ${ACTION_BADGE[d.alertRecommendedAction] || ACTION_BADGE.WAIT}`}>
                → {d.alertRecommendedAction}
              </span>
            </div>
            <p className={`text-sm leading-relaxed ${cfg.text}`}>{d.alertMessage}</p>
          </div>

          {/* Score bar */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
            <ScoreBar score={d.totalScore} required={d.requiredScore} />
            <div className="flex gap-4 mt-3 text-xs">
              <div><span className="text-slate-500">Missing: </span><span className={`font-bold ${d.missingScore === 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d.missingScore} pts</span></div>
              <div><span className="text-slate-500">Intraday: </span><span className={`font-bold ${d.currentSignal === 'BULLISH' ? 'text-emerald-400' : d.currentSignal === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>{d.currentSignal}</span></div>
              <div><span className="text-slate-500">Tick: </span><span className={`font-bold ${d.tickDirection === 'BUY_PRESSURE' ? 'text-emerald-400' : d.tickDirection === 'SELL_PRESSURE' ? 'text-red-400' : 'text-slate-400'}`}>{d.tickDirection}</span></div>
              <div><span className="text-slate-500">RSI: </span><span className={`font-bold ${d.rsi > 55 ? 'text-emerald-400' : d.rsi < 45 ? 'text-red-400' : 'text-yellow-400'}`}>{d.rsi}</span></div>
            </div>
          </div>

          {/* Nearest barrier + what's needed */}
          {d.nearestBarrierToPass && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🎯 Nearest Barrier to Pass</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-orange-300 font-bold">{d.nearestBarrierToPass.name}</span>
                <span className="text-slate-400">—</span>
                <span className="text-slate-300">{d.nearestBarrierToPass.hint}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                <span>Need momentum ≥ <span className="text-white font-bold">{d.estimatedNeededMomentumPercent}%</span> for TP realism</span>
                <span>Need tick score ≥ <span className="text-white font-bold">{d.estimatedNeededTickScore}</span></span>
              </div>
            </div>
          )}

          {/* Failed barriers compact */}
          {d.failedBarriers?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">🚧 Failing Barriers</div>
              <div className="flex flex-wrap gap-1.5">
                {d.failedBarriers.map(b => (
                  <span key={b} className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded font-mono">✗ {b}</span>
                ))}
              </div>
            </div>
          )}

          {/* Live market numbers */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
            {[
              ['BTC Price',  `$${d.lastPrice?.toLocaleString()}`,       'text-white'],
              ['Spread',     `${d.spreadPct?.toFixed(4)}%`,              d.spreadBarrier ? 'text-emerald-400' : 'text-red-400'],
              ['Momentum',   `${d.momentum10?.toFixed(4)}%`,             d.momentumBarrier ? 'text-emerald-400' : 'text-yellow-400'],
              ['Vol Mom',    `${d.volumeMomentum?.toFixed(1)}%`,         d.volumeMomentum > 10 ? 'text-emerald-400' : 'text-slate-400'],
              ['Buy Press',  `${d.buyPressurePct?.toFixed(1)}%`,         d.buyPressurePct >= 58 ? 'text-emerald-400' : 'text-slate-400'],
              ['Net Est',    `${d.netEstimate >= 0 ? '+' : ''}${d.netEstimate?.toFixed(4)}`, d.feeBarrier ? 'text-emerald-400' : 'text-red-400'],
            ].map(([l, v, c]) => (
              <div key={l} className="bg-slate-900/50 border border-slate-800 rounded-lg px-2 py-1.5 text-center">
                <div className="text-slate-600 text-xs mb-0.5">{l}</div>
                <div className={`font-bold text-xs ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Safety strip */}
          <div className="flex flex-wrap gap-2">
            {['realTradeAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true'].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
            <span className="text-xs font-mono bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded">🔒 DO_NOT_UNLOCK_PHASE_5</span>
          </div>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-8">Loading BTC alert level…</div>
      )}
    </div>
  );
}