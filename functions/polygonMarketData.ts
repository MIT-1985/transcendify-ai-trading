import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const BASE_URL = "https://api.polygon.io";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, symbol, from, to, timespan, limit } = await req.json();

    let url;
    switch (action) {
      case 'ticker':
        // Get current price for a ticker
        url = `${BASE_URL}/v2/aggs/ticker/${symbol}/prev?apiKey=${POLYGON_API_KEY}`;
        break;
      
      case 'snapshot':
        // Get snapshot of all tickers
        url = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        break;
      
      case 'aggregates':
        // Get historical aggregates (candles)
        const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const toDate = to || new Date().toISOString().split('T')[0];
        const span = timespan || 'day';
        url = `${BASE_URL}/v2/aggs/ticker/${symbol}/range/1/${span}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=${limit || 50}&apiKey=${POLYGON_API_KEY}`;
        break;
      
      case 'quote':
        // Get real-time quote
        url = `${BASE_URL}/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
        break;

      case 'tickers':
        // Get list of available tickers
        url = `${BASE_URL}/v3/reference/tickers?market=crypto&active=true&limit=${limit || 100}&apiKey=${POLYGON_API_KEY}`;
        break;
      
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return Response.json({ 
        error: 'Polygon API error', 
        details: data 
      }, { status: response.status });
    }

    return Response.json({ 
      success: true, 
      data 
    });

  } catch (error) {
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});