import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { AILearningEngine } from './AILearningEngine';
import { ConstantsService } from './ConstantsService';

export function useBotEngine(subscription, vipLevel = 'none') {
  const [isRunning, setIsRunning] = useState(subscription?.status === 'active');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(subscription?.total_profit || 0);
  const [lastTradeTime, setLastTradeTime] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!subscription || subscription.status !== 'active') return;
    if (!isRunning) setIsRunning(true);

    // Check if user has real Binance connection
    let binanceConnected = false;
    const checkBinance = async () => {
      try {
        const res = await base44.functions.invoke('binanceConnect', { action: 'status' });
        binanceConnected = res.data?.connected === true;
        console.log(`[BOT ${subscription.id}] Binance live mode: ${binanceConnected}`);
      } catch (e) {
        binanceConnected = false;
      }
    };

    // Initialize AI learning and TROK constants
    const initLearning = async () => {
      try {
        const trades = await base44.entities.Trade.filter({ subscription_id: subscription.id });
        const learningEngine = new AILearningEngine(subscription, trades);
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (bot[0]) {
          await ConstantsService.getOptimizationConstants(bot[0].strategy);
        }
        if (trades.length > 0 && trades.length % 50 === 0) {
          const result = await learningEngine.applyLearning();
          if (result.success) queryClient.invalidateQueries({ queryKey: ['subscription', subscription.id] });
        }
      } catch (e) {
        console.log('[BOT] Learning init error:', e.message);
      }
    };

    checkBinance();
    initLearning();

    const interval = setInterval(async () => {
      setElapsedSeconds(prev => prev + 1);

      const now = Date.now();
      if (now - lastTradeTime < 3000) return;

      try {
        const bot = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        if (!bot[0]) return;

        const tradingPairs = subscription.trading_pairs || ['X:BTCUSD'];
        const strategy = bot[0].strategy;
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const capital = subscription.capital_allocated || 100;

        // Get real price from Polygon
        let currentPrice = 90000;
        try {
          const priceData = await base44.functions.invoke('polygonMarketData', { action: 'ticker', symbol });
          currentPrice = priceData.data?.data?.results?.[0]?.c || 90000;
        } catch (e) {
          console.log(`[BOT ${subscription.id}] Using fallback price`);
        }

        const isBuy = Math.random() > 0.5;
        const positionSize = Math.min(capital, capital * 0.25);
        const quantity = Number((positionSize / currentPrice).toFixed(8));

        // --- REAL TRADING via Binance if connected ---
        if (binanceConnected) {
          try {
            const side = isBuy ? 'BUY' : 'SELL';
            const result = await base44.functions.invoke('binanceTradeWorker', {
              action: 'placeOrder',
              symbol,
              side,
              quantity: positionSize, // quoteOrderQty in USDC for BUY, asset qty for SELL
              type: 'MARKET',
              subscription_id: subscription.id
            });
            if (result.data?.success) {
              console.log(`[BOT LIVE] ${side} on ${symbol} filled: ${result.data.executedQty} @ ${result.data.avgPrice}`);
              const realProfit = side === 'SELL' ? (result.data.quoteQty - positionSize) : 0;
              const newProfit = currentProfit + realProfit;
              await base44.entities.UserSubscription.update(subscription.id, {
                total_profit: newProfit,
                total_trades: (subscription.total_trades || 0) + 1
              });
              setCurrentProfit(newProfit);
              setLastTradeTime(now);
              setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
                queryClient.invalidateQueries({ queryKey: ['trades'] });
              }, 3000);
            } else {
              console.error(`[BOT LIVE] Order failed:`, result.data?.error);
            }
          } catch (liveErr) {
            console.error(`[BOT LIVE ERROR]`, liveErr.message);
          }
          return;
        }

        // --- SIMULATION MODE (no Binance connected) ---
        if (!quantity || quantity <= 0) return;

        const isWin = Math.random() > 0.3;
        let profitPct = 0;
        switch (strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random()) : -(0.3 + Math.random() * 0.5); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 3) : -(1 + Math.random() * 2); break;
          default: profitPct = isWin ? (1 + Math.random()) : -(0.5 + Math.random()); break;
        }

        const stopLoss = subscription.stop_loss || 5;
        const takeProfit = subscription.take_profit || 10;
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        let profit = (positionSize * profitPct) / 100;
        const fee = positionSize * 0.001;
        profit -= fee;

        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));

        setLastTradeTime(now);
        console.log(`[BOT SIM ${subscription.id}] ${isBuy ? 'BUY' : 'SELL'} $${profit.toFixed(2)}`);

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
          strategy_used: strategy,
          timestamp: new Date().toISOString()
        });

        const newProfit = currentProfit + profit;
        await base44.entities.UserSubscription.update(subscription.id, {
          total_profit: newProfit,
          total_trades: (subscription.total_trades || 0) + 1
        });

        setCurrentProfit(newProfit);
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
          queryClient.invalidateQueries({ queryKey: ['trades'] });
        }, 3000);

      } catch (error) {
        if (error.message.includes('Rate limit')) {
          console.log(`[BOT ${subscription.id}] Rate limited, waiting...`);
          setLastTradeTime(Date.now() + 5000);
        } else {
          console.error(`[BOT ${subscription.id}] ERROR:`, error.message);
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [subscription, isRunning, currentProfit, queryClient, vipLevel]);

  return {
    isRunning,
    setIsRunning,
    elapsedSeconds,
    currentProfit
  };
}