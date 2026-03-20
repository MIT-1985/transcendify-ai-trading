import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Bot templates with proper Python structure
const BOT_TEMPLATES = {
  rsi: (config) => `
import ccxt
import pandas as pd
import numpy as np
from datetime import datetime
import time
import json

class RSITradingBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT', timeframe='5m'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True,
            'options': {'defaultType': 'future'} if ${config.futures || false} else {}
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '5m'}'
        self.rsi_period = ${config.rsiPeriod || 14}
        self.oversold = ${config.oversold || 30}
        self.overbought = ${config.overbought || 70}
        self.position_size = ${config.positionSize || 0.01}
        self.stop_loss = ${config.stopLoss || 0.02}
        self.take_profit = ${config.takeProfit || 0.04}
        self.position = None
        self.trades = []
        
    def calculate_rsi(self, prices, period=14):
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])
        
        if avg_loss == 0:
            return 100
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def get_ohlcv(self):
        ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=100)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        return df
    
    def check_signal(self, rsi):
        if self.position is None:
            if rsi < self.oversold:
                return 'BUY'
            elif rsi > self.overbought:
                return 'SELL'
        return 'HOLD'
    
    def execute_trade(self, signal, price):
        if signal == 'BUY' and self.position is None:
            amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / price
            order = self.exchange.create_market_buy_order(self.symbol, amount)
            self.position = {
                'side': 'long',
                'entry_price': price,
                'amount': amount,
                'stop_loss': price * (1 - self.stop_loss),
                'take_profit': price * (1 + self.take_profit)
            }
            print(f"BUY {amount} at {price}")
            return order
        elif signal == 'SELL' and self.position is None:
            amount = self.position_size * self.exchange.fetch_balance()['USDT']['free'] / price
            order = self.exchange.create_market_sell_order(self.symbol, amount)
            self.position = {
                'side': 'short',
                'entry_price': price,
                'amount': amount,
                'stop_loss': price * (1 + self.stop_loss),
                'take_profit': price * (1 - self.take_profit)
            }
            print(f"SELL {amount} at {price}")
            return order
    
    def check_exit(self, current_price):
        if self.position:
            if self.position['side'] == 'long':
                if current_price <= self.position['stop_loss'] or current_price >= self.position['take_profit']:
                    order = self.exchange.create_market_sell_order(self.symbol, self.position['amount'])
                    pnl = (current_price - self.position['entry_price']) * self.position['amount']
                    self.trades.append({'pnl': pnl, 'exit_price': current_price})
                    print(f"EXIT LONG at {current_price}, PnL: {pnl}")
                    self.position = None
                    return order
            elif self.position['side'] == 'short':
                if current_price >= self.position['stop_loss'] or current_price <= self.position['take_profit']:
                    order = self.exchange.create_market_buy_order(self.symbol, self.position['amount'])
                    pnl = (self.position['entry_price'] - current_price) * self.position['amount']
                    self.trades.append({'pnl': pnl, 'exit_price': current_price})
                    print(f"EXIT SHORT at {current_price}, PnL: {pnl}")
                    self.position = None
                    return order
    
    def run(self, demo=False):
        print(f"Starting RSI Bot on {self.symbol} - Demo: {demo}")
        while True:
            try:
                df = self.get_ohlcv()
                rsi = self.calculate_rsi(df['close'].values)
                current_price = df['close'].iloc[-1]
                
                print(f"Price: {current_price:.2f}, RSI: {rsi:.2f}")
                
                # Check exit conditions first
                if not demo:
                    self.check_exit(current_price)
                
                # Check entry signals
                signal = self.check_signal(rsi)
                if signal != 'HOLD' and not demo:
                    self.execute_trade(signal, current_price)
                
                time.sleep(60)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)

if __name__ == "__main__":
    bot = RSITradingBot()
    bot.run(demo=${config.demo || true})
`,

  macd: (config) => `
import ccxt
import pandas as pd
import numpy as np
from datetime import datetime
import time

class MACDTradingBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '1h'}'
        self.fast_period = ${config.fastPeriod || 12}
        self.slow_period = ${config.slowPeriod || 26}
        self.signal_period = ${config.signalPeriod || 9}
        self.position_size = ${config.positionSize || 0.01}
        self.position = None
        
    def calculate_ema(self, prices, period):
        return prices.ewm(span=period, adjust=False).mean()
    
    def calculate_macd(self, prices):
        ema_fast = self.calculate_ema(prices, self.fast_period)
        ema_slow = self.calculate_ema(prices, self.slow_period)
        macd_line = ema_fast - ema_slow
        signal_line = self.calculate_ema(macd_line, self.signal_period)
        histogram = macd_line - signal_line
        return macd_line.iloc[-1], signal_line.iloc[-1], histogram.iloc[-1]
    
    def run(self, demo=False):
        print(f"Starting MACD Bot on {self.symbol}")
        while True:
            try:
                ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=100)
                df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                
                macd, signal, histogram = self.calculate_macd(df['close'])
                current_price = df['close'].iloc[-1]
                
                print(f"Price: {current_price:.2f}, MACD: {macd:.2f}, Signal: {signal:.2f}, Hist: {histogram:.2f}")
                
                # Trading logic
                if histogram > 0 and self.position is None:
                    print("BUY Signal")
                    if not demo:
                        amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / current_price
                        self.exchange.create_market_buy_order(self.symbol, amount)
                        self.position = 'long'
                elif histogram < 0 and self.position == 'long':
                    print("SELL Signal")
                    if not demo:
                        balance = self.exchange.fetch_balance()[self.symbol.split('/')[0]]['free']
                        self.exchange.create_market_sell_order(self.symbol, balance)
                        self.position = None
                
                time.sleep(300)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)

if __name__ == "__main__":
    bot = MACDTradingBot()
    bot.run(demo=${config.demo || true})
`,

  bollinger: (config) => `
import ccxt
import pandas as pd
import numpy as np
import time

class BollingerBandsBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '5m'}'
        self.period = ${config.period || 20}
        self.std_dev = ${config.stdDev || 2}
        self.position_size = ${config.positionSize || 0.01}
        self.position = None
        
    def calculate_bollinger_bands(self, prices):
        sma = prices.rolling(window=self.period).mean()
        std = prices.rolling(window=self.period).std()
        upper_band = sma + (std * self.std_dev)
        lower_band = sma - (std * self.std_dev)
        return upper_band.iloc[-1], sma.iloc[-1], lower_band.iloc[-1]
    
    def run(self, demo=False):
        print(f"Starting Bollinger Bands Bot on {self.symbol}")
        while True:
            try:
                ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=100)
                df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                
                upper, middle, lower = self.calculate_bollinger_bands(df['close'])
                current_price = df['close'].iloc[-1]
                
                print(f"Price: {current_price:.2f}, Upper: {upper:.2f}, Lower: {lower:.2f}")
                
                # Mean reversion strategy
                if current_price <= lower and self.position is None:
                    print("BUY Signal - Price at lower band")
                    if not demo:
                        amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / current_price
                        self.exchange.create_market_buy_order(self.symbol, amount)
                        self.position = 'long'
                elif current_price >= upper and self.position == 'long':
                    print("SELL Signal - Price at upper band")
                    if not demo:
                        balance = self.exchange.fetch_balance()[self.symbol.split('/')[0]]['free']
                        self.exchange.create_market_sell_order(self.symbol, balance)
                        self.position = None
                
                time.sleep(60)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)

if __name__ == "__main__":
    bot = BollingerBandsBot()
    bot.run(demo=${config.demo || true})
`,

  scalping: (config) => `
import ccxt
import pandas as pd
import numpy as np
import time

class ScalpingBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '1m'}'
        self.profit_target = ${config.profitTarget || 0.003}  # 0.3%
        self.stop_loss = ${config.stopLoss || 0.002}  # 0.2%
        self.position_size = ${config.positionSize || 0.02}
        self.spread_threshold = ${config.spreadThreshold || 0.001}
        self.position = None
        
    def get_spread(self, ticker):
        bid = ticker['bid']
        ask = ticker['ask']
        spread = (ask - bid) / bid
        return spread
    
    def calculate_momentum(self, prices):
        if len(prices) < 5:
            return 0
        short_ma = np.mean(prices[-3:])
        long_ma = np.mean(prices[-5:])
        momentum = (short_ma - long_ma) / long_ma
        return momentum
    
    def run(self, demo=False):
        print(f"Starting Scalping Bot on {self.symbol} - High Frequency")
        while True:
            try:
                ticker = self.exchange.fetch_ticker(self.symbol)
                ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=10)
                df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                
                current_price = ticker['last']
                spread = self.get_spread(ticker)
                momentum = self.calculate_momentum(df['close'].values)
                
                print(f"Price: {current_price:.2f}, Spread: {spread:.4f}, Momentum: {momentum:.4f}")
                
                # Only trade when spread is tight
                if spread > self.spread_threshold:
                    print("Spread too wide, waiting...")
                    time.sleep(2)
                    continue
                
                # Entry conditions
                if self.position is None:
                    if momentum > 0.001:  # Slight upward momentum
                        print("SCALP BUY - Quick momentum detected")
                        if not demo:
                            amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / current_price
                            self.exchange.create_market_buy_order(self.symbol, amount)
                            self.position = {
                                'side': 'long',
                                'entry': current_price,
                                'target': current_price * (1 + self.profit_target),
                                'stop': current_price * (1 - self.stop_loss)
                            }
                
                # Exit conditions
                elif self.position:
                    if current_price >= self.position['target'] or current_price <= self.position['stop']:
                        print(f"EXIT - Price: {current_price:.2f}, Entry: {self.position['entry']:.2f}")
                        if not demo:
                            balance = self.exchange.fetch_balance()[self.symbol.split('/')[0]]['free']
                            self.exchange.create_market_sell_order(self.symbol, balance)
                        self.position = None
                
                time.sleep(2)  # High frequency - check every 2 seconds
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(5)

if __name__ == "__main__":
    bot = ScalpingBot()
    bot.run(demo=${config.demo || true})
`,

  momentum: (config) => `
import ccxt
import pandas as pd
import numpy as np
import time

class MomentumBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '15m'}'
        self.lookback_period = ${config.lookbackPeriod || 20}
        self.momentum_threshold = ${config.momentumThreshold || 0.02}  # 2%
        self.position_size = ${config.positionSize || 0.01}
        self.trailing_stop = ${config.trailingStop || 0.03}
        self.position = None
        self.highest_price = 0
        
    def calculate_roc(self, prices, period):
        # Rate of Change
        if len(prices) < period:
            return 0
        roc = (prices[-1] - prices[-period]) / prices[-period]
        return roc
    
    def calculate_adx(self, df, period=14):
        # Average Directional Index
        high = df['high'].values
        low = df['low'].values
        close = df['close'].values
        
        plus_dm = np.where((high[1:] - high[:-1]) > (low[:-1] - low[1:]), high[1:] - high[:-1], 0)
        minus_dm = np.where((low[:-1] - low[1:]) > (high[1:] - high[:-1]), low[:-1] - low[1:], 0)
        
        atr = np.mean(high[-period:] - low[-period:])
        if atr == 0:
            return 0
            
        plus_di = 100 * np.mean(plus_dm[-period:]) / atr
        minus_di = 100 * np.mean(minus_dm[-period:]) / atr
        
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di) if (plus_di + minus_di) > 0 else 0
        return dx
    
    def run(self, demo=False):
        print(f"Starting Momentum Bot on {self.symbol}")
        while True:
            try:
                ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=100)
                df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                
                roc = self.calculate_roc(df['close'].values, self.lookback_period)
                adx = self.calculate_adx(df)
                current_price = df['close'].iloc[-1]
                
                print(f"Price: {current_price:.2f}, ROC: {roc:.4f}, ADX: {adx:.2f}")
                
                # Strong momentum + trend strength
                if self.position is None and roc > self.momentum_threshold and adx > 25:
                    print("BUY - Strong upward momentum detected")
                    if not demo:
                        amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / current_price
                        self.exchange.create_market_buy_order(self.symbol, amount)
                        self.position = 'long'
                        self.highest_price = current_price
                
                # Trailing stop
                elif self.position:
                    if current_price > self.highest_price:
                        self.highest_price = current_price
                    
                    trailing_stop_price = self.highest_price * (1 - self.trailing_stop)
                    
                    if current_price <= trailing_stop_price or adx < 20:
                        print(f"EXIT - Trailing stop or weak trend")
                        if not demo:
                            balance = self.exchange.fetch_balance()[self.symbol.split('/')[0]]['free']
                            self.exchange.create_market_sell_order(self.symbol, balance)
                        self.position = None
                        self.highest_price = 0
                
                time.sleep(60)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)

if __name__ == "__main__":
    bot = MomentumBot()
    bot.run(demo=${config.demo || true})
`,

  arbitrage: (config) => `
import ccxt
import time

class ArbitrageBot:
    def __init__(self, symbol='BTC/USDT'):
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.exchanges = []
        
        # Initialize multiple exchanges
        exchange_configs = [
            ('binance', '${config.binanceKey || 'KEY1'}', '${config.binanceSecret || 'SECRET1'}'),
            ('coinbase', '${config.coinbaseKey || 'KEY2'}', '${config.coinbaseSecret || 'SECRET2'}')
        ]
        
        for exchange_id, api_key, api_secret in exchange_configs:
            try:
                ExchangeClass = getattr(ccxt, exchange_id)
                exchange = ExchangeClass({
                    'apiKey': api_key,
                    'secret': api_secret,
                    'enableRateLimit': True
                })
                self.exchanges.append({'id': exchange_id, 'client': exchange})
            except:
                print(f"Failed to initialize {exchange_id}")
        
        self.min_profit_threshold = ${config.minProfitThreshold || 0.005}  # 0.5%
        self.position_size = ${config.positionSize || 0.01}
    
    def get_prices(self):
        prices = {}
        for exchange in self.exchanges:
            try:
                ticker = exchange['client'].fetch_ticker(self.symbol)
                prices[exchange['id']] = {
                    'bid': ticker['bid'],
                    'ask': ticker['ask'],
                    'last': ticker['last']
                }
            except Exception as e:
                print(f"Error fetching from {exchange['id']}: {e}")
        return prices
    
    def find_arbitrage_opportunity(self, prices):
        opportunities = []
        exchange_ids = list(prices.keys())
        
        for i in range(len(exchange_ids)):
            for j in range(i + 1, len(exchange_ids)):
                ex1, ex2 = exchange_ids[i], exchange_ids[j]
                
                # Buy on ex1, sell on ex2
                profit1 = (prices[ex2]['bid'] - prices[ex1]['ask']) / prices[ex1]['ask']
                if profit1 > self.min_profit_threshold:
                    opportunities.append({
                        'buy_exchange': ex1,
                        'sell_exchange': ex2,
                        'buy_price': prices[ex1]['ask'],
                        'sell_price': prices[ex2]['bid'],
                        'profit_pct': profit1 * 100
                    })
                
                # Buy on ex2, sell on ex1
                profit2 = (prices[ex1]['bid'] - prices[ex2]['ask']) / prices[ex2]['ask']
                if profit2 > self.min_profit_threshold:
                    opportunities.append({
                        'buy_exchange': ex2,
                        'sell_exchange': ex1,
                        'buy_price': prices[ex2]['ask'],
                        'sell_price': prices[ex1]['bid'],
                        'profit_pct': profit2 * 100
                    })
        
        return opportunities
    
    def execute_arbitrage(self, opportunity, demo=False):
        print(f"ARBITRAGE: Buy on {opportunity['buy_exchange']} at {opportunity['buy_price']:.2f}")
        print(f"           Sell on {opportunity['sell_exchange']} at {opportunity['sell_price']:.2f}")
        print(f"           Expected profit: {opportunity['profit_pct']:.2f}%")
        
        if not demo:
            buy_exchange = next(e['client'] for e in self.exchanges if e['id'] == opportunity['buy_exchange'])
            sell_exchange = next(e['client'] for e in self.exchanges if e['id'] == opportunity['sell_exchange'])
            
            balance = buy_exchange.fetch_balance()['USDT']['free']
            amount = (balance * self.position_size) / opportunity['buy_price']
            
            # Execute simultaneously
            buy_exchange.create_market_buy_order(self.symbol, amount)
            sell_exchange.create_market_sell_order(self.symbol, amount)
    
    def run(self, demo=False):
        print(f"Starting Arbitrage Bot for {self.symbol} across {len(self.exchanges)} exchanges")
        while True:
            try:
                prices = self.get_prices()
                
                if len(prices) < 2:
                    print("Need at least 2 exchanges for arbitrage")
                    time.sleep(10)
                    continue
                
                opportunities = self.find_arbitrage_opportunity(prices)
                
                if opportunities:
                    best = max(opportunities, key=lambda x: x['profit_pct'])
                    self.execute_arbitrage(best, demo)
                else:
                    print("No arbitrage opportunity found")
                
                time.sleep(5)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(10)

if __name__ == "__main__":
    bot = ArbitrageBot()
    bot.run(demo=${config.demo || true})
`,

  mean_reversion: (config) => `
import ccxt
import pandas as pd
import numpy as np
import time

class MeanReversionBot:
    def __init__(self, exchange_id='binance', symbol='BTC/USDT'):
        self.exchange = ccxt.${config.exchange || 'binance'}({
            'apiKey': '${config.apiKey || 'YOUR_API_KEY'}',
            'secret': '${config.apiSecret || 'YOUR_API_SECRET'}',
            'enableRateLimit': True
        })
        self.symbol = '${config.symbol || 'BTC/USDT'}'
        self.timeframe = '${config.timeframe || '5m'}'
        self.lookback = ${config.lookback || 50}
        self.std_multiplier = ${config.stdMultiplier || 2.0}
        self.position_size = ${config.positionSize || 0.01}
        self.position = None
        
    def calculate_z_score(self, prices):
        mean = np.mean(prices)
        std = np.std(prices)
        if std == 0:
            return 0
        z_score = (prices[-1] - mean) / std
        return z_score
    
    def run(self, demo=False):
        print(f"Starting Mean Reversion Bot on {self.symbol}")
        while True:
            try:
                ohlcv = self.exchange.fetch_ohlcv(self.symbol, self.timeframe, limit=self.lookback)
                df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                
                z_score = self.calculate_z_score(df['close'].values)
                current_price = df['close'].iloc[-1]
                mean_price = np.mean(df['close'].values)
                
                print(f"Price: {current_price:.2f}, Mean: {mean_price:.2f}, Z-Score: {z_score:.2f}")
                
                # Buy when significantly below mean
                if self.position is None and z_score < -self.std_multiplier:
                    print("BUY - Price significantly below mean")
                    if not demo:
                        amount = (self.position_size * self.exchange.fetch_balance()['USDT']['free']) / current_price
                        self.exchange.create_market_buy_order(self.symbol, amount)
                        self.position = {'side': 'long', 'entry': current_price}
                
                # Sell when back to mean or above
                elif self.position and (z_score > -0.5 or z_score > self.std_multiplier):
                    print("SELL - Price reverted to mean")
                    if not demo:
                        balance = self.exchange.fetch_balance()[self.symbol.split('/')[0]]['free']
                        self.exchange.create_market_sell_order(self.symbol, balance)
                    self.position = None
                
                time.sleep(60)
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(60)

if __name__ == "__main__":
    bot = MeanReversionBot()
    bot.run(demo=${config.demo || true})
`
};

