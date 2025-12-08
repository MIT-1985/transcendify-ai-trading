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
        
        // Trade on all configured pairs
        const tradingPairs = subscription.trading_pairs || ['X:BTCUSD'];
        const strategy = bot.strategy;
        const capital = subscription.capital_allocated || 1000;
        
        // Process only 1 pair per execution to avoid rate limits
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        {
        
        // Fetch current market price and candles
        const polygonKey = Deno.env.get('POLYGON_API_KEY');
        const priceResponse = await fetch(
          `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${polygonKey}`
        );
        const priceData = await priceResponse.json();
        const currentPrice = priceData.results?.p || 50000;
        
        // Get historical candles for technical analysis
        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const candlesResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/hour/${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${polygonKey}`
        );
        const candlesData = await candlesResponse.json();
        const candles = candlesData.results || [];
        
        // Technical analysis
        let technicalSignal = 'HOLD';
        let confidence = 0.5;
        let stopLossPrice = currentPrice * 0.97;
        let takeProfitPrice = currentPrice * 1.03;
        
        if (candles.length >= 50) {
          const prices = candles.map(c => c.c);
          
          // Calculate RSI
          const rsiValues = [];
          for (let i = 14; i < prices.length; i++) {
            const gains = [];
            const losses = [];
            for (let j = i - 14; j < i; j++) {
              const change = prices[j + 1] - prices[j];
              if (change > 0) gains.push(change);
              else losses.push(Math.abs(change));
            }
            const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
            const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
            const rs = avgGain / (avgLoss || 1);
            const rsi = 100 - (100 / (1 + rs));
            rsiValues.push(rsi);
          }
          const rsi = rsiValues[rsiValues.length - 1] || 50;
          
          // Calculate MACD
          const ema12 = prices.map((_, i) => {
            if (i < 12) return prices[i];
            const slice = prices.slice(Math.max(0, i - 12), i + 1);
            return slice.reduce((a, b, idx) => a + b * (2 / (12 + 1)) ** (slice.length - idx - 1), 0);
          });
          const ema26 = prices.map((_, i) => {
            if (i < 26) return prices[i];
            const slice = prices.slice(Math.max(0, i - 26), i + 1);
            return slice.reduce((a, b, idx) => a + b * (2 / (26 + 1)) ** (slice.length - idx - 1), 0);
          });
          const macd = ema12[ema12.length - 1] - ema26[ema26.length - 1];
          
          // Bollinger Bands
          const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
          const variance = prices.slice(-20).reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
          const std = Math.sqrt(variance);
          const bbUpper = sma20 + (2 * std);
          const bbLower = sma20 - (2 * std);
          const bbPercentB = (currentPrice - bbLower) / (bbUpper - bbLower);
          
          // Combined signal
          const buyScore = (rsi < 30 ? 1 : 0) + (macd > 0 ? 1 : 0) + (bbPercentB < 0.2 ? 1 : 0);
          const sellScore = (rsi > 70 ? 1 : 0) + (macd < 0 ? 1 : 0) + (bbPercentB > 0.8 ? 1 : 0);
          
          if (buyScore >= 2) {
            technicalSignal = 'BUY';
            confidence = 0.7 + (buyScore * 0.1);
            stopLossPrice = currentPrice * (1 - (subscription.stop_loss || 5) / 100);
            takeProfitPrice = currentPrice * (1 + (subscription.take_profit || 10) / 100);
          } else if (sellScore >= 2) {
            technicalSignal = 'SELL';
            confidence = 0.7 + (sellScore * 0.1);
            stopLossPrice = currentPrice * (1 + (subscription.stop_loss || 5) / 100);
            takeProfitPrice = currentPrice * (1 - (subscription.take_profit || 10) / 100);
          }
        }
        
        // Determine trade based on technical analysis
        const shouldTrade = technicalSignal !== 'HOLD' ? Math.random() < confidence : Math.random() > 0.4;
        if (!shouldTrade) continue;
        
        const isBuy = technicalSignal === 'BUY';
        const isWin = Math.random() < confidence;
        
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
        
        // Apply stop-loss and take-profit
        const stopLossPct = (subscription.stop_loss || 5);
        const takeProfitPct = (subscription.take_profit || 10);
        
        if (profitPct < 0 && Math.abs(profitPct) > stopLossPct) {
          profitPct = -stopLossPct; // Hit stop-loss
        } else if (profitPct > 0 && profitPct > takeProfitPct) {
          profitPct = takeProfitPct; // Hit take-profit
        }
        
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
          strategy_used: `${strategy} (RSI:${rsiValues[rsiValues.length - 1]?.toFixed(0) || 'N/A'}, MACD:${macd?.toFixed(2) || 'N/A'}, Conf:${(confidence * 100).toFixed(0)}%)`,
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
          symbol: symbol,
          trade: { side: isBuy ? 'BUY' : 'SELL', profit, price: entryPrice }
        });
        }
        
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