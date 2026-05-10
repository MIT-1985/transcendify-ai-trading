// DISABLED: runBotTrades contained fake/random logic (Math.random, simulated profitPct, fake win rates).
// Robot 1 now runs exclusively via robot1Execute.
// This endpoint is intentionally disabled.

Deno.serve(async (_req) => {
  return Response.json({
    disabled: true,
    message: 'runBotTrades is disabled. Robot 1 uses robot1Execute exclusively.',
  }, { status: 410 });
});