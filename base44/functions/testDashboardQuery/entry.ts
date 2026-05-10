import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Direct test of what dashboard queries return
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[testDashboard] Testing dashboard queries...');

    // Query 1: OXXOrderLedger with NO filters
    const allOXX = await base44.asServiceRole.entities.OXXOrderLedger.list();
    console.log('[testDashboard] OXXOrderLedger.list() = ' + allOXX.length);

    // Query 2: OXXOrderLedger with dashboard filter
    const dashOXX = allOXX.filter(o => o.verified === true && !o.duplicate && !o.excludedFromPnL);
    console.log('[testDashboard] After verified+!duplicate+!excludedFromPnL = ' + dashOXX.length);

    // Query 3: VerifiedTrade with NO filters
    const allVT = await base44.asServiceRole.entities.VerifiedTrade.list();
    console.log('[testDashboard] VerifiedTrade.list() = ' + allVT.length);

    // Query 4: VerifiedTrade with dashboard filter
    const dashVT = allVT.filter(t => t.status === 'closed' && !t.suspect_pnl && !t.excludedFromPnL);
    console.log('[testDashboard] After status=closed+!suspect_pnl+!excludedFromPnL = ' + dashVT.length);

    // Show a sample
    console.log('[testDashboard] Sample OXX: ' + JSON.stringify(allOXX[0], null, 2));
    console.log('[testDashboard] Sample VT: ' + JSON.stringify(allVT[0], null, 2));

    return Response.json({
      success: true,
      oxxTotal: allOXX.length,
      oxxFiltered: dashOXX.length,
      vtTotal: allVT.length,
      vtFiltered: dashVT.length,
      sampleOXX: allOXX[0],
      sampleVT: allVT[0]
    });

  } catch (error) {
    console.error('[testDashboard] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});