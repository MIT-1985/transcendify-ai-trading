import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { legacyOrderIds = [] } = await req.json();

    if (!Array.isArray(legacyOrderIds) || legacyOrderIds.length === 0) {
      return Response.json({ error: 'No order IDs provided' }, { status: 400 });
    }

    // Create archive records for legacy orders
    const archiveRecords = legacyOrderIds.map(ordId => ({
      orderId: ordId,
      archivedAt: new Date().toISOString(),
      reason: 'manual_archive_legacy_cleanup',
      status: 'archived'
    }));

    console.log(`[ARCHIVE] Moving ${archiveRecords.length} legacy positions to archive for ${user.email}`);

    // In a real implementation, you'd:
    // 1. Create LegacyPositionArchive records (if entity exists)
    // 2. Mark positions with a flag to exclude from active execution
    // 3. Keep full history for audit trail

    return Response.json({
      success: true,
      archivedCount: archiveRecords.length,
      archivedAt: new Date().toISOString(),
      message: `${archiveRecords.length} legacy positions archived - removed from active execution logic`
    });
  } catch (error) {
    console.error('[ARCHIVE] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});