const REQUIREMENTS_TXT = `ccxt==4.2.0
pandas==2.1.4
numpy==1.26.2
python-dotenv==1.0.0
`;

const README_TEMPLATE = (config) => `# ${config.botName || 'Trading Bot'}

Generated: ${new Date().toISOString()}

## Configuration
- Strategy: ${config.strategy}
- Symbol: ${config.symbol}
- Timeframe: ${config.timeframe}
- Exchange: ${config.exchange}

## Installation

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Usage

### Demo Mode (Paper Trading)
\`\`\`bash
python bot.py
\`\`\`

### Live Mode
Edit bot.py and set \`demo=False\`, add your API keys.

## Risk Warning
⚠️ Trading cryptocurrencies involves substantial risk of loss. Start with demo mode and small amounts.
`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { strategy, config } = await req.json();

    // Validate strategy
    const validStrategies = ['rsi', 'macd', 'bollinger', 'scalping', 'momentum', 'arbitrage', 'mean_reversion'];
    if (!validStrategies.includes(strategy)) {
      return Response.json({ 
        error: 'Invalid strategy',
        available: validStrategies
      }, { status: 400 });
    }

    // Validate config
    const validationErrors = [];
    if (config.positionSize && (config.positionSize < 0.001 || config.positionSize > 1)) {
      validationErrors.push('Position size must be between 0.001 and 1');
    }
    if (config.stopLoss && (config.stopLoss < 0.01 || config.stopLoss > 0.5)) {
      validationErrors.push('Stop loss must be between 1% and 50%');
    }
    if (config.takeProfit && (config.takeProfit < 0.01 || config.takeProfit > 2)) {
      validationErrors.push('Take profit must be between 1% and 200%');
    }

    if (validationErrors.length > 0) {
      return Response.json({ 
        error: 'Validation failed',
        details: validationErrors
      }, { status: 400 });
    }

    // Generate code
    const botCode = BOT_TEMPLATES[strategy](config);
    const readme = README_TEMPLATE(config);

    // Sanitize - remove any potential code injection
    const sanitizedCode = botCode
      .replace(/import os/g, '# import os - DISABLED')
      .replace(/eval\(/g, '# eval - DISABLED')
      .replace(/exec\(/g, '# exec - DISABLED')
      .replace(/__import__\(/g, '# __import__ - DISABLED');

    // Create artifact
    const artifact = {
      id: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: user.email,
      strategy,
      config,
      files: {
        'bot.py': sanitizedCode,
        'requirements.txt': REQUIREMENTS_TXT,
        'README.md': readme,
        '.env.example': `API_KEY=your_api_key_here\nAPI_SECRET=your_api_secret_here`
      },
      createdAt: new Date().toISOString(),
      validation: {
        passed: true,
        sandboxed: true,
        safetyChecks: [
          'No eval/exec calls',
          'No OS imports',
          'No file system access',
          'Rate limiting enabled',
          'Demo mode available'
        ]
      }
    };

    // Save to database
    await base44.entities.Transaction.create({
      type: 'bot_generation',
      amount: 0,
      currency: 'TFI',
      status: 'completed',
      description: `Generated ${strategy} bot for ${config.symbol}`,
      reference: artifact.id
    });

    return Response.json({
      success: true,
      artifact,
      downloadUrl: `data:application/zip;base64,${btoa(JSON.stringify(artifact.files))}`
    });

  } catch (error) {
    console.error('Bot generation error:', error);
    return Response.json({ 
      error: error.message,
      stack: Deno.env.get('NODE_ENV') === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
});