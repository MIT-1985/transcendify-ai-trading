import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================
// SET AUTO MODE — admin-only toggle for auto-execution
// ============================================================
// Sets the `auto_mode_enabled` flag on the latest TradingKillSwitch
// record. When true, phase5AutoExecute bypasses the manual confirm
// code and executes real trades automatically based on Claude signals.
// When false, manual confirmation is required (default).
// ============================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const enabled = !!body.enabled;

    // ── Fetch latest kill switch record ──────────────────────────
    const switches = await base44.asServiceRole.entities.TradingKillSwitch.list('-created_date', 5);
    let killSwitch = switches[0] || null;

    if (killSwitch) {
      // Update existing record with the auto_mode flag
      await base44.asServiceRole.entities.TradingKillSwitch.update(killSwitch.id, {
        last_checked: new Date().toISOString(),
      });
    } else {
      // Create one if none exists
      killSwitch = await base44.asServiceRole.entities.TradingKillSwitch.create({
        enabled: true,
        reason: 'Auto-mode toggle initialized',
        activated_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        verification_status: 'VERIFIED_PAUSED',
      });
    }

    // Store auto_mode_enabled in a separate record (since the entity
    // schema doesn't have this field, we use the reason field as a
    // signal marker that auto-mode is on)
    const marker = enabled ? 'AUTO_MODE_ENABLED' : 'AUTO_MODE_DISABLED';
    await base44.asServiceRole.entities.TradingKillSwitch.update(killSwitch.id, {
      reason: marker,
    });

    console.log(`[SET_AUTO_MODE] ${user.email} set auto_mode=${enabled} killSwitchId=${killSwitch.id}`);

    return Response.json({
      success: true,
      autoModeEnabled: enabled,
      killSwitchId: killSwitch.id,
      marker,
      setBy: user.email,
      setAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[SET_AUTO_MODE] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});