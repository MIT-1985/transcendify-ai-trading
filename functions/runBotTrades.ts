import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all active subscriptions
    const subscriptions = await base44.asServiceRole.entities.UserSubscription.filter({ 
      status: 'active' 
    });
    
    const results = [];
    
    for (const subscription of subscriptions) {
      try {
        // Get bot details
        const bots = await base44.asServiceRole.entities.TradingBot.filter({ 
          id: subscription.bot_id 
        });
        const bot = bots[0];
        if (!bot) continue;
        
        // Get user wallet for VIP level
        const wallets = await base44.asServiceRole.entities.Wallet.filter({ 
          created_by: subscription.created_by 
        });
        const wallet = wallets[0];
        const vipLevel = wallet?.vip_level || 'none';
        
        // VIP boosts
        const vipBoosts = { none: 0, bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.25 };
        const feeDiscounts = { none: 0, bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 };
        const vipBoost = vipBoosts[vipLevel] || 0;
        const feeDiscount = feeDiscounts[vipLevel] || 0;
        
        const symbol = subscription.trading_pairs?.[0] || 'X:BTCUSD';
        const strategy = bot.strategy;
        const capital = subscription.capital_allocated || 1000;
        
        // Fetch current market price
        const polygonKey = Deno.env.get('POLYGON_API_KEY');
        const priceResponse = await fetch(
          `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${polygonKey}`
        );
        const priceData = await priceResponse.json();
        const currentPrice = priceData.results?.p || 50000;
        
        // Determine trade
        const isBuy = Math.random() > 0.5;
        const isWin = Math.random() > 0.35;
        
        let profitPct = 0;
        switch(strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random() * 1) : -(0.3 + Math.random() * 0.6); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 4) : -(1 + Math.random() * 2.5); break;
          case 'arbitrage': profitPct = isWin ? (0.2 + Math.random() * 0.5) : -(0.1 + Math.random() * 0.3); break;
          case 'grid': profitPct = isWin ? (0.8 + Math.random() * 1.5) : -(0.4 + Math.random() * 0.8); break;
          case 'dca': profitPct = isWin ? (1 + Math.random() * 2.5) : -(0.6 + Math.random() * 1.5); break;
          case 'momentum': profitPct = isWin ? (2.5 + Math.random() * 5) : -(1.5 + Math.random() * 4); break;
        }
        
        profitPct *= (1 + vipBoost);
        
        const positionSize = Math.min(capital, capital * 0.25);
        const quantity = Number((positionSize / currentPrice).toFixed(8));
        
        if (!quantity || isNaN(quantity) || quantity <= 0) continue;
        
        let profit = (positionSize * profitPct) / 100;
        const baseFee = positionSize * 0.001;
        const fee = Number((baseFee * (1 - feeDiscount)).toFixed(2));
        profit = Number((profit - fee).toFixed(2));
        
        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));
        
        // Create order
        await base44.asServiceRole.entities.Order.create({
          symbol: symbol,
          side: isBuy ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: quantity,
          price: entryPrice,
          status: 'FILLED',
          filled_quantity: quantity,
          average_price: entryPrice,
          total_value: Number(positionSize.toFixed(2)),
          fee: fee,
          execution_mode: 'SIM',
          filled_at: new Date().toISOString(),
          created_by: subscription.created_by
        });
        
        // Create trade
        await base44.asServiceRole.entities.Trade.create({
          subscription_id: subscription.id,
          symbol: symbol,
          side: isBuy ? 'BUY' : 'SELL',
          quantity: quantity,
          price: entryPrice,
          total_value: Number(positionSize.toFixed(2)),
          fee: fee,
          profit_loss: profit,
          entry_price: entryPrice,
          exit_price: exitPrice,
          execution_mode: 'SIM',
          strategy_used: strategy,
          timestamp: new Date().toISOString(),
          created_by: subscription.created_by
        });
        
        // Update subscription
        const newProfit = (subscription.total_profit || 0) + profit;
        const newTrades = (subscription.total_trades || 0) + 1;
        
        await base44.asServiceRole.entities.UserSubscription.update(subscription.id, {
          total_profit: Number(newProfit.toFixed(2)),
          total_trades: newTrades
        });
        
        results.push({
          subscription_id: subscription.id,
          bot_name: bot.name,
          trade: { side: isBuy ? 'BUY' : 'SELL', profit, price: entryPrice }
        });
        
      } catch (error) {
        console.error(`Error processing subscription ${subscription.id}:`, error);
      }
    }
    
    return Response.json({ 
      success: true, 
      trades_created: results.length,
      results 
    });
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});