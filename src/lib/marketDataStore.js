/**
 * marketDataStore — Centralized OKX market data cache
 *
 * One timer, one fetch loop, shared state across all UI components.
 * Components READ from store — never poll APIs directly.
 *
 * Data sources:
 *   - Prices/tickers: OKX /api/v5/market/tickers (batch, all pairs at once)
 *   - No Polygon calls from frontend — Polygon is backend-only
 *
 * OKX candle rules (enforced here):
 *   - Smallest bar: 1m (NO 1s candle bars on OKX)
 *   - /market/candles limit: max 300 per request
 *   - /market/history-candles: max 100 per request (pagination needed)
 *   - /market/trades: max 500 recent trades
 */

const OKX_CANDLE_LIMIT   = 300;
const OKX_HISTORY_LIMIT  = 100;
const OKX_TRADES_LIMIT   = 500;

export const OKX_SUPPORTED_BARS = [
  '1m', '3m', '5m', '15m', '30m',
  '1H', '2H', '4H', '6H', '12H',
  '1D', '1W', '1M',
];

export function normalizeOkxLimit(limit = 100) {
  return Math.min(Math.max(Number(limit) || 100, 1), OKX_CANDLE_LIMIT);
}

// ── Tracked pairs ─────────────────────────────────────────────────────────────
const TRACKED_PAIRS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT',
  'XRP-USDT', 'ADA-USDT', 'DOGE-USDT',
];

// ── Internal state ────────────────────────────────────────────────────────────
let _prices    = {};   // { 'BTC-USDT': { last, open24h, change24hPct, bid, ask, vol24h, updatedAt } }
let _listeners = [];
let _timer     = null;
let _loading   = true;
let _error     = null;
let _engineMode = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION';

function _notify() {
  const snapshot = { prices: { ..._prices }, loading: _loading, error: _error, engineMode: _engineMode };
  _listeners.forEach(fn => fn(snapshot));
}

// ── Fetch all tickers in one batch call ───────────────────────────────────────
async function _fetchTickers() {
  try {
    // OKX supports fetching all USDT spot tickers in one call
    const instIds = TRACKED_PAIRS.join(',');
    const res  = await fetch(`https://www.okx.com/api/v5/market/tickers?instType=SPOT`);
    const json = await res.json();
    const data = json?.data || [];

    const updated = {};
    for (const d of data) {
      if (!TRACKED_PAIRS.includes(d.instId)) continue;
      const last   = parseFloat(d.last)    || 0;
      const open   = parseFloat(d.open24h) || 0;
      updated[d.instId] = {
        last,
        open24h:       open,
        change24hPct:  open > 0 ? ((last - open) / open) * 100 : 0,
        bid:           parseFloat(d.bidPx)    || last,
        ask:           parseFloat(d.askPx)    || last,
        vol24h:        parseFloat(d.vol24h)   || 0,
        volCcy24h:     parseFloat(d.volCcy24h)|| 0,
        updatedAt:     Date.now(),
      };
    }

    if (Object.keys(updated).length > 0) {
      _prices  = updated;
      _loading = false;
      _error   = null;
      _notify();
    }
  } catch (err) {
    _error = err.message;
    _notify();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Start the shared polling timer (idempotent). Call once on app mount. */
export function startMarketDataStore(intervalMs = 12000) {
  if (_timer) return; // already running
  _fetchTickers(); // immediate first fetch
  _timer = setInterval(_fetchTickers, intervalMs);
}

/** Stop polling (call on app unmount / cleanup). */
export function stopMarketDataStore() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/** Subscribe to store updates. Returns unsubscribe function. */
export function subscribeMarketData(fn) {
  _listeners.push(fn);
  // Emit current state immediately if available
  if (!_loading) {
    fn({ prices: { ..._prices }, loading: _loading, error: _error, engineMode: _engineMode });
  }
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

/** Get current price snapshot for a single pair (sync, no fetch). */
export function getPrice(instId) {
  return _prices[instId] || null;
}

/** Get all tracked prices snapshot (sync). */
export function getAllPrices() {
  return { ..._prices };
}

/** Update engine mode label (called when Polygon scan result arrives). */
export function setEngineMode(mode) {
  _engineMode = mode;
  _notify();
}

export { TRACKED_PAIRS, OKX_CANDLE_LIMIT, OKX_HISTORY_LIMIT, OKX_TRADES_LIMIT };