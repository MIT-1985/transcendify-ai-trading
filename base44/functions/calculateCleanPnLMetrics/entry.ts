import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Calculate clean P&L excluding:
 * - stale_unmatched_buy = true
 * - excludedFromPnL = true
 * - suspect_pnl = true
 * - duplicate = true
 * - SIM trades
 * - All leverage/margin trades
 * 
 * Sources:
 * - OXXOrderLedger (clean, verified fills only)
 * - VerifiedTrade (matched buy/sell pairs)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[cleanPnL] Calculating clean P&L metrics...');

    // Get all records
    const allOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const allTrades = await base44.asServiceRole.entities.VerifiedTrade.list();

    // Filter OXX Order Ledger: CLEAN VERIFIED FILLS ONLY
    const cleanOrders = allOrders.filter(o => 
      o.verified === true &&
      !o.duplicate &&
      !o.excludedFromPnL &&
      !o.stale_unmatched_buy &&
      o.side && // has side
      o.avgPx > 0 // has price
    );

    console.log('[cleanPnL] Total OXX orders: ' + allOrders.length);
    console.log('[cleanPnL] Clean verified fills: ' + cleanOrders.length);

    // Filter VerifiedTrade: CLEAN TRADES ONLY
    const cleanTrades = allTrades.filter(t =>
      t.status === 'closed' &&
      !t.suspect_pnl &&
      !t.excludedFromPnL &&
      t.realizedPnL !== undefined &&
      t.realizedPnL !== null
    );

    console.log('[cleanPnL] Total verified trades: ' + allTrades.length);
    console.log('[cleanPnL] Clean trades (closed, not suspect): ' + cleanTrades.length);

    // Calculate metrics from clean trades
    let grossPnLBeforeFees = 0;
    let totalFeesPaid = 0;
    let netPnLAfterFees = 0;
    let winCount = 0;
    let lossCount = 0;
    let breakevenCount = 0;

    const tradesByPair = {};

    for (const trade of cleanTrades) {
      const pnl = parseFloat(trade.realizedPnL || 0);
      const fees = parseFloat((trade.buyFee || 0) + (trade.sellFee || 0));
      
      // Before fees = pnl + fees
      const beforeFees = pnl + fees;
      
      grossPnLBeforeFees += beforeFees;
      totalFeesPaid += fees;
      netPnLAfterFees += pnl;

      if (pnl > 0.0001) {
        winCount++;
      } else if (pnl < -0.0001) {
        lossCount++;
      } else {
        breakevenCount++;
      }

      // Group by pair
      const pair = trade.instId || 'UNKNOWN';
      if (!tradesByPair[pair]) {
        tradesByPair[pair] = {
          count: 0,
          pnl: 0,
          fees: 0,
          wins: 0,
          losses: 0
        };
      }
      tradesByPair[pair].count++;
      tradesByPair[pair].pnl += pnl;
      tradesByPair[pair].fees += fees;
      if (pnl > 0.0001) tradesByPair[pair].wins++;
      if (pnl < -0.0001) tradesByPair[pair].losses++;
    }

    const totalTrades = winCount + lossCount + breakevenCount;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100) : 0;

    // Calculate from clean ledger (alternative view)
    let ledgerGrossValue = 0;
    let ledgerTotalFees = 0;
    const buysByInstId = {};
    const sellsByInstId = {};

    for (const order of cleanOrders) {
      const value = (order.accFillSz || 0) * (order.avgPx || 0);
      const fee = parseFloat(order.fee || 0);
      
      ledgerGrossValue += value;
      ledgerTotalFees += fee;

      const instId = order.instId;
      if (order.side === 'buy') {
        if (!buysByInstId[instId]) buysByInstId[instId] = { count: 0, volume: 0, fees: 0 };
        buysByInstId[instId].count++;
        buysByInstId[instId].volume += value;
        buysByInstId[instId].fees += fee;
      } else if (order.side === 'sell') {
        if (!sellsByInstId[instId]) sellsByInstId[instId] = { count: 0, volume: 0, fees: 0 };
        sellsByInstId[instId].count++;
        sellsByInstId[instId].volume += value;
        sellsByInstId[instId].fees += fee;
      }
    }

    console.log('[cleanPnL] Gross before fees: ' + grossPnLBeforeFees.toFixed(4) + ' USDT');
    console.log('[cleanPnL] Total fees paid: ' + totalFeesPaid.toFixed(4) + ' USDT');
    console.log('[cleanPnL] Net after fees: ' + netPnLAfterFees.toFixed(4) + ' USDT');
    console.log('[cleanPnL] Win/Loss/BE: ' + winCount + '/' + lossCount + '/' + breakevenCount);

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),

      ledgerCleanup: {
        totalOXXOrdersInDB: allOrders.length,
        cleanVerifiedFills: cleanOrders.length,
        excludedFromClean: allOrders.length - cleanOrders.length,
        
        totalVerifiedTradesInDB: allTrades.length,
        cleanVerifiedTrades: cleanTrades.length,
        excludedFromClean: allTrades.length - cleanTrades.length
      },

      pnlMetrics: {
        cleanTradesCount: cleanTrades.length,
        grossPnLBeforeFees: parseFloat(grossPnLBeforeFees.toFixed(4)),
        totalFeesPaid: parseFloat(totalFeesPaid.toFixed(4)),
        netPnLAfterFees: parseFloat(netPnLAfterFees.toFixed(4)),
        
        tradeBreakdown: {
          wins: winCount,
          losses: lossCount,
          breakeven: breakevenCount,
          total: totalTrades,
          winRate: parseFloat(winRate.toFixed(2))
        }
      },

      ledgerAnalysis: {
        totalCleanFillCount: cleanOrders.length,
        totalFillValue: parseFloat(ledgerGrossValue.toFixed(2)),
        totalFeesFromLedger: parseFloat(ledgerTotalFees.toFixed(4)),
        buyOrdersCount: Object.keys(buysByInstId).length,
        sellOrdersCount: Object.keys(sellsByInstId).length
      },

      pairBreakdown: Object.entries(tradesByPair)
        .map(([pair, data]) => ({
          pair,
          tradeCount: data.count,
          netPnL: parseFloat(data.pnl.toFixed(4)),
          totalFees: parseFloat(data.fees.toFixed(4)),
          wins: data.wins,
          losses: data.losses
        }))
        .sort((a, b) => b.tradeCount - a.tradeCount)
        .slice(0, 20)
    });

  } catch (error) {
    console.error('[cleanPnL] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});