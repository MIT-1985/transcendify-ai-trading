import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch kill switch status
    const switches = await base44.asServiceRole.entities.TradingKillSwitch.list();
    const killSwitch = switches && switches.length > 0 ? switches[0] : null;

    if (!killSwitch) {
      // Create default active kill switch
      const created = await base44.asServiceRole.entities.TradingKillSwitch.create({
        enabled: true,
        reason: 'EMERGENCY: Equity drawdown detected. Dashboard accounting mismatch.',
        activated_at: new Date().toISOString(),
        verification_status: 'EMERGENCY_PAUSE'
      });
      
      return Response.json({
        kill_switch_active: true,
        message: 'KILL SWITCH CREATED AND ACTIVE',
        status: 'PAUSED_KILL_SWITCH',
        trade_allowed: false,
        reason: created.reason
      }, { status: 200 });
    }

    return Response.json({
      kill_switch_active: killSwitch.enabled,
      message: killSwitch.enabled ? 'KILL SWITCH ACTIVE' : 'Kill switch inactive',
      status: killSwitch.enabled ? 'PAUSED_KILL_SWITCH' : 'OPERATIONAL',
      trade_allowed: !killSwitch.enabled,
      reason: killSwitch.reason
    }, { status: 200 });

  } catch (error) {
    console.error('Kill switch check error:', error);
    return Response.json({
      kill_switch_active: true,
      message: 'FAIL-SAFE: Defaulting to ACTIVE kill switch',
      trade_allowed: false,
      error: error.message
    }, { status: 500 });
  }
});