import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
const OKX_API = 'https://www.okx.com/api/v5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get latest scanner results (high-frequency pair scores)
    const scannerResults = await base44.functions.invoke('robot1Scanner', {});
    const { qualifiedSetups, constants } = scannerResults.data;

    if (!qualifiedSetups || qualifiedSetups.length === 0) {
      return Response.json({
        decision: 'WAIT',
        reason: 'No qualified setups from scanner',
        qualifiedCount: 0,
        executionResult: null
      });
    }

    // Check execution cooldown
    const lastExecutionTime = await getLastExecutionTime(base44);
    const timeSinceLastExec = (Date.now() - lastExecutionTime) / 1000;

    if (timeSinceLastExec < constants.K_COOLDOWN) {
      return Response.json({
        decision: 'WAIT',
        reason: `Cooldown active: ${(constants.K_COOLDOWN - timeSinceLastExec).toFixed(0)}s remaining`,
        cooldownRemaining: constants.K_COOLDOWN - timeSinceLastExec
      });
    }

    // Get account balance and active positions
    const balance = await base44.functions.invoke('getSuzanaBalance', {});
    const { freeUSDT, totalEquity } = balance.data;
    const activePositions = await getActivePositions(base44);

    // Check capital reserve constraint
    const freeCapitalPercent = freeUSDT / totalEquity;
    if (freeCapitalPercent < constants.K_RESERVE) {
      return Response.json({
        decision: 'WAIT',
        reason: `Capital reserve below threshold: ${(freeCapitalPercent * 100).toFixed(1)}% < ${(constants.K_RESERVE * 100).toFixed(0)}%`,
        freeCapitalPercent
      });
    }

    // Select best qualified setup by score
    const bestSetup = qualifiedSetups.reduce((a, b) => 
      (b.scalpQualityScore || 0) > (a.scalpQualityScore || 0) ? b : a
    );

    // Check position limit
    if (activePositions.length >= 1) {
      // Small Balance Mode: max 1 position
      return Response.json({
        decision: 'WAIT',
        reason: 'Max 1 simultaneous position in Small Balance Mode',
        activePositions: activePositions.length
      });
    }

    // Execute buy on best setup
    const tradeAmount = calculateTradeAmount(freeUSDT, constants);
    const executionResult = await executeBuyOrder(base44, bestSetup, tradeAmount);

    if (executionResult.success) {
      // Log execution time for cooldown
      await logExecution(base44, {
        pair: bestSetup.pair,
        decision: 'BUY_EXECUTED',
        timestamp: new Date().toISOString(),
        tradeAmount,
        entryPrice: executionResult.entryPrice
      });

      return Response.json({
        decision: 'BUY_EXECUTED',
        pair: bestSetup.pair,
        score: bestSetup.scalpQualityScore,
        tradeAmount,
        entryPrice: executionResult.entryPrice,
        orderId: executionResult.orderId,
        executionDuration: executionResult.durationMs
      });
    } else {
      return Response.json({
        decision: 'EXECUTION_FAILED',
        pair: bestSetup.pair,
        error: executionResult.error
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getLastExecutionTime(base44) {
  // Fetch from Robot1ExecutionLog
  try {
    const logs = await base44.entities.Robot1ExecutionLog.list();
    const buyExecs = logs
      .filter(l => l.decision === 'BUY')
      .sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time));
    
    if (buyExecs.length > 0) {
      return new Date(buyExecs[0].execution_time).getTime();
    }
  } catch (e) {
    console.error('Failed to fetch last execution time:', e.message);
  }
  return Date.now() - 999999; // Default: allow execution
}

async function getActivePositions(base44) {
  try {
    const ledger = await base44.entities.OXXOrderLedger.list();
    // Find open positions: BUY without matching SELL
    const buys = ledger.filter(o => o.side === 'buy' && o.verified);
    const sells = ledger.filter(o => o.side === 'sell' && o.verified);

    const openPairs = new Set();
    for (const buy of buys) {
      const hasSell = sells.some(s => 
        s.instId === buy.instId && 
        new Date(s.timestamp) > new Date(buy.timestamp)
      );
      if (!hasSell) openPairs.add(buy.instId);
    }

    return Array.from(openPairs).map(pair => ({ pair }));
  } catch (e) {
    console.error('Failed to get active positions:', e.message);
    return [];
  }
}

function calculateTradeAmount(freeUSDT, constants) {
  // Small Balance Mode: min(25, 70% of free)
  if (freeUSDT < 100) {
    return Math.min(25, freeUSDT * 0.70) * constants.K_SIZE;
  }
  // Normal: 20 USDT with size multiplier
  return 20 * constants.K_SIZE;
}

async function executeBuyOrder(base44, setup, tradeAmount) {
  const startTime = Date.now();

  try {
    // Simplified: invoke a buy order via OKX API
    // Real implementation would sign and execute directly
    const res = await base44.functions.invoke('okxConnect', {
      action: 'place_order',
      pair: setup.pair,
      side: 'buy',
      amount: tradeAmount,
      type: 'MARKET'
    });

    if (res.data?.success) {
      return {
        success: true,
        orderId: res.data.orderId,
        entryPrice: res.data.avgPrice,
        durationMs: Date.now() - startTime
      };
    } else {
      return {
        success: false,
        error: res.data?.error || 'Order placement failed'
      };
    }
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

async function logExecution(base44, data) {
  try {
    await base44.entities.Robot1ExecutionLog.create(data);
  } catch (e) {
    console.error('Failed to log execution:', e.message);
  }
}