import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Robot 1 Automation Loop
 * 
 * Orchestrates the 3-tier system:
 * 1. High-frequency scanner (2-5s) → pair scores + signals
 * 2. Controlled executor (20-60s) → gates execution on scanner + cooldown + capital checks
 * 3. Adaptive learning → KPI feedback → constant adjustments
 * 
 * This function should be scheduled every 30-60 seconds via automation.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const loopStartTime = Date.now();

    // ===== STAGE 1: SCAN =====
    // Run continuous high-frequency scanner (2-5s refresh)
    let scannerResult;
    try {
      const scanRes = await base44.functions.invoke('robot1Scanner', {});
      scannerResult = scanRes.data;
    } catch (e) {
      console.error('[Loop] Scanner failed:', e.message);
      scannerResult = { qualifiedSetups: [], error: e.message };
    }

    // ===== STAGE 2: EXECUTE =====
    // Run controlled executor (gates on cooldown, capital, qualified setups)
    let executorResult;
    try {
      const execRes = await base44.functions.invoke('robot1ControlledExecutor', {});
      executorResult = execRes.data;
    } catch (e) {
      console.error('[Loop] Executor failed:', e.message);
      executorResult = { decision: 'ERROR', error: e.message };
    }

    // ===== STAGE 3: SCALP (Existing Logic) =====
    // Run scalp engine for live position management, exits, and diagnostics
    let scalpResult;
    try {
      const scalpRes = await base44.functions.invoke('robot1Scalp', {});
      scalpResult = scalpRes.data;
    } catch (e) {
      console.error('[Loop] Scalp failed:', e.message);
      scalpResult = { mode: 'scalp', error: e.message };
    }

    // ===== STAGE 4: LEARNING =====
    // The scalp function already triggers KPI feedback for closed trades.
    // No additional action needed here.

    const loopDuration = Date.now() - loopStartTime;

    // Log the full automation loop result
    await logAutomationLoop(base44, {
      scannerResult: {
        signalsDetected: scannerResult?.signalsDetected || 0,
        qualifiedCount: scannerResult?.qualifiedCount || 0,
        rejectedCount: scannerResult?.rejectedCount || 0
      },
      executorResult: {
        decision: executorResult?.decision || 'ERROR',
        pair: executorResult?.pair || null,
        tradeAmount: executorResult?.tradeAmount || 0
      },
      scalpResult: {
        activePositions: scalpResult?.positionCount || 0,
        sellsExecuted: scalpResult?.sells?.length || 0,
        balanceMode: scalpResult?.balanceMode || 'NORMAL'
      },
      loopDurationMs: loopDuration,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      loopDurationMs: loopDuration,
      stages: {
        scanner: {
          signalsDetected: scannerResult?.signalsDetected || 0,
          qualifiedCount: scannerResult?.qualifiedCount || 0,
          executionReady: scannerResult?.qualifiedSetups?.length > 0
        },
        executor: {
          decision: executorResult?.decision || 'ERROR',
          pair: executorResult?.pair,
          tradeAmount: executorResult?.tradeAmount
        },
        scalp: {
          activePositions: scalpResult?.positionCount || 0,
          sellsExecuted: scalpResult?.sells?.length || 0,
          positionsExited: scalpResult?.sells?.length || 0
        }
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function logAutomationLoop(base44, data) {
  // Log to a simple automation log for debugging/monitoring
  try {
    // Could store in a separate entity or just console log
    console.log('[Robot1 Loop]', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to log automation loop:', e.message);
  }
}