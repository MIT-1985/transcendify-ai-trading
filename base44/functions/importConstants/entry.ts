import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can import constants
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { constants, clearExisting } = await req.json();

    if (!Array.isArray(constants)) {
      return Response.json({ error: 'Constants must be an array' }, { status: 400 });
    }

    // Clear existing if requested
    if (clearExisting) {
      const existing = await base44.asServiceRole.entities.GlobalIntelligenceLaw.filter({});
      for (const item of existing) {
        await base44.asServiceRole.entities.GlobalIntelligenceLaw.delete(item.id);
      }
    }

    // Validate and process constants
    const processed = [];
    const errors = [];
    const seen = new Set(); // Track duplicates

    for (let i = 0; i < constants.length; i++) {
      const constant = constants[i];
      
      // Create unique key
      const uniqueKey = `${constant.domain}|${constant.law_principle}|${constant.formula_statement}`;
      
      if (seen.has(uniqueKey)) {
        errors.push({ index: i, error: 'Duplicate constant', constant });
        continue;
      }
      
      seen.add(uniqueKey);
      
      // Validate required fields
      if (!constant.domain || !constant.law_principle || !constant.formula_statement) {
        errors.push({ index: i, error: 'Missing required fields', constant });
        continue;
      }

      // Calculate KPI based on TROK theory
      const typeWeights = {
        'Theoretical': 0.95,
        'Empirical': 0.90,
        'Model': 0.85,
        'Observational': 0.80,
        'Heuristic': 0.75
      };
      
      const baseKPI = typeWeights[constant.type] || 0.70;
      const kpi = Math.min(1.0, baseKPI + (Math.random() * 0.05));

      processed.push({
        ...constant,
        kpi_value: kpi,
        optimization_weight: 1.0
      });
    }

    // Bulk create in batches
    const BATCH_SIZE = 100;
    let imported = 0;

    for (let i = 0; i < processed.length; i += BATCH_SIZE) {
      const batch = processed.slice(i, i + BATCH_SIZE);
      await base44.asServiceRole.entities.GlobalIntelligenceLaw.bulkCreate(batch);
      imported += batch.length;
    }

    return Response.json({
      success: true,
      imported,
      duplicates: errors.filter(e => e.error === 'Duplicate constant').length,
      errors: errors.filter(e => e.error !== 'Duplicate constant'),
      total: constants.length
    });

  } catch (error) {
    console.error('Import error:', error);
    return Response.json({ 
      error: error.message,
      stack: Deno.env.get('NODE_ENV') === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
});