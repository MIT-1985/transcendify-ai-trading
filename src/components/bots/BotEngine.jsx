import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeStrategy } from './TechnicalAnalysis';
import { AILearningEngine } from './AILearningEngine';
import { ConstantsService } from './ConstantsService';

export function useBotEngine(subscription, vipLevel = 'none') {
  const [isRunning, setIsRunning] = useState(subscription?.status === 'active');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(subscription?.total_profit || 0);
  const [lastTradeTime, setLastTradeTime] = useState(0);
  const queryClient = useQueryClient();

  // VIP multipliers
  const getVIPBoost = (level) => {
    const boosts = { none: 0, bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.25 };
    return boosts[level] || 0;
  };

  const getVIPFeeDiscount = (level) => {
    const discounts = { none: 0, bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 };
    return discounts[level] || 0;
  };

  useEffect(() => {
    if (!subscription || subscription.status !== 'active') return;
    
    // Force start if not running
    if (!isRunning) {
      setIsRunning(true);
    }

    // Initialize AI learning engine and TROK constants
    let learningEngine = null;
    let trokConstants = [];
    const initLearning = async () => {
      const trades = await base44.entities.Trade.filter({ subscription_id: subscription.id });
      learningEngine = new AILearningEngine(subscription, trades);
      
      // Load TROK constants for strategy optimization
      const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
      if (bot[0]) {
        trokConstants = await ConstantsService.getOptimizationConstants(bot[0].strategy);
        console.log(`Loaded ${trokConstants.length} TROK constants for optimization`);
      }
      
      // Run AI learning every 50 trades
      if (trades.length > 0 && trades.length % 50 === 0) {
        const learningResult = await learningEngine.applyLearning();
        if (learningResult.success) {
          console.log('AI Learning applied:', learningResult);
          queryClient.invalidateQueries({ queryKey: ['subscription', subscription.id] });
        }
      }
    };
    initLearning();

    const interval = setInterval(async () => {
      setElapsedSeconds(prev => prev + 1);

      // Rate limiting - only trade every 10 seconds minimum
      const now = Date.now();
      if (now - lastTradeTime < 10000) {
        return;
      }

      try {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) return;

        const tradingPairs = subscription.trading_pairs || ['X:BTCUSD'];
        const strategy = bot[0].strategy;
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const capital = subscription.capital_allocated || 100;
        
        // Use static price to avoid API rate limits
        const currentPrice = 90000;
        const isBuy = Math.random() > 0.5;
        const isWin = Math.random() > 0.3;
        
        let profitPct = 0;
        switch(strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random()) : -(0.3 + Math.random() * 0.5); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 3) : -(1 + Math.random() * 2); break;
          default: profitPct = isWin ? (1 + Math.random()) : -(0.5 + Math.random()); break;
        }

        const stopLoss = subscription.stop_loss || 5;
        const takeProfit = subscription.take_profit || 10;
        
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        const positionSize = Math.min(capital, capital * 0.25);
        const quantity = Number((positionSize / currentPrice).toFixed(8));
        
        if (!quantity || quantity <= 0) {
          console.log('[BOT] Invalid quantity');
          return;
        }
        
        let profit = (positionSize * profitPct) / 100;
        const fee = positionSize * 0.001;
        profit -= fee;

        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));

        setLastTradeTime(now);
        console.log(`[BOT ${subscription.id}] Trade ${isBuy ? 'BUY' : 'SELL'} $${profit.toFixed(2)}`);

        await base44.entities.Order.create({
          symbol,
          side: isBuy ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: Number(quantity.toFixed(8)),
          price: Number(entryPrice.toFixed(2)),
          status: 'FILLED',
          filled_quantity: Number(quantity.toFixed(8)),
          average_price: Number(entryPrice.toFixed(2)),
          total_value: Number(positionSize.toFixed(2)),
          fee: Number(fee.toFixed(2)),
          execution_mode: 'SIM',
          filled_at: new Date().toISOString()
        });

        await base44.entities.Trade.create({
          subscription_id: subscription.id,
          symbol,
          side: isBuy ? 'BUY' : 'SELL',
          quantity: Number(quantity.toFixed(8)),
          price: Number(entryPrice.toFixed(2)),
          total_value: Number(positionSize.toFixed(2)),
          fee: Number(fee.toFixed(2)),
          profit_loss: Number(profit.toFixed(2)),
          entry_price: Number(entryPrice.toFixed(2)),
          exit_price: Number(exitPrice.toFixed(2)),
          execution_mode: 'SIM',
          strategy_used: `${strategy}`,
          timestamp: new Date().toISOString()
        });
        
        const newProfit = currentProfit + profit;
        await base44.entities.UserSubscription.update(subscription.id, {
          total_profit: newProfit,
          total_trades: (subscription.total_trades || 0) + 1
        });

        setCurrentProfit(newProfit);
        
        // Batch invalidate after 3 seconds to reduce queries
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
          queryClient.invalidateQueries({ queryKey: ['trades'] });
        }, 3000);
      } catch (error) {
        if (error.message.includes('Rate limit')) {
          console.log(`[BOT ${subscription.id}] Rate limited, waiting 30s...`);
          setLastTradeTime(now + 30000); // Wait 30s on rate limit
        } else {
          console.error(`[BOT ${subscription.id}] ERROR:`, error.message);
        }
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(interval);
  }, [subscription, isRunning, currentProfit, queryClient, vipLevel]);

  return {
    isRunning,
    setIsRunning,
    elapsedSeconds,
    currentProfit
  };
}