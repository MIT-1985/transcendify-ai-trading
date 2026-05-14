import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const CHECK_LABELS = {
  functionCorrect:          'Automation calls phase4FBTCOnlyPaperMode',
  modeCorrect:              'Mode = PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
  activePairsCorrect:       'Active pair = BTC-USDT only',
  disabledPairsEnforced:    'ETH/SOL/DOGE/XRP never opened',
  maxOpenTradesCorrect:     'maxOpenTrades = 1',
  tpPercentCorrect:         'tpPercent = 1.30%',
  slPercentCorrect:         'slPercent = 0.65%',
  expiryCorrect:            'expiryMinutes = 60',
  requiredScoreCorrect:     'requiredScore = 75',
  minTickScoreCorrect:      'minTickScore = 15',
  realTradeBlocked:         'realTradeAllowed = false',
  realTradeUnlockBlocked:   'realTradeUnlockAllowed = false',
  killSwitchActive:         'killSwitchActive = true',
  noOKXOrderEndpoint:       'noOKXOrderEndpointCalled = true',
  openBTCWithinLimit:       'Open BTC trades ≤ 1',
  noDisabledPairsOpen:      'No disabled pair positions open',
};

const PROGRESS_LABELS = {
  COLLECTING_BTC_ONLY_DATA:    { color: 'text-blue-400',   label: '🔵 COLLECTING DATA' },
  FIRST_EVALUATION:            { color: 'text-cyan-400',   label: '🔵 FIRST EVAL (10+)' },
  NORMAL_EVALUATION:           { color: 'text-yellow-400', label: '🟡 NORMAL EVAL (20+)' },
  SERIOUS_PAPER_EVALUATION:    { color: 'text-emerald-400',label: '🟢 SERIOUS EVAL (50+)' },
};

export default function Phase4FAutomationVerifyPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke('phase4FAutomationVerify', {});
      setData(res.data);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const d    = data;
  const prog = d?.dataCollectionProgress;
  const progStyle = prog ? (PROGRESS_LABELS[prog.currentStatus] || PROGRESS_LABELS.COLLECTING_BTC_ONLY_DATA) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4F — Automation Verify</h3>
          <p className="text-slate-400 text-xs mt-0.5">Confirms scheduled automation runs Phase 4F correctly with all constants enforced.</p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-violet-700 hover:bg-violet-600 text-white text-xs shrink-0">
          {loading ? '⏳ Verifying…' : '🔍 Verify Automation'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {d && (
        <>
          {/* Verdict */}
          <div className={`rounded-xl border-2 px-4 py-3 ${d.allPass ? 'border-emerald-700/50 bg-emerald-950/10' : 'border-red-700/50 bg-red-950/10'}`}>
            <div className={`font-black text-sm mb-1 ${d.allPass ? 'text-emerald-400' : 'text-red-400'}`}>
              {d.allPass ? '✅ AUTOMATION VERIFIED' : `⚠️ ${d.failedChecks.length} CHECK(S) FAILED`}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{d.finalVerdict}</p>
          </div>

          {/* Key constants */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ['Function',    d.functionCalledByAutomation, 'text-cyan-400'],
              ['Mode',        'PHASE_4F',                   'text-orange-400'],
              ['Active Pair', d.activePairs?.join(', '),    'text-emerald-400'],
              ['Max Open',    d.maxOpenTrades,              'text-white'],
              ['TP',          `${d.tpPercent}%`,            'text-emerald-400'],
              ['SL',          `${d.slPercent}%`,            'text-red-400'],
              ['R:R',         d.riskReward,                 'text-white'],
              ['Expiry',      `${d.expiryMinutes}min`,      'text-white'],
            ].map(([l, v, c]) => (
              <div key={l} className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 mb-0.5">{l}</div>
                <div className={`font-bold text-sm truncate ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Disabled pairs */}
          <div className="flex flex-wrap gap-2">
            {(d.disabledPairs || []).map(p => (
              <span key={p.instId} className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2.5 py-1 rounded-lg font-mono">
                🚫 {p.instId} — {p.reason}
              </span>
            ))}
          </div>

          {/* All checks */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">✅ Verification Checks</div>
            <div className="space-y-1">
              {Object.entries(d.checks || {}).map(([key, check]) => (
                <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40 last:border-0">
                  <span className={`flex items-center gap-1.5 ${check.pass ? 'text-slate-300' : 'text-red-300 font-bold'}`}>
                    {check.pass ? '✓' : '✗'} {CHECK_LABELS[key] || key}
                  </span>
                  <span className={`font-mono text-xs ${check.pass ? 'text-emerald-400' : 'text-red-400'}`}>
                    {String(check.actual)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Data collection progress */}
          {prog && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📈 Data Collection Progress</div>
              <div className={`font-black text-base mb-2 ${progStyle.color}`}>{progStyle.label}</div>
              <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                <div><div className="text-slate-500 mb-0.5">BTC Trades</div><div className="text-white font-bold">{prog.current}</div></div>
                <div><div className="text-slate-500 mb-0.5">To 1st Eval</div><div className="text-cyan-400 font-bold">{prog.firstEvalAt} ({prog.pctTo10}%)</div></div>
                <div><div className="text-slate-500 mb-0.5">To Serious</div><div className="text-yellow-400 font-bold">{prog.seriousEvalAt} ({prog.pctTo50}%)</div></div>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 mb-1">
                <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${prog.pctTo50}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>0</span><span>10 (1st)</span><span>20 (normal)</span><span>50 (serious)</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded font-mono">🔒 {prog.doNotUnlock}</span>
                <span className="text-xs bg-red-900/20 border border-red-700/30 text-red-300 px-2 py-0.5 rounded font-mono">🔒 REAL_TRADING_LOCKED</span>
              </div>
            </div>
          )}

          {/* Safety strip */}
          <div className="flex flex-wrap gap-2">
            {['realTradeAllowed: false', 'realTradeUnlockAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true'].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-600">Verified {new Date(d.verifiedAt).toLocaleString('de-DE')} · {d.requestedBy}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-10">
          Click <strong className="text-violet-400">Verify Automation</strong> to confirm Phase 4F is running correctly.
        </div>
      )}
    </div>
  );
}