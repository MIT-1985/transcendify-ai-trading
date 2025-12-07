import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

export function useBotEngine(subscription) {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(subscription?.total_profit || 0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!subscription || subscription.status !== 'active' || !isRunning) return;

    const interval = setInterval(async () => {
      setElapsedSeconds(prev => prev + 1);

      // Simulate trade every 30-60 seconds
      if (Math.random() > 0.97) {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) return;

        const strategy = bot[0].strategy;
        const isWin = Math.random() > 0.4; // 60% win rate
        
        // Calculate profit based on strategy and capital
        let profitPct = 0;
        switch(strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random() * 1.5) : -(0.3 + Math.random() * 0.8); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 5) : -(1 + Math.random() * 3); break;
          case 'arbitrage': profitPct = isWin ? (0.3 + Math.random() * 0.8) : -(0.1 + Math.random() * 0.4); break;
          case 'grid': profitPct = isWin ? (1 + Math.random() * 2) : -(0.5 + Math.random() * 1); break;
          case 'dca': profitPct = isWin ? (1.5 + Math.random() * 3) : -(0.8 + Math.random() * 2); break;
          case 'momentum': profitPct = isWin ? (3 + Math.random() * 7) : -(2 + Math.random() * 5); break;
        }

        const capital = subscription.capital_allocated || 1000;
        const profit = (capital * profitPct) / 100;
        const price = 20000 + Math.random() * 10000;

        // Create trade
        await base44.entities.Trade.create({
          subscription_id: subscription.id,
          symbol: 'BTC/USD',
          side: isWin ? 'BUY' : 'SELL',
          quantity: capital / price,
          price: price,
          total_value: capital,
          fee: capital * 0.001,
          profit_loss: profit,
          entry_price: price,
          exit_price: price * (1 + profitPct / 100),
          execution_mode: 'SIM',
          strategy_used: strategy,
          timestamp: new Date().toISOString()
        });

        // Update subscription
        const newProfit = currentProfit + profit;
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
  }, [subscription, isRunning, currentProfit, queryClient]);

  return {
    isRunning,
    setIsRunning,
    elapsedSeconds,
    currentProfit
  };
}