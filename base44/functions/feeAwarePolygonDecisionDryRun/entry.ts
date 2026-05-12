/**
 * feeAwarePolygonDecisionDryRun — PHASE 2: DRY RUN, NO ORDER
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Phase:    PHASE_2_DRY_RUN_NO_ORDER
 * Trading:  DISABLED — tradeAllowed = false, no OKX order endpoint called
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 *
 * Inlines Phase 1 scan logic (function-to-function calls not supported),
 * then applies Phase 2 risk checks and returns a dry-run decision.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Pairs ─────────────────────────────────────────────────────────────────────
const PRIMARY_PAIRS = [
  { okx: 'BTC-USDT',  poly: 'X:BTCUSD'  },
  { okx: 'ETH-USDT',  poly: 'X:ETHUSD'  },
  { okx: 'SOL-USDT',  poly: 'X:SOLUSD'  },
  { okx: 'DOGE-USDT', poly: 'X:DOGEUSD' },
  { okx: 'XRP-USDT',  poly: 'X:XRPUSD'  },
];
const SECONDARY_PAIRS = [
  { okx: 'BNB-USDT',  poly: 'X:BNBUSD'  },
  { okx: 'ADA-USDT',  poly: 'X:ADAUSD'  },
  { okx: 'LINK-USDT', poly: 'X:LINKUSD' },
  { okx: 'AVAX-USDT', poly: 'X:AVAXUSD' },
  { okx: 'LTC-USDT',  poly: 'X:LTCUSD'  },
];
const ALL_PAIRS = [...PRIMARY_PAIRS, ...SECONDARY_PAIRS];

// ── Constants ─────────────────────────────────────────────────────────────────
const C = {
  K_SCORE:          70,
  K_FEE_MIN_NET:    0.03,
  K_SPREAD:         0.03,
  K_VOLATILITY_MAX: 1.5,
  K_SIZE:           10,
  K_TP:             0.45,
  K_SL:            -0.25,
  K_RESERVE:        80,
  OKX_TAKER_FEE:    0.001,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPolygonDailyBars(ticker, apiKey) {
  const today  = new Date().toISOString().split('T')[0];
  const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${past30}/${today}?adjusted=true&sort=asc&limit=30&apiKey=${apiKey}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res  = await fetch(url);
      const json = await res.json();
      if (res.status === 429 || (json?.status === 'ERROR' && json?.error?.includes('rate'))) {
        if (attempt < 2) { await sleep(2500); continue; }
        return { ok: false, error: 'RATE_LIMITED', candles: [] };
      }
      if (json.results?.length >= 2) return { ok: true, candles: json.results };
      return { ok: false, error: json.error || `resultsCount=${json.resultsCount ?? 0}`, candles: [] };
    } catch (err) {
      if (attempt < 2) { await sleep(2500); continue; }
      return { ok: false, error: err.message, candles: [] };
    }
  }
  return { ok: false, error: 'MAX_RETRIES', candles: [] };
}

async function fetchOKXTicker(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    const json = await res.json();
    const d = json.data?.[0];
    if (!d) return { ok: false, error: 'no data' };
    const bid = parseFloat(d.bidPx || d.last || 0);
    const ask = parseFloat(d.askPx || d.last || 0);
    const mid = (bid + ask) / 2;
    return { ok: true, bid, ask, last: parseFloat(d.last || 0), vol24h: parseFloat(d.vol24h || 0), volCcy24h: parseFloat(d.volCcy24h || 0), spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 0 };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ── Signal analysis ───────────────────────────────────────────────────────────
function analyzeTrend(c) {
  if (c.length < 5) return { label: 'UNKNOWN', score: 0 };
  const cls = c.map(x => x.c), n = cls.length;
  const rec = cls.slice(n-5).reduce((a,b)=>a+b,0)/5, ear = cls.slice(0,5).reduce((a,b)=>a+b,0)/5;
  const pct = ear > 0 ? (rec-ear)/ear*100 : 0;
  if (pct > 0.15)  return { label: 'BULLISH',   score: 25 };
  if (pct > 0.05)  return { label: 'MILD_BULL',  score: 15 };
  if (pct < -0.15) return { label: 'BEARISH',   score: 0  };
  if (pct < -0.05) return { label: 'MILD_BEAR', score: 5  };
  return               { label: 'NEUTRAL',   score: 8  };
}
function analyzeMomentum(c) {
  if (c.length < 4) return { value: 0, score: 0 };
  const cls = c.map(x => x.c), n = cls.length;
  const mom = cls[n-4] > 0 ? (cls[n-1]-cls[n-4])/cls[n-4]*100 : 0;
  const score = mom > 0.1 ? 25 : mom > 0.03 ? 18 : mom > 0 ? 10 : mom > -0.05 ? 3 : 0;
  return { value: mom, score };
}
function analyzeVolume(c) {
  if (c.length < 6) return { delta: 0, score: 0, collapsing: false };
  const vols = c.map(x => x.v), n = vols.length;
  const rec  = vols.slice(n-3).reduce((a,b)=>a+b,0)/3;
  const ear  = vols.slice(n-6,n-3).reduce((a,b)=>a+b,0)/3;
  const delta = ear > 0 ? (rec-ear)/ear : 0;
  const score = delta > 0.3 ? 20 : delta > 0.1 ? 14 : delta > 0 ? 8 : 0;
  return { delta, score, collapsing: delta < -0.3 };
}
function analyzeVolatility(c) {
  if (c.length < 5) return { pct: 0, score: 10, extreme: false };
  const cls = c.map(x => x.c), n = cls.length;
  const sl = cls.slice(Math.max(0,n-10)), mean = sl.reduce((a,b)=>a+b,0)/sl.length;
  const pct = mean > 0 ? Math.sqrt(sl.reduce((s,v)=>s+Math.pow(v-mean,2),0)/sl.length)/mean*100 : 0;
  const extreme = pct >= C.K_VOLATILITY_MAX;
  const score = pct < 0.05 ? 5 : pct < 0.2 ? 15 : pct < 0.5 ? 10 : pct < C.K_VOLATILITY_MAX ? 5 : 0;
  return { pct, score, extreme };
}
function analyzeCandleStructure(c) {
  if (c.length < 3) return { score: 0 };
  const last3 = c.slice(-3);
  const higherHighs = last3[2].h > last3[1].h && last3[1].h > last3[0].h;
  const bullishBodies = last3.every(x => x.c > x.o);
  const lastBullish = last3[2].c > last3[2].o;
  return { score: higherHighs && bullishBodies ? 15 : higherHighs && lastBullish ? 10 : lastBullish ? 5 : 0 };
}
function scoreSpread(spreadPct) { return spreadPct < 0.005 ? 30 : spreadPct < 0.01 ? 25 : spreadPct < 0.02 ? 18 : spreadPct < 0.03 ? 10 : spreadPct < 0.05 ? 5 : 0; }
function scoreLiquidity(t) { const v = t.volCcy24h||t.vol24h||0; return v > 50000000 ? 20 : v > 10000000 ? 15 : v > 1000000 ? 10 : v > 100000 ? 5 : 0; }
function scoreFeeViability(t) {
  const net = C.K_SIZE*(C.K_TP/100) - C.K_SIZE*C.OKX_TAKER_FEE - (C.K_SIZE+C.K_SIZE*C.K_TP/100)*C.OKX_TAKER_FEE - C.K_SIZE*(t.spreadPct/100);
  return net >= C.K_FEE_MIN_NET*3 ? 30 : net >= C.K_FEE_MIN_NET*2 ? 22 : net >= C.K_FEE_MIN_NET ? 15 : net >= 0 ? 5 : 0;
}
function scoreExecPrice(t) { if (!t.last||!t.bid) return 10; const s=Math.abs(t.ask-t.last)/t.last*100; return s<0.005?20:s<0.01?15:s<0.02?10:5; }

// ── Score one pair ────────────────────────────────────────────────────────────
async function scorePair(pairConfig, polygonApiKey, degraded) {
  const { okx: pair, poly: polygonSymbol } = pairConfig;
  const base = { pair, polygonSymbol, polygonStatus: 'UNKNOWN', polygonDataSource: 'NONE', cacheAgeSeconds: null, candlesCount: 0, okxStatus: 'UNKNOWN', bid: 0, ask: 0, spreadPct: 0, lastClose: 0, trend: 'UNKNOWN', momentum: 0, volumeDelta: 0, volatility: 0, PolygonSignalScore: 0, OKXExecutionScore: 0, ConstantsScore: 0, finalScore: 0, expectedNetProfitAfterFees: 0, decision: 'WAIT_POLYGON_UNAVAILABLE', reason: '', blockers: [], tradeAllowed: false };

  if (degraded) { base.reason = 'scanQuality=DEGRADED_SCAN'; return base; }

  const polyRes = await fetchPolygonDailyBars(polygonSymbol, polygonApiKey);
  if (!polyRes.ok) { base.polygonStatus = 'UNAVAILABLE'; base.reason = polyRes.error; base.blockers = [`POLYGON_UNAVAILABLE: ${polyRes.error}`]; return base; }

  const candles = polyRes.candles;
  base.polygonStatus     = 'OK';
  base.polygonDataSource = 'POLYGON_DAILY_BARS';
  base.candlesCount      = candles.length;
  base.lastClose         = candles[candles.length-1]?.c || 0;

  const trend      = analyzeTrend(candles);
  const momentum   = analyzeMomentum(candles);
  const volDelta   = analyzeVolume(candles);
  const volatility = analyzeVolatility(candles);
  const candleStr  = analyzeCandleStructure(candles);

  base.trend       = trend.label;
  base.momentum    = parseFloat(momentum.value.toFixed(4));
  base.volumeDelta = parseFloat(volDelta.delta.toFixed(4));
  base.volatility  = parseFloat(volatility.pct.toFixed(4));

  const PolygonSignalScore = trend.score + momentum.score + volDelta.score + volatility.score + candleStr.score;
  base.PolygonSignalScore  = parseFloat(PolygonSignalScore.toFixed(2));

  const okx = await fetchOKXTicker(pair);
  if (!okx.ok) { base.okxStatus = 'UNAVAILABLE'; base.decision = 'WAIT'; base.reason = `OKX: ${okx.error}`; base.blockers = ['OKX_TICKER_UNAVAILABLE']; return base; }
  base.okxStatus  = 'OK';
  base.bid        = okx.bid;
  base.ask        = okx.ask;
  base.spreadPct  = parseFloat(okx.spreadPct.toFixed(6));

  const OKXExecutionScore = scoreSpread(okx.spreadPct) + scoreLiquidity(okx) + scoreFeeViability(okx) + scoreExecPrice(okx);
  base.OKXExecutionScore  = parseFloat(OKXExecutionScore.toFixed(2));

  const grossAtTP = C.K_SIZE*(C.K_TP/100);
  const netProfit = grossAtTP - C.K_SIZE*C.OKX_TAKER_FEE - (C.K_SIZE+grossAtTP)*C.OKX_TAKER_FEE - C.K_SIZE*(okx.spreadPct/100);
  base.expectedNetProfitAfterFees = parseFloat(netProfit.toFixed(6));

  // Constants score
  let cscore = 0;
  cscore += netProfit >= C.K_FEE_MIN_NET*3 ? 30 : netProfit >= C.K_FEE_MIN_NET*2 ? 20 : netProfit >= C.K_FEE_MIN_NET ? 10 : 0;
  cscore += volatility.pct < 0.3 ? 30 : volatility.pct < 0.8 ? 20 : volatility.pct < C.K_VOLATILITY_MAX ? 10 : 0;
  cscore += (trend.label === 'BULLISH' && momentum.value > 0.1) ? 25 : trend.label === 'BULLISH' ? 15 : trend.label === 'MILD_BULL' ? 8 : 0;
  cscore += 15; // K_SPREAD baseline
  base.ConstantsScore = parseFloat(Math.min(100, Math.max(0, cscore)).toFixed(2));

  const finalScore = PolygonSignalScore * 0.65 + OKXExecutionScore * 0.35;
  base.finalScore  = parseFloat(finalScore.toFixed(2));

  const blockers = [];
  if (trend.label !== 'BULLISH' && trend.label !== 'MILD_BULL') blockers.push(`trend=${trend.label}`);
  if (momentum.value <= 0)              blockers.push(`momentum=${momentum.value.toFixed(4)}%`);
  if (volDelta.collapsing)              blockers.push(`volumeCollapsing=${volDelta.delta.toFixed(3)}`);
  if (volatility.extreme || volatility.pct > C.K_VOLATILITY_MAX) blockers.push(`volatility=${volatility.pct.toFixed(3)}%>K_VOLATILITY_MAX=${C.K_VOLATILITY_MAX}%`);
  if (okx.spreadPct > C.K_SPREAD)      blockers.push(`spread=${okx.spreadPct.toFixed(4)}%>K_SPREAD=${C.K_SPREAD}%`);
  if (netProfit < C.K_FEE_MIN_NET)     blockers.push(`netProfit=${netProfit.toFixed(4)}<K_FEE_MIN_NET=${C.K_FEE_MIN_NET}`);
  if (finalScore < C.K_SCORE)          blockers.push(`finalScore=${finalScore.toFixed(1)}<K_SCORE=${C.K_SCORE}`);
  base.blockers = blockers;

  if (blockers.length === 0) { base.decision = 'BUY_READY'; base.reason = 'All entry conditions met. tradeAllowed=false (READ_ONLY_PHASE).'; }
  else if (volatility.extreme || volatility.pct > C.K_VOLATILITY_MAX || okx.spreadPct > C.K_SPREAD*3 || volDelta.collapsing) { base.decision = 'AVOID'; base.reason = blockers.join(' | '); }
  else { base.decision = 'WAIT'; base.reason = blockers.join(' | '); }

  return base;
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) return Response.json({ phase: 'PHASE_2_DRY_RUN_NO_ORDER', tradeAllowed: false, error: 'POLYGON_API_KEY missing' }, { status: 500 });

    console.log(`[PHASE2_DRY_RUN] Started. User: ${user.email}. tradeAllowed=false. noOKXOrderEndpointCalled=true.`);

    // ── Step 1: Run Phase 1 scan inline ──
    const primaryResults = [];
    for (const pair of PRIMARY_PAIRS) {
      const r = await scorePair(pair, polygonApiKey, false);
      primaryResults.push(r);
      console.log(`[POLY] ${pair.okx}: ${r.polygonStatus} decision=${r.decision} score=${r.finalScore}`);
      await sleep(900);
    }

    const primaryOK = primaryResults.filter(r => r.polygonStatus === 'OK').length;
    let scanQuality = primaryOK >= 5 ? 'PRIMARY_OK' : primaryOK >= 3 ? 'PARTIAL_PRIMARY' : primaryOK > 0 ? 'DEGRADED_SCAN' : 'BLOCKED';
    const degraded  = scanQuality === 'DEGRADED_SCAN' || scanQuality === 'BLOCKED';

    const secondaryResults = [];
    for (const pair of SECONDARY_PAIRS) {
      const r = await scorePair(pair, polygonApiKey, degraded);
      secondaryResults.push(r);
      if (!degraded) await sleep(900);
    }

    const allResults = [...primaryResults, ...secondaryResults];
    const totalPolyOK = allResults.filter(r => r.polygonStatus === 'OK').length;
    if (totalPolyOK === 10) scanQuality = 'FULL_SCAN';

    const sorted  = [...allResults].sort((a, b) => b.finalScore - a.finalScore);
    const top3    = sorted.slice(0, 3);
    const pairsPolygonOK   = totalPolyOK;
    const pairsUnavailable = allResults.filter(r => r.polygonStatus !== 'OK').length;
    const scanQualityOK    = ['FULL_SCAN', 'PRIMARY_OK', 'PARTIAL_PRIMARY'].includes(scanQuality);

    // ── Step 2: Phase 2 risk evaluation ──
    const buyReadyPairs = allResults.filter(r => r.decision === 'BUY_READY').sort((a,b) => b.finalScore - a.finalScore);
    const bestCandidate = buyReadyPairs[0] || null;

    const riskChecks = {
      killSwitchActive:            true,
      killSwitchBlocksExecution:   true,
      polygonPrimaryScanOK:        scanQualityOK,
      scanQuality,
      buyReadyCandidateExists:     !!bestCandidate,
      finalScoreOK:                bestCandidate ? bestCandidate.finalScore >= C.K_SCORE : false,
      netProfitOK:                 bestCandidate ? bestCandidate.expectedNetProfitAfterFees >= C.K_FEE_MIN_NET : false,
      spreadOK:                    bestCandidate ? (bestCandidate.spreadPct||0) <= C.K_SPREAD : false,
      volumeNotCollapsing:         bestCandidate ? !bestCandidate.blockers?.some(b=>b.includes('volumeCollapsing')) : false,
      volatilityAcceptable:        bestCandidate ? (bestCandidate.volatility||0) <= C.K_VOLATILITY_MAX : false,
      polygonStatusOK:             bestCandidate ? bestCandidate.polygonStatus === 'OK' : false,
      okxStatusOK:                 bestCandidate ? bestCandidate.okxStatus === 'OK' : false,
      okxOpenOrdersZero:           'NOT_CHECKED_PHASE2',
      okxFrozenZero:               'NOT_CHECKED_PHASE2',
      accountingClean:             'NOT_CHECKED_PHASE2',
      noOKXOrderEndpointCalled:    true,
    };

    // ── Step 3: Determine wouldBuy + noTradeReason ──
    let wouldBuy      = false;
    let noTradeReason = '';
    let selectedPair  = null;

    if (!scanQualityOK) {
      noTradeReason = `Polygon data insufficient — scanQuality=${scanQuality}. Need PRIMARY_OK or better.`;
    } else if (!bestCandidate) {
      // Look for a near-miss (score >= 70 but blocked by fee/volume)
      const nearMiss = allResults.filter(r => r.finalScore >= C.K_SCORE).sort((a,b) => b.finalScore - a.finalScore)[0];
      if (nearMiss) {
        const feeBlocked = nearMiss.expectedNetProfitAfterFees < C.K_FEE_MIN_NET;
        const volBlocked = nearMiss.blockers?.some(b => b.includes('volumeCollapsing'));
        const parts = [];
        if (feeBlocked) parts.push(`expected net profit $${nearMiss.expectedNetProfitAfterFees?.toFixed(4)} below K_FEE_MIN_NET=$${C.K_FEE_MIN_NET}`);
        if (volBlocked) parts.push('volume collapsing');
        noTradeReason = `Fee-aware blocker on ${nearMiss.pair} (score=${nearMiss.finalScore?.toFixed(1)}): ${parts.join(' and/or ')}`;
      } else {
        noTradeReason = `No BUY_READY pair. Top: ${sorted.slice(0,3).map(r=>`${r.pair}=${r.decision}(${r.finalScore?.toFixed(1)})`).join(', ')}`;
      }
    } else {
      const feeBlocked = bestCandidate.expectedNetProfitAfterFees < C.K_FEE_MIN_NET;
      const volBlocked = bestCandidate.blockers?.some(b => b.includes('volumeCollapsing'));
      if (feeBlocked || volBlocked) {
        const parts = [];
        if (feeBlocked) parts.push(`expected net profit $${bestCandidate.expectedNetProfitAfterFees?.toFixed(4)} below threshold $${C.K_FEE_MIN_NET}`);
        if (volBlocked) parts.push('volume collapsing');
        noTradeReason = `Fee-aware blocker: ${parts.join(' and/or ')}`;
        wouldBuy = false;
      } else {
        // All signal checks pass — kill switch still blocks execution
        selectedPair  = bestCandidate;
        noTradeReason = 'Kill switch ACTIVE — execution blocked. All signal + fee checks passed. Would execute in Phase 3 only after kill switch explicitly disabled by operator.';
      }
    }

    const rejectedPairs = allResults
      .filter(r => r.decision !== 'BUY_READY')
      .map(r => ({ pair: r.pair, decision: r.decision, finalScore: r.finalScore, blockers: r.blockers, reason: r.reason }));

    console.log(`[PHASE2_DRY_RUN] Complete. wouldBuy=${wouldBuy} selected=${selectedPair?.pair||'none'} scanQuality=${scanQuality} reason="${noTradeReason}"`);

    return Response.json({
      engine:                   'FEE_AWARE_POLYGON_TRADING_ENGINE',
      phase:                    'PHASE_2_DRY_RUN_NO_ORDER',
      tradeAllowed:             false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      wouldBuy,
      decisionTime:             new Date().toISOString(),
      selectedPair: selectedPair ? {
        pair:                       selectedPair.pair,
        polygonSymbol:              selectedPair.polygonSymbol,
        finalScore:                 selectedPair.finalScore,
        PolygonSignalScore:         selectedPair.PolygonSignalScore,
        OKXExecutionScore:          selectedPair.OKXExecutionScore,
        ConstantsScore:             selectedPair.ConstantsScore,
        expectedNetProfitAfterFees: selectedPair.expectedNetProfitAfterFees,
        trend:                      selectedPair.trend,
        momentum:                   selectedPair.momentum,
        spreadPct:                  selectedPair.spreadPct,
        volatility:                 selectedPair.volatility,
        volumeDelta:                selectedPair.volumeDelta,
        bid:                        selectedPair.bid,
        ask:                        selectedPair.ask,
        polygonDataSource:          selectedPair.polygonDataSource,
      } : null,
      noTradeReason,
      scanQuality,
      pairsPolygonOK,
      pairsFromCache:   0,
      pairsUnavailable,
      constantsUsed:    C,
      riskChecks,
      rejectedPairs,
      top3: top3.map(p => ({ pair: p.pair, decision: p.decision, finalScore: p.finalScore, expectedNetProfitAfterFees: p.expectedNetProfitAfterFees, blockers: p.blockers, trend: p.trend, momentum: p.momentum, PolygonSignalScore: p.PolygonSignalScore, OKXExecutionScore: p.OKXExecutionScore })),
      note: 'Phase 2 dry-run complete. No orders placed. Kill switch remains active. Phase 3 requires explicit kill switch deactivation by operator.',
    });

  } catch (err) {
    console.error('[PHASE2_DRY_RUN] Error:', err.message);
    return Response.json({ phase: 'PHASE_2_DRY_RUN_NO_ORDER', tradeAllowed: false, noOKXOrderEndpointCalled: true, killSwitchActive: true, wouldBuy: false, noTradeReason: `Internal error: ${err.message}`, error: err.message }, { status: 500 });
  }
});