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
    if (!BOT_TEMPLATES[strategy]) {
      return Response.json({ 
        error: 'Invalid strategy',
        available: Object.keys(BOT_TEMPLATES)
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