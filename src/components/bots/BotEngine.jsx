import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { analyzeStrategy } from './TechnicalAnalysis';

export function useBotEngine(subscription, vipLevel = 'none') {
  const [isRunning, setIsRunning] = useState(false);
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
    if (!subscription || subscription.status !== 'active' || !isRunning) return;

    const interval = setInterval(async () => {
      setElapsedSeconds(prev => prev + 1);

      // Analyze market every 5-10 seconds
      if (Math.random() > 0.85) {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) return;

        const symbol = subscription.trading_pairs?.[0] || 'X:BTCUSD';
        const strategy = bot[0].strategy;
        
        // Analyze market using technical indicators
        const analysis = await analyzeStrategy(symbol, strategy);
        
        // Only trade if signal is not HOLD
        if (analysis.signal === 'HOLD') return;
        
        const capital = subscription.capital_allocated || 1000;
        const currentPrice = analysis.currentPrice;
        const isBuy = analysis.signal === 'BUY';
        
        // Calculate profit based on technical analysis confidence and target
        const targetReached = Math.random() < analysis.confidence;
        let profitPct = 0;
        
        if (targetReached) {
          profitPct = ((analysis.targetPrice - currentPrice) / currentPrice) * 100;
          if (!isBuy) profitPct = -profitPct; // Invert for SELL
        } else {
          // Failed trade - small loss
          profitPct = -(0.2 + Math.random() * 0.8);
        }

        const vipBoost = getVIPBoost(vipLevel);
        if (profitPct > 0) profitPct *= (1 + vipBoost);

        const stopLoss = subscription.stop_loss || 5;
        const takeProfit = subscription.take_profit || 10;
        
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        else if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        const positionSize = Math.min(capital, (capital * 0.25));
        const quantity = positionSize / currentPrice;
        let profit = (positionSize * profitPct) / 100;
        
        const baseFee = positionSize * 0.001;
        const feeDiscount = getVIPFeeDiscount(vipLevel);
        const fee = baseFee * (1 - feeDiscount);
        profit -= fee;

        const entryPrice = currentPrice;
        const exitPrice = analysis.targetPrice;

        // Create real ORDER first
        const order = await base44.entities.Order.create({
          symbol: symbol,
          side: isBuy ? 'BUY' : 'SELL',
          type: 'MARKET',
          quantity: quantity,
          price: entryPrice,
          status: 'FILLED',
          filled_quantity: quantity,
          average_price: entryPrice,
          total_value: positionSize,
          fee: fee,
          execution_mode: 'SIM',
          filled_at: new Date().toISOString()
        });

        // Create trade record with order reference
        await base44.entities.Trade.create({
          subscription_id: subscription.id,
          symbol: symbol,
          side: isBuy ? 'BUY' : 'SELL',
          quantity: quantity,
          price: entryPrice,
          total_value: positionSize,
          fee: fee,
          profit_loss: profit,
          entry_price: entryPrice,
          exit_price: exitPrice,
          execution_mode: 'SIM',
          strategy_used: `${strategy} (RSI:${analysis.indicators.rsi}, Conf:${(analysis.confidence * 100).toFixed(0)}%)`,
          timestamp: new Date().toISOString()
        });

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
    }, 1000);

    return () => clearInterval(interval);
  }, [subscription, isRunning, currentProfit, queryClient, vipLevel]);

  return {
    isRunning,
    setIsRunning,
    elapsedSeconds,
    currentProfit
  };
}