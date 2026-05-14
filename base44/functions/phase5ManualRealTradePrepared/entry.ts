import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ── HARD CONSTANTS — NEVER CHANGE WITHOUT MANUAL OPERATOR REVIEW ──────────
  const MODE = 'PHASE_5_MANUAL_CONFIRM_PREPARED_LOCKED';
  const REAL_TRADE_ALLOWED         = false;
  const REAL_TRADE_UNLOCK_ALLOWED  = false;
  const AUTO_TRADING_ALLOWED       = false;
  const MANUAL_CONFIRM_REQUIRED    = true;
  const OKX_ORDER_ENDPOINT_CALLED  = false;
  const KILL_SWITCH_ACTIVE         = true;

  const CONFIG = {
    activePair:        'BTC-USDT',
    tpPercent:         1.30,
    slPercent:         0.65,
    plannedTestSizeUSDT: 5,
    maxTestSizeUSDT:    10,
    maxOpenRealTrades:  1,
    autoRepeat:         false,
    requiredScore:      75,
    noRealTradeOnSellPressure: true,
    noRealTradeIfSystemTrailNotReady: true,
    noRealTradeIfPhase5GuardLocked: true,
  };

  // ── Fetch live BTC price from OKX (read-only, no order endpoint) ──────────
  let lastPrice = null;
  let priceError = null;
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const d = await r.json();
    lastPrice = parseFloat(d?.data?.[0]?.last ?? 0) || null;
  } catch (e) {
    priceError = e.message;
  }

  // ── Fetch system trail ────────────────────────────────────────────────────
  let systemTrail = null;
  try {
    const res = await base44.asServiceRole.functions.invoke('systemTrailTradingState', {});
    systemTrail = res?.data ?? res ?? null;
  } catch (_) {}

  // ── Fetch phase5 guard ────────────────────────────────────────────────────
  let phase5Guard = null;
  try {
    const res = await base44.asServiceRole.functions.invoke('phase5UnlockGuard', {});
    phase5Guard = res?.data ?? res ?? null;
  } catch (_) {}

  // ── Fetch hard blocker ────────────────────────────────────────────────────
  let hardBlocker = null;
  try {
    const res = await base44.asServiceRole.functions.invoke('realTradingHardBlocker', {});
    hardBlocker = res?.data ?? res ?? null;
  } catch (_) {}

  // ── Evaluate real-trade readiness (informational only — all locked) ────────
  const alertLevel   = systemTrail?.liveStatus?.alertLevel ?? 'COLD';
  const totalScore   = systemTrail?.liveStatus?.totalScore ?? 0;
  const p5Status     = phase5Guard?.status ?? 'LOCKED';
  const hbStatus     = hardBlocker?.status ?? 'REAL_TRADING_BLOCKED';
  const mainReason   = systemTrail?.liveStatus?.mainBlockingReason ?? 'UNKNOWN';

  const readinessChecks = [
    { id: 'killSwitch',       label: 'Kill switch active',               passed: KILL_SWITCH_ACTIVE,                        actual: KILL_SWITCH_ACTIVE },
    { id: 'realTradeLocked',  label: 'realTradeAllowed = false',         passed: !REAL_TRADE_ALLOWED,                       actual: false },
    { id: 'autoLocked',       label: 'autoTradingAllowed = false',       passed: !AUTO_TRADING_ALLOWED,                     actual: false },
    { id: 'manualConfirm',    label: 'manualConfirmRequired = true',     passed: MANUAL_CONFIRM_REQUIRED,                   actual: true },
    { id: 'noOKXOrder',       label: 'okxOrderEndpointCalled = false',   passed: !OKX_ORDER_ENDPOINT_CALLED,                actual: false },
    { id: 'phase5Locked',     label: 'Phase5Guard = LOCKED',             passed: p5Status === 'LOCKED',                     actual: p5Status },
    { id: 'hardBlocked',      label: 'HardBlocker = REAL_TRADING_BLOCKED', passed: hbStatus === 'REAL_TRADING_BLOCKED',    actual: hbStatus },
    { id: 'modeCorrect',      label: `Mode = ${MODE}`,                   passed: true,                                      actual: MODE },
  ];

  // What must be true before a real trade is EVER allowed (future gate only)
  const futureUnlockRequirements = phase5Guard?.failedConditions ?? [];

  console.log(`[PHASE5_PREPARED] mode=${MODE} realTrade=${REAL_TRADE_ALLOWED} score=${totalScore} alertLevel=${alertLevel} p5=${p5Status} hb=${hbStatus}`);

  return Response.json({
    mode: MODE,
    generatedAt: new Date().toISOString(),
    requestedBy: user.email,

    // ── Safety flags ──────────────────────────────────────────────────────
    realTradingPrepared:  true,
    realTradingEnabled:   false,
    realTradeAllowed:     REAL_TRADE_ALLOWED,
    realTradeUnlockAllowed: REAL_TRADE_UNLOCK_ALLOWED,
    autoTradingAllowed:   AUTO_TRADING_ALLOWED,
    manualConfirmRequired: MANUAL_CONFIRM_REQUIRED,
    okxOrderEndpointCalled: OKX_ORDER_ENDPOINT_CALLED,
    killSwitchActive:     KILL_SWITCH_ACTIVE,

    // ── Config ────────────────────────────────────────────────────────────
    config: CONFIG,

    // ── Live market state (read-only) ─────────────────────────────────────
    liveMarket: {
      lastPrice,
      alertLevel,
      totalScore,
      requiredScore: CONFIG.requiredScore,
      mainBlockingReason: mainReason,
      priceError: priceError ?? null,
    },

    // ── System statuses ───────────────────────────────────────────────────
    systemTrailStatus:  systemTrail?.finalVerdict ?? 'UNKNOWN',
    phase5GuardStatus:  p5Status,
    hardBlockerStatus:  hbStatus,

    // ── Readiness checklist ───────────────────────────────────────────────
    readinessChecks,
    futureUnlockRequirements,

    // ── Final verdict ─────────────────────────────────────────────────────
    finalVerdict: 'PHASE_5_PREPARED_BUT_LOCKED',
    verdictNote: 'All safety locks active. No real trade will occur until manual operator review and explicit unlock.',
  });
});