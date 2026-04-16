import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

export function useBotEngine(subscription, vipLevel = 'none') {
  const [isRunning, setIsRunning] = useState(subscription?.status === 'active');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentProfit, setCurrentProfit] = useState(subscription?.total_profit || 0);
  const [lastTradeTime, setLastTradeTime] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!subscription || subscription.status !== 'active') return;
    if (!isRunning) setIsRunning(true);

    let binanceConnected = false;
    let okxConnected = false;

    const checkConnections = async () => {
      try {
        const res = await base44.functions.invoke('binanceConnect', { action: 'status' });
        binanceConnected = res.data?.connected === true;
      } catch (e) {
        binanceConnected = false;
      }
      try {
        const connections = await base44.entities.ExchangeConnection.filter({ exchange: 'okx', status: 'connected' });
        okxConnected = connections.length > 0;
      } catch (e) {
        okxConnected = false;
      }
    };

    checkConnections();

    const interval = setInterval(async () => {
      setElapsedSeconds(function(prev) { return prev + 1; });

      const now = Date.now();
      if (now - lastTradeTime < 3000) return;

      try {
        const bots = await base44.entities.TradingBot.filter({ id: subscription.bot_id });
        const bot = bots[0];
        if (!bot) return;

        const tradingPairs = subscription.trading_pairs || ['X:BTCUSD'];
        const strategy = bot.strategy;
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const capital = subscription.capital_allocated || 100;
        const positionSize = capital * 0.25;

        let currentPrice = 90000;
        try {
          const priceData = await base44.functions.invoke('polygonMarketData', { action: 'ticker', symbol: symbol });
          currentPrice = priceData.data?.data?.results?.[0]?.c || 90000;
        } catch (priceErr) {
          console.log('[BOT] Using fallback price');
        }

        const isBuy = Math.random() > 0.5;
        const quantity = Number((positionSize / currentPrice).toFixed(8));

        // OKX live trading
        if (okxConnected && subscription.exchange === 'okx') {
          try {
            const dcaAmount = subscription.dca_amount || 10;
            // Convert symbol from BTC-USDT format (OKX uses BTC-USDT)
            const okxSymbol = symbol.replace('/', '-').replace('X:', '').replace('USD', 'USDT');
            // For DCA strategy, always BUY at market price
            const result = await base44.functions.invoke('okxConnect', {
              action: 'trade',
              instId: okxSymbol,
              side: 'buy',
              ordType: 'market',
              sz: String(dcaAmount) // USDT amount for market buy
            });
            if (result.data?.success) {
              const newTrades = (subscription.total_trades || 0) + 1;
              await base44.entities.UserSubscription.update(subscription.id, {
                total_trades: newTrades
              });
              setLastTradeTime(now);
              setTimeout(function() {
                queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
              }, 2000);
            } else {
              console.error('[OKX BOT]', result.data?.error);
            }
          } catch (okxErr) {
            console.error('[OKX BOT ERROR]', okxErr.message);
          }
          return;
        }

        // Binance live trading
        if (binanceConnected) {
          try {
            const side = isBuy ? 'BUY' : 'SELL';
            const result = await base44.functions.invoke('binanceTradeWorker', {
              action: 'placeOrder',
              symbol: symbol,
              side: side,
              quantity: positionSize,
              type: 'MARKET',
              subscription_id: subscription.id
            });
            if (result.data && result.data.success) {
              const realProfit = side === 'SELL' ? (result.data.quoteQty - positionSize) : 0;
              const newProfit = currentProfit + realProfit;
              await base44.entities.UserSubscription.update(subscription.id, {
                total_profit: newProfit,
                total_trades: (subscription.total_trades || 0) + 1
              });
              setCurrentProfit(newProfit);
              setLastTradeTime(now);
              setTimeout(function() {
                queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
                queryClient.invalidateQueries({ queryKey: ['trades'] });
              }, 3000);
            }
          } catch (liveErr) {
            console.error('[BOT LIVE ERROR]', liveErr.message);
          }
          return;
        }

        // Simulation mode
        if (!quantity || quantity <= 0) return;

        const isWin = Math.random() > 0.3;
        let profitPct = 0;
        if (strategy === 'scalping') {
          profitPct = isWin ? (0.5 + Math.random()) : -(0.3 + Math.random() * 0.5);
        } else if (strategy === 'swing') {
          profitPct = isWin ? (2 + Math.random() * 3) : -(1 + Math.random() * 2);
        } else {
          profitPct = isWin ? (1 + Math.random()) : -(0.5 + Math.random());
        }

        const stopLoss = subscription.stop_loss || 5;
        const takeProfit = subscription.take_profit || 10;
        if (profitPct < 0 && Math.abs(profitPct) > stopLoss) profitPct = -stopLoss;
        if (profitPct > 0 && profitPct > takeProfit) profitPct = takeProfit;

        const fee = positionSize * 0.001;
        let profit = (positionSize * profitPct) / 100 - fee;

        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));

        setLastTradeTime(now);

        await base44.entities.Order.create({
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
          strategy_used: strategy,
          timestamp: new Date().toISOString()
        });

        const newProfit = currentProfit + profit;
        await base44.entities.UserSubscription.update(subscription.id, {
          total_profit: newProfit,
          total_trades: (subscription.total_trades || 0) + 1
        });

        setCurrentProfit(newProfit);
        setTimeout(function() {
          queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
          queryClient.invalidateQueries({ queryKey: ['trades'] });
        }, 3000);

      } catch (error) {
        if (error.message && error.message.includes('Rate limit')) {
          setLastTradeTime(Date.now() + 5000);
        } else {
          console.error('[BOT ERROR]', error.message);
        }
      }
    }, 5000);

    return function() { clearInterval(interval); };
  }, [subscription, isRunning, currentProfit, queryClient, vipLevel]);

  return {
    isRunning: isRunning,
    setIsRunning: setIsRunning,
    elapsedSeconds: elapsedSeconds,
    currentProfit: currentProfit
  };
}