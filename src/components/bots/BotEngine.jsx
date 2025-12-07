import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

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

      // Trade every 10-15 seconds
      if (Math.random() > 0.9) {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) return;

        // Fetch real market price
        const marketData = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: subscription.trading_pairs?.[0] || 'X:BTCUSD'
        });

        const realPrice = marketData.data?.data?.results?.[0]?.c || 50000;
        const strategy = bot[0].strategy;
        const capital = subscription.capital_allocated || 1000;
        
        // Determine trade
        const isBuy = Math.random() > 0.5;
        const isWin = Math.random() > 0.35; // 65% win rate
        
        let profitPct = 0;
        switch(strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random() * 1) : -(0.3 + Math.random() * 0.6); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 4) : -(1 + Math.random() * 2.5); break;
          case 'arbitrage': profitPct = isWin ? (0.2 + Math.random() * 0.5) : -(0.1 + Math.random() * 0.3); break;
          case 'grid': profitPct = isWin ? (0.8 + Math.random() * 1.5) : -(0.4 + Math.random() * 0.8); break;
          case 'dca': profitPct = isWin ? (1 + Math.random() * 2.5) : -(0.6 + Math.random() * 1.5); break;
          case 'momentum': profitPct = isWin ? (2.5 + Math.random() * 5) : -(1.5 + Math.random() * 4); break;
        }

        const vipBoost = getVIPBoost(vipLevel);
        if (profitPct > 0) profitPct *= (1 + vipBoost);

        const stopLoss = subscription.stop_loss || 5;
        const takeProfit = subscription.take_profit || 10;
        
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        else if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        const positionSize = Math.min(capital, (capital * 0.25));
        const quantity = positionSize / realPrice;
        let profit = (positionSize * profitPct) / 100;
        
        const baseFee = positionSize * 0.001;
        const feeDiscount = getVIPFeeDiscount(vipLevel);
        const fee = baseFee * (1 - feeDiscount);
        profit -= fee;

        const entryPrice = realPrice * (1 + (Math.random() - 0.5) * 0.002);
        const exitPrice = entryPrice * (1 + profitPct / 100);

        // Create trade
        await base44.entities.Trade.create({
          subscription_id: subscription.id,
          symbol: subscription.trading_pairs?.[0] || 'X:BTCUSD',
          side: isBuy ? 'BUY' : 'SELL',
          quantity: quantity,
          price: entryPrice,
          total_value: positionSize,
          fee: fee,
          profit_loss: profit,
          entry_price: entryPrice,
          exit_price: exitPrice,
          execution_mode: 'SIM',
          strategy_used: strategy,
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