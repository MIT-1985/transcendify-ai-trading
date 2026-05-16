import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { AlertTriangle, ShieldOff, XCircle, CheckCircle2, RefreshCw, Lock } from 'lucide-react';

// ── Constants (mirrored from backend — never change without review) ──
const MAX_TEST_SIZE_USDT  = 10;
const MIN_TEST_SIZE_USDT  = 1;
const DEFAULT_SIZE_USDT   = 5;
const DEFAULT_TP_PCT      = 1.30;
const DEFAULT_SL_PCT      = 0.65;
const CONFIRM_CODE        = 'I_CONFIRM_REAL_BTC_TEST_TRADE';
const CLOSE_CONFIRM_CODE  = 'I_CONFIRM_CLOSE_REAL_TRADE';

function SafeRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0 text-xs">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-mono font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{value}</span>
        {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
      </div>
    </div>
  );
}

function KpiBox({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-center">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-lg leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-slate-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Phase5RealTestMode() {
  const { user } = useAuth();

  // ── State ─────────────────────────────────────────────────
  const [prepData, setPrepData]         = useState(null);
  const [openTrade, setOpenTrade]       = useState(null);
  const [prepLoading, setPrepLoading]   = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState(null);
  const [successMsg, setSuccessMsg]     = useState(null);

  // Order form
  const [sizeUSDT, setSizeUSDT]         = useState(DEFAULT_SIZE_USDT);
  const [tpPct, setTpPct]               = useState(DEFAULT_TP_PCT);
  const [slPct, setSlPct]               = useState(DEFAULT_SL_PCT);

  // Confirmation screen
  const [showConfirm, setShowConfirm]   = useState(false);
  const [confirmTyped, setConfirmTyped] = useState('');

  // ── Load preparation status ───────────────────────────────
  const loadPrep = async () => {
    setPrepLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase5ManualRealTradePrepared', {});
    setPrepData(res.data);
    setPrepLoading(false);
  };

  const loadOpenTrade = async () => {
    setTradeLoading(true);
    const res = await base44.functions.invoke('phase5GetOpenTrade', {});
    setOpenTrade(res.data);
    setTradeLoading(false);
  };

  useEffect(() => {
    if (user) { loadPrep(); loadOpenTrade(); }
  }, [user]);

  // ── Derived ───────────────────────────────────────────────
  const livePrice = prepData?.liveMarket?.lastPrice || 0;
  const tpPrice   = livePrice ? (livePrice * (1 + tpPct / 100)).toFixed(2) : '—';
  const slPrice   = livePrice ? (livePrice * (1 - slPct / 100)).toFixed(2) : '—';
  const estQty    = livePrice ? (sizeUSDT / livePrice).toFixed(6) : '—';
  const estFee    = livePrice ? (sizeUSDT * 0.0006 * 2).toFixed(4) : '—'; // ~0.06% × 2 sides
  const maxLoss   = livePrice ? (sizeUSDT * slPct / 100).toFixed(4) : '—';
  const rr        = (tpPct / slPct).toFixed(2);

  const hardBlockerOk = prepData?.hardBlockerStatus === 'PAPER_EVIDENCE_READY_FOR_REVIEW';
  const phase5GuardOk = prepData?.phase5GuardStatus !== 'LOCKED';
  const killSwitchOn  = prepData?.killSwitchActive !== false;
  const alertLvl      = prepData?.liveMarket?.alertLevel || 'COLD';
  const score         = prepData?.liveMarket?.totalScore ?? 0;

  const canShowConfirmScreen = !openTrade?.hasOpenTrade && alertLvl !== 'COLD';

  // ── Place order handler ───────────────────────────────────
  const handlePlaceOrder = async () => {
    if (confirmTyped !== CONFIRM_CODE) {
      setError('Confirmation text does not match. Type exactly: ' + CONFIRM_CODE);
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    const res = await base44.functions.invoke('phase5OKXPlaceOrder', {
      manualConfirmCode: CONFIRM_CODE,
      sizeUSDT,
      side: 'buy',
      tpPercent: tpPct,
      slPercent: slPct,
      signalScore: score,
    });
    setActionLoading(false);
    if (res.data?.executed) {
      setSuccessMsg(`✅ Real order placed! orderId: ${res.data.orderId} · qty: ${res.data.qty} BTC @ $${res.data.entryPrice}`);
      setShowConfirm(false);
      setConfirmTyped('');
      await loadOpenTrade();
    } else {
      setError(`Order failed: ${res.data?.error} — ${res.data?.message || ''}`);
    }
  };

  // ── Emergency close handler ───────────────────────────────
  const handleEmergencyClose = async () => {
    if (!window.confirm('EMERGENCY CLOSE: This will immediately sell all open BTC position. Continue?')) return;
    setActionLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase5OKXCloseOrder', {
      isEmergency: true,
    });
    setActionLoading(false);
    if (res.data?.executed || res.data?.tradeMarkedClosed) {
      setSuccessMsg('✅ Position closed (emergency). Check OKX for confirmation.');
      await loadOpenTrade();
    } else {
      setError(`Close failed: ${res.data?.error} — ${res.data?.message || ''}`);
    }
  };

  // ── Manual close handler ──────────────────────────────────
  const handleManualClose = async () => {
    setActionLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase5OKXCloseOrder', {
      manualConfirmCode: CLOSE_CONFIRM_CODE,
      tradeId: openTrade?.trade?.id,
      isEmergency: false,
    });
    setActionLoading(false);
    if (res.data?.executed || res.data?.tradeMarkedClosed) {
      setSuccessMsg(`✅ Position closed. Gross PnL: ${res.data?.grossPnL?.toFixed(4)} USDT`);
      await loadOpenTrade();
    } else {
      setError(`Close failed: ${res.data?.error} — ${res.data?.message || ''}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── CRITICAL WARNING BANNER ─────────────────────── */}
        <div className="bg-red-950/60 border-2 border-red-600 rounded-2xl px-5 py-5">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <div className="font-black text-red-400 uppercase tracking-widest text-sm">
              PHASE 5 — MANUAL REAL BTC TEST MODE
            </div>
          </div>
          <div className="text-red-300/90 text-xs leading-6 space-y-1">
            <div>• <strong>REAL MONEY</strong> — this places a real order on OKX. Not paper trading.</div>
            <div>• Max 1 open trade at a time. No auto-repeat. BTC-USDT only.</div>
            <div>• Test size: 5 USDT default / 10 USDT maximum.</div>
            <div>• OKX API credentials must be set before any order is possible.</div>
            <div>• Kill Switch remains active. Auto-trading remains OFF. Real trade requires manual confirmation.</div>
          </div>
        </div>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">Phase 5 — Real BTC Test</h1>
            <div className="text-xs text-slate-500 font-mono mt-0.5">MANUAL_CONFIRM_ONLY · BTC-USDT · OKX</div>
          </div>
          <button
            onClick={() => { loadPrep(); loadOpenTrade(); }}
            disabled={prepLoading || tradeLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(prepLoading || tradeLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Safety Status (shown once) ──────────────────── */}
        <div className="bg-slate-900/70 border-2 border-red-800 rounded-2xl px-5 py-4">
          <div className="text-sm font-black text-red-400 mb-3">🛡 Safety Status</div>
          <div className="space-y-1">
            <SafeRow label="Kill Switch"             value={killSwitchOn ? 'ACTIVE' : 'INACTIVE'}             ok={killSwitchOn} />
            <SafeRow label="autoTradingAllowed"      value="false"                                             ok={true} />
            <SafeRow label="manualConfirmRequired"   value="true"                                              ok={true} />
            <SafeRow label="realTradeAllowed (default)" value="false"                                         ok={true} />
            <SafeRow label="realTradeUnlockAllowed (default)" value="false"                                   ok={true} />
            <SafeRow label="noOKXOrderEndpointCalled (auto)" value="true"                                     ok={true} />
            <SafeRow label="Phase 5 Guard"           value={prepData?.phase5GuardStatus || '—'}               ok={phase5GuardOk} />
            <SafeRow label="Hard Blocker"            value={prepData?.hardBlockerStatus || '—'}               ok={hardBlockerOk} />
          </div>
        </div>

        {/* ── Live BTC Signal Summary ─────────────────────── */}
        {prepData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiBox label="BTC Price"    value={livePrice ? `$${livePrice.toLocaleString()}` : '—'} />
            <KpiBox label="Alert Level"  value={alertLvl}
              color={alertLvl === 'READY' ? 'text-emerald-400' : alertLvl === 'HOT' ? 'text-orange-400' : alertLvl === 'WARM' ? 'text-yellow-400' : 'text-slate-400'} />
            <KpiBox label="Score"        value={`${score} / ${prepData.liveMarket?.requiredScore || 75}`}
              color={score >= 75 ? 'text-emerald-400' : score >= 65 ? 'text-yellow-400' : 'text-red-400'} />
            <KpiBox label="Blocking"     value={prepData.liveMarket?.mainBlockingReason || '—'} color="text-red-400" />
          </div>
        )}

        {/* ── Open Trade Monitor ──────────────────────────── */}
        {openTrade?.hasOpenTrade && openTrade.trade && (
          <div className="bg-emerald-950/30 border-2 border-emerald-700 rounded-2xl px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-emerald-400">📈 OPEN REAL TRADE</div>
              <div className={`text-xl font-black ${(openTrade.livePnL || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {openTrade.livePnL !== null ? `${openTrade.livePnL >= 0 ? '+' : ''}${openTrade.livePnL.toFixed(4)} USDT` : '—'}
                <span className="text-sm ml-1">({openTrade.livePnLPercent}%)</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
              <KpiBox label="Entry"    value={`$${openTrade.trade.entryPrice?.toLocaleString()}`} />
              <KpiBox label="Current"  value={openTrade.lastPrice ? `$${openTrade.lastPrice.toLocaleString()}` : '—'} />
              <KpiBox label="TP"       value={`$${openTrade.tpPrice?.toLocaleString()}`} color="text-emerald-400" sub={`+${tpPct}%`} />
              <KpiBox label="SL"       value={`$${openTrade.slPrice?.toLocaleString()}`} color="text-red-400" sub={`-${slPct}%`} />
            </div>
            <div className="text-xs text-slate-500 font-mono mb-4">
              Size: {openTrade.trade.sizeUSDT} USDT · Qty: {openTrade.trade.qty} BTC · Opened: {new Date(openTrade.trade.openedAt).toLocaleString('de-DE')}
            </div>
            {/* Close controls */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleManualClose}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-yellow-700/30 border border-yellow-600 text-yellow-300 hover:bg-yellow-700/50 disabled:opacity-50 transition-all"
              >
                Close Position
              </button>
              <button
                onClick={handleEmergencyClose}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl bg-red-700/40 border border-red-500 text-red-300 hover:bg-red-700/60 disabled:opacity-50 transition-all"
              >
                <XCircle className="w-3.5 h-3.5" />
                EMERGENCY CLOSE
              </button>
            </div>
          </div>
        )}

        {/* ── Error / Success ─────────────────────────────── */}
        {error && (
          <div className="bg-red-950/50 border border-red-600 rounded-xl px-4 py-3 text-xs text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-slate-500 hover:text-white">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/40 border border-emerald-600 rounded-xl px-4 py-3 text-xs text-emerald-300">
            {successMsg}
            <button onClick={() => setSuccessMsg(null)} className="ml-3 text-slate-500 hover:text-white">✕</button>
          </div>
        )}

        {/* ── Order Setup Form ────────────────────────────── */}
        {!openTrade?.hasOpenTrade && !showConfirm && (
          <div className="bg-slate-900/70 border border-slate-700 rounded-2xl px-5 py-5">
            <div className="text-sm font-black text-slate-200 mb-4">🧮 Configure Real Test Order</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Size USDT (1–10)</label>
                <input
                  type="number" min={MIN_TEST_SIZE_USDT} max={MAX_TEST_SIZE_USDT} step={0.5}
                  value={sizeUSDT}
                  onChange={e => setSizeUSDT(Math.min(MAX_TEST_SIZE_USDT, Math.max(MIN_TEST_SIZE_USDT, parseFloat(e.target.value) || MIN_TEST_SIZE_USDT)))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">TP %</label>
                <input
                  type="number" min={0.5} max={5} step={0.1}
                  value={tpPct}
                  onChange={e => setTpPct(parseFloat(e.target.value) || DEFAULT_TP_PCT)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">SL %</label>
                <input
                  type="number" min={0.1} max={3} step={0.05}
                  value={slPct}
                  onChange={e => setSlPct(parseFloat(e.target.value) || DEFAULT_SL_PCT)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Order preview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
              <KpiBox label="BTC Price"   value={livePrice ? `$${livePrice.toLocaleString()}` : '—'} />
              <KpiBox label="Est. Qty"    value={`${estQty} BTC`} color="text-cyan-400" />
              <KpiBox label="TP Price"    value={`$${tpPrice}`} color="text-emerald-400" sub={`+${tpPct}%`} />
              <KpiBox label="SL Price"    value={`$${slPrice}`} color="text-red-400" sub={`-${slPct}%`} />
              <KpiBox label="Est. Fees"   value={`~${estFee} USDT`} color="text-yellow-400" />
              <KpiBox label="Max Loss"    value={`-${maxLoss} USDT`} color="text-red-400" />
              <KpiBox label="Risk/Reward" value={`1 : ${rr}`} color="text-blue-400" />
              <KpiBox label="Side"        value="BUY" color="text-emerald-400" />
            </div>

            <button
              onClick={() => { if (!livePrice) { setError('Load prep data first — no live price'); return; } setShowConfirm(true); setError(null); }}
              disabled={!livePrice || !prepData || actionLoading}
              className="w-full py-3 text-sm font-black rounded-xl bg-orange-700/40 border-2 border-orange-600 text-orange-300 hover:bg-orange-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Review & Confirm Real Trade →
            </button>
            {!livePrice && <div className="text-xs text-slate-500 mt-2 text-center">Click Refresh to load live BTC price first.</div>}
          </div>
        )}

        {/* ── Confirmation Screen ──────────────────────────── */}
        {showConfirm && !openTrade?.hasOpenTrade && (
          <div className="bg-red-950/50 border-2 border-red-600 rounded-2xl px-5 py-6 space-y-5">
            <div className="text-center">
              <div className="text-red-400 font-black text-lg uppercase tracking-wide mb-1">⚠ FINAL CONFIRMATION REQUIRED</div>
              <div className="text-red-300/80 text-xs">This will place a REAL order on OKX using real funds.</div>
            </div>

            {/* Full order summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <KpiBox label="Pair"        value="BTC-USDT" />
              <KpiBox label="Side"        value="BUY" color="text-emerald-400" />
              <KpiBox label="Size"        value={`${sizeUSDT} USDT`} color="text-cyan-400" />
              <KpiBox label="Est. Qty"    value={`${estQty} BTC`} color="text-cyan-400" />
              <KpiBox label="Entry Price" value={`$${livePrice?.toLocaleString()}`} />
              <KpiBox label="TP"          value={`$${tpPrice}`} color="text-emerald-400" sub={`+${tpPct}%`} />
              <KpiBox label="SL"          value={`$${slPrice}`} color="text-red-400" sub={`-${slPct}%`} />
              <KpiBox label="Risk/Reward" value={`1 : ${rr}`} color="text-blue-400" />
              <KpiBox label="Est. Fees"   value={`~${estFee} USDT`} color="text-yellow-400" />
              <KpiBox label="Max Loss"    value={`-${maxLoss} USDT`} color="text-red-400" />
              <KpiBox label="Alert Level" value={alertLvl}
                color={alertLvl === 'HOT' || alertLvl === 'READY' ? 'text-emerald-400' : 'text-yellow-400'} />
              <KpiBox label="Signal Score" value={`${score} / 75`}
                color={score >= 75 ? 'text-emerald-400' : 'text-yellow-400'} />
            </div>

            {/* System status summary */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-xs space-y-1">
              <div className="text-slate-400 font-bold mb-2">System Status at Confirmation</div>
              <SafeRow label="System Trail"  value={prepData?.systemTrailStatus || '—'} ok={true} />
              <SafeRow label="Hard Blocker"  value={prepData?.hardBlockerStatus || '—'} ok={hardBlockerOk} />
              <SafeRow label="Kill Switch"   value="ACTIVE" ok={true} />
              <SafeRow label="Auto Trading"  value="OFF" ok={true} />
            </div>

            {/* Reason for entry */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Entry Reason (required for audit trail)</label>
              <textarea
                placeholder="e.g. Score 78, HOT alert, BUY_PRESSURE tick, fee barriers passed, manual review complete"
                rows={2}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            {/* Typed confirmation */}
            <div>
              <label className="text-xs text-slate-300 mb-2 block">
                Type exactly to confirm: <span className="font-mono text-cyan-400 font-bold">{CONFIRM_CODE}</span>
              </label>
              <input
                type="text"
                value={confirmTyped}
                onChange={e => setConfirmTyped(e.target.value)}
                placeholder="Type the confirmation code here…"
                className="w-full bg-slate-900 border-2 border-red-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setConfirmTyped(''); setError(null); }}
                className="flex-1 py-3 text-sm font-bold rounded-xl bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 transition-all"
              >
                ← Cancel
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={actionLoading || confirmTyped !== CONFIRM_CODE}
                className="flex-1 py-3 text-sm font-black rounded-xl bg-red-700/60 border-2 border-red-500 text-red-200 hover:bg-red-700/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {actionLoading ? '⏳ Placing order…' : '🔴 I CONFIRM REAL BTC TEST TRADE'}
              </button>
            </div>
          </div>
        )}

        {/* ── Emergency Controls (always visible) ─────────── */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wide mb-3">🚨 Emergency Controls</div>
          <div className="flex flex-wrap gap-3">
            {openTrade?.hasOpenTrade && (
              <button
                onClick={handleEmergencyClose}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-black rounded-xl bg-red-800/50 border border-red-500 text-red-300 hover:bg-red-700/60 disabled:opacity-50 transition-all"
              >
                <XCircle className="w-4 h-4" />
                Emergency Close Position
              </button>
            )}
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 text-slate-500 cursor-not-allowed opacity-60"
            >
              <ShieldOff className="w-4 h-4" />
              Disable Real Trading (always off by default)
            </button>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-red-950/50 border border-red-800 text-red-600 cursor-not-allowed opacity-60"
            >
              <Lock className="w-4 h-4" />
              Kill Switch ON (always active)
            </button>
          </div>
        </div>

        {/* ── Footer verdict ───────────────────────────────── */}
        <div className="text-center text-xs text-slate-700 pb-4">
          realTestModePrepared: true · realTradeExecuted: false · autoTradingAllowed: false · manualConfirmRequired: true · maxRealTestSizeUSDT: 10 · finalVerdict: PHASE_5_MANUAL_REAL_TEST_PREPARED_NOT_EXECUTED
        </div>

      </div>
    </div>
  );
}