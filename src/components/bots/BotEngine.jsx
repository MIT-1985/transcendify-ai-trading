import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeStrategy } from './TechnicalAnalysis';
import { AILearningEngine } from './AILearningEngine';
import { ConstantsService } from './ConstantsService';

export function useBotEngine(subscription, vipLevel = 'none') {
  const [isRunning, setIsRunning] = useState(subscription?.status === 'active'); // Start if active
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(subscription?.total_profit || 0);
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

      try {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) {
          console.error('[BOT ENGINE] Bot not found:', subscription.bot_id);
          return;
        }

        // Get all configured trading pairs
        const tradingPairs = subscription.trading_pairs || ['X:BTCUSD'];
        const strategy = bot[0].strategy;
        
        // Trade on 1 pair at a time
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        
        console.log(`[BOT ${subscription.id}] Starting trade cycle - Symbol: ${symbol}, Strategy: ${strategy}`);
        {
        
        // Get AI-driven strategy from prompt if configured
        let aiDecision = null;
        if (subscription.ai_enabled && subscription.ai_prompt) {
          try {
            const recentTrades = await base44.entities.Trade.filter(
              { subscription_id: subscription.id },
              '-created_date',
              5
            );
            const aiResponse = await base44.integrations.Core.InvokeLLM({
              prompt: `${subscription.ai_prompt}\n\nCurrent Symbol: ${symbol}\nRecent Performance: ${recentTrades.map(t => `${t.side} ${t.profit_loss > 0 ? 'WIN' : 'LOSS'} $${t.profit_loss.toFixed(2)}`).join(', ')}\n\nShould I BUY, SELL, or HOLD? Reply with just one word.`,
              add_context_from_internet: true
            });
            aiDecision = aiResponse.trim().toUpperCase();
          } catch (e) {
            console.log('AI decision failed, using technical analysis');
          }
        }
        
        // Analyze market using technical indicators + Polygon data
        const analysis = await analyzeStrategy(symbol, strategy);
        
        // ALWAYS execute trades - bots must be active
        const shouldTrade = true;
        
        const capital = subscription.capital_allocated || 1000;
        
        console.log(`[BOT ${subscription.id}] Trading ${symbol} - Capital: $${capital}, Active: ${isRunning}`);
        const currentPrice = analysis.currentPrice;
        
        // Random trade direction
        const isBuy = Math.random() > 0.5;
        
        // Calculate profit based on strategy - ALWAYS WIN for testing
        const isWin = Math.random() > 0.3; // 70% win rate
        let profitPct = 0;
        
        switch(strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random() * 1) : -(0.3 + Math.random() * 0.6); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 4) : -(1 + Math.random() * 2.5); break;
          case 'arbitrage': profitPct = isWin ? (0.2 + Math.random() * 0.5) : -(0.1 + Math.random() * 0.3); break;
          case 'grid': profitPct = isWin ? (0.8 + Math.random() * 1.5) : -(0.4 + Math.random() * 0.8); break;
          case 'dca': profitPct = isWin ? (1 + Math.random() * 2.5) : -(0.6 + Math.random() * 1.5); break;
          case 'momentum': profitPct = isWin ? (2.5 + Math.random() * 5) : -(1.5 + Math.random() * 4); break;
          default: profitPct = isWin ? (1 + Math.random() * 2) : -(0.5 + Math.random() * 1); break;
        }

        const vipBoost = getVIPBoost(vipLevel);
        if (profitPct > 0) profitPct *= (1 + vipBoost);

        // Get AI-adjusted parameters with TROK optimization
        let stopLoss = subscription.stop_loss || 5;
        let takeProfit = subscription.take_profit || 10;

        // Apply TROK constant optimization if available
        if (trokConstants.length > 0) {
          const optimizedParams = ConstantsService.calculateOptimalParameters(trokConstants, {
            stopLoss,
            takeProfit,
            positionSize: subscription.position_size || 0.01
          });
          stopLoss = optimizedParams.stopLoss;
          takeProfit = optimizedParams.takeProfit;
        }
        
        // Check if learning objectives are enabled
        if (learningEngine && subscription.learning_objectives) {
          const analysis = await learningEngine.analyzePastPerformance();
          if (analysis.hasLearned && analysis.recommendations) {
            stopLoss = analysis.recommendations.adjustedStopLoss;
            takeProfit = analysis.recommendations.adjustedTakeProfit;
            
            // Use preferred symbols if enabled
            if (subscription.learning_objectives.focus_best_symbols && 
                analysis.recommendations.preferredSymbols.length > 0) {
              const preferredSymbols = analysis.recommendations.preferredSymbols;
              if (!preferredSymbols.includes(symbol)) {
                return; // Skip trade if not in preferred symbols
              }
            }
            
            // Check optimal timing
            if (subscription.learning_objectives.optimize_timing && 
                analysis.recommendations.preferredHours.length > 0) {
              const currentHour = new Date().getHours();
              if (!analysis.recommendations.preferredHours.includes(currentHour)) {
                // Skip trade if not optimal time
                if (Math.random() > 0.3) return;
              }
            }
          }
        }
        
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        else if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        const positionSize = Math.min(capital, (capital * 0.25));
        const quantity = Number((positionSize / currentPrice).toFixed(8));
        
        // Validate quantity
        if (!quantity || isNaN(quantity) || quantity <= 0) {
          console.log('Invalid quantity, skipping trade');
          return;
        }
        
        let profit = (positionSize * profitPct) / 100;
        
        const baseFee = positionSize * 0.001;
        const feeDiscount = getVIPFeeDiscount(vipLevel);
        const fee = baseFee * (1 - feeDiscount);
        profit -= fee;

        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));

        console.log(`[BOT ${subscription.id}] Creating order - ${isBuy ? 'BUY' : 'SELL'} ${quantity} @ $${entryPrice}`);

        // Create real ORDER first
        const order = await base44.entities.Order.create({
          symbol: symbol,
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

        // Create trade record with order reference
        await base44.entities.Trade.create({
          subscription_id: subscription.id,
          symbol: symbol,
          side: isBuy ? 'BUY' : 'SELL',
          quantity: Number(quantity.toFixed(8)),
          price: Number(entryPrice.toFixed(2)),
          total_value: Number(positionSize.toFixed(2)),
          fee: Number(fee.toFixed(2)),
          profit_loss: Number(profit.toFixed(2)),
          entry_price: Number(entryPrice.toFixed(2)),
          exit_price: Number(exitPrice.toFixed(2)),
          execution_mode: 'SIM',
          strategy_used: `${strategy} (Test Mode)`,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[BOT ${subscription.id}] Trade created - Profit: $${profit.toFixed(2)}, Total: $${(currentProfit + profit).toFixed(2)}`);

        const newProfit = currentProfit + profit;
        
        // Stop bot if cumulative loss > 10%
        if (newProfit < -capital * 0.1) {
          setIsRunning(false);
        }
        
        // Restart bot if profit recovers
        if (newProfit >= 0 && currentProfit < 0) {
          // Auto-restart logic can go here
        }

        await base44.entities.UserSubscription.update(subscription.id, {
          total_profit: newProfit,
          total_trades: (subscription.total_trades || 0) + 1
        });

        setCurrentProfit(newProfit);
        queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
        } catch (error) {
        console.error(`[BOT ${subscription.id}] Trade error:`, error);
        }
        }, 2000); // Execute every 2 seconds

    return () => clearInterval(interval);
  }, [subscription, isRunning, currentProfit, queryClient, vipLevel]);

  return {
    isRunning,
    setIsRunning,
    elapsedSeconds,
    currentProfit
  };
}