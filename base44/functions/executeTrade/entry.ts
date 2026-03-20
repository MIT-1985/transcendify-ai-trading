import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import ccxt from 'npm:ccxt@4.2.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, mode = 'testnet' } = await req.json();

    // Get execution order
    const orders = await base44.entities.ExecutionOrder.filter({ id: order_id });
    const order = orders[0];

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Verify ownership
    if (order.created_by !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get risk profile
    const profiles = await base44.entities.RiskProfile.filter({ 
      id: order.risk_profile_id 
    });
    const riskProfile = profiles[0];

    if (!riskProfile || !riskProfile.is_active) {
      return Response.json({ error: 'Invalid or inactive risk profile' }, { status: 400 });
    }

    // RISK VALIDATION with TROK
    const riskValidation = await validateRisk(base44, order, riskProfile);
    if (!riskValidation.passed) {
      await base44.entities.ExecutionOrder.update(order_id, {
        status: 'rejected',
        error_message: `Risk validation failed: ${riskValidation.reason}`
      });
      return Response.json({ 
        success: false, 
        error: riskValidation.reason,
        risk_analysis: riskValidation
      });
    }

    // Update order status
    await base44.entities.ExecutionOrder.update(order_id, {
      status: 'executing',
      risk_assessment: riskValidation
    });

    // Initialize exchange
    const exchange = await initializeExchange(order.exchange, mode);
    
    if (!exchange) {
      throw new Error(`Exchange ${order.exchange} not supported or API keys missing`);
    }

    let executionResult;

    try {
      // Execute trade
      if (order.order_type === 'MARKET') {
        executionResult = order.side === 'BUY'
          ? await exchange.createMarketBuyOrder(order.symbol, order.quantity)
          : await exchange.createMarketSellOrder(order.symbol, order.quantity);
      } else {
        executionResult = order.side === 'BUY'
          ? await exchange.createLimitBuyOrder(order.symbol, order.quantity, order.limit_price)
          : await exchange.createLimitSellOrder(order.symbol, order.quantity, order.limit_price);
      }

      // Update order with success
      await base44.entities.ExecutionOrder.update(order_id, {
        status: 'filled',
        execution_result: executionResult,
        executed_at: new Date().toISOString()
      });

      // Create trade record
      await base44.entities.Trade.create({
        subscription_id: order.subscription_id || 'manual',
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        price: executionResult.average || executionResult.price,
        total_value: (executionResult.average || executionResult.price) * order.quantity,
        fee: executionResult.fee?.cost || 0,
        execution_mode: mode.toUpperCase(),
        strategy_used: 'AI_Orchestrator',
        timestamp: new Date().toISOString()
      });

      return Response.json({
        success: true,
        order_id,
        execution: executionResult,
        risk_analysis: riskValidation
      });

    } catch (execError) {
      await base44.entities.ExecutionOrder.update(order_id, {
        status: 'failed',
        error_message: execError.message
      });

      throw execError;
    }

  } catch (error) {
    console.error('Execution error:', error);
    return Response.json({ 
      error: error.message,
      stack: Deno.env.get('NODE_ENV') === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
});

async function validateRisk(base44, order, riskProfile) {
  // Get user wallet
  const wallets = await base44.entities.Wallet.filter({ 
    created_by: order.created_by 
  });
  const wallet = wallets[0];

  if (!wallet) {
    return { passed: false, reason: 'No wallet found' };
  }

  const portfolioValue = wallet.balance_usd || 1000;
  const orderValue = order.quantity * (order.limit_price || 1000); // Estimate

  // Check position size limit
  const positionSizeRatio = orderValue / portfolioValue;
  if (positionSizeRatio > riskProfile.max_position_size) {
    return { 
      passed: false, 
      reason: `Position size ${(positionSizeRatio * 100).toFixed(2)}% exceeds limit ${(riskProfile.max_position_size * 100).toFixed(2)}%`
    };
  }

  // Check orchestrator confidence if available
  if (order.orchestrator_decision?.confidence < riskProfile.min_confidence_threshold) {
    return {
      passed: false,
      reason: `Confidence ${order.orchestrator_decision.confidence} below threshold ${riskProfile.min_confidence_threshold}`
    };
  }

  // TROK-based risk assessment
  let trokRiskScore = 1.0;
  if (riskProfile.use_trok_optimization && order.trok_constants_applied?.length > 0) {
    const avgKPI = order.trok_constants_applied.reduce((sum, c) => sum + (c.kpi_value || 0), 0) / order.trok_constants_applied.length;
    trokRiskScore = avgKPI; // Higher KPI = lower risk
    
    if (trokRiskScore < 0.80) {
      return {
        passed: false,
        reason: `TROK risk score ${trokRiskScore.toFixed(3)} too low (min 0.80 required)`
      };
    }
  }

  // Check daily loss limit
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = await base44.entities.Trade.filter({
    created_by: order.created_by
  });
  
  const todayLoss = todayTrades
    .filter(t => t.created_date.startsWith(today) && (t.profit_loss || 0) < 0)
    .reduce((sum, t) => sum + (t.profit_loss || 0), 0);

  const maxDailyLossUSD = portfolioValue * riskProfile.max_daily_loss;
  if (Math.abs(todayLoss) >= maxDailyLossUSD) {
    return {
      passed: false,
      reason: `Daily loss limit reached: $${Math.abs(todayLoss).toFixed(2)} / $${maxDailyLossUSD.toFixed(2)}`
    };
  }

  return {
    passed: true,
    portfolioValue,
    orderValue,
    positionSizeRatio,
    trokRiskScore,
    dailyLossRemaining: maxDailyLossUSD - Math.abs(todayLoss),
    timestamp: new Date().toISOString()
  };
}

async function initializeExchange(exchangeName, mode) {
  const exchangeId = exchangeName.toLowerCase();
  
  if (mode === 'sim') {
    // Return mock exchange for simulation
    return null;
  }

  const config = {
    enableRateLimit: true,
    timeout: 30000
  };

  if (exchangeId === 'binance') {
    config.apiKey = Deno.env.get('BINANCE_API_KEY');
    config.secret = Deno.env.get('BINANCE_API_SECRET');
    if (mode === 'testnet') {
      config.urls = {
        api: 'https://testnet.binance.vision/api',
      };
    }
  } else if (exchangeId === 'coinbase') {
    config.apiKey = Deno.env.get('COINBASE_API_KEY');
    config.secret = Deno.env.get('COINBASE_API_SECRET');
  } else {
    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  if (!config.apiKey || !config.secret) {
    throw new Error(`API keys not configured for ${exchangeId}`);
  }

  const ExchangeClass = ccxt[exchangeId];
  return new ExchangeClass(config);
}