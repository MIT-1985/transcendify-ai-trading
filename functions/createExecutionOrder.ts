import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      symbol, 
      side, 
      quantity, 
      order_type = 'MARKET',
      limit_price,
      exchange = 'binance',
      risk_profile_id,
      orchestrator_decision 
    } = await req.json();

    // Get risk profile
    const profiles = await base44.entities.RiskProfile.filter({ 
      id: risk_profile_id,
      created_by: user.email 
    });
    const riskProfile = profiles[0];

    if (!riskProfile) {
      return Response.json({ error: 'Risk profile not found' }, { status: 404 });
    }

    // Load TROK constants for risk assessment
    let trokConstants = [];
    if (riskProfile.use_trok_optimization) {
      const riskConstants = await base44.entities.GlobalIntelligenceLaw.filter({
        domain: 'Economics'
      });
      
      trokConstants = riskConstants
        .filter(c => 
          c.use_cases_notes?.includes('risk') || 
          c.use_cases_notes?.includes('quantum/control modeling')
        )
        .filter(c => (c.kpi_value || 0) >= 0.88)
        .slice(0, 8);
    }

    // Create execution order
    const executionOrder = await base44.entities.ExecutionOrder.create({
      symbol,
      side,
      quantity,
      order_type,
      limit_price,
      exchange,
      risk_profile_id,
      orchestrator_decision,
      trok_constants_applied: trokConstants.map(c => ({
        id: c.id,
        law_principle: c.law_principle,
        formula_statement: c.formula_statement,
        kpi_value: c.kpi_value
      })),
      status: riskProfile.require_orchestrator_approval ? 'pending_approval' : 'approved'
    });

    return Response.json({
      success: true,
      order_id: executionOrder.id,
      status: executionOrder.status,
      trok_constants_count: trokConstants.length,
      requires_approval: riskProfile.require_orchestrator_approval
    });

  } catch (error) {
    console.error('Order creation error:', error);
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});