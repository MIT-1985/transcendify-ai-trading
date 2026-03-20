import { assertEquals, assertExists, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.test('Bot Code Generator - RSI Strategy', async () => {
  const config = {
    strategy: 'rsi',
    symbol: 'BTC/USDT',
    timeframe: '5m',
    exchange: 'binance',
    positionSize: 0.01,
    stopLoss: 0.02,
    takeProfit: 0.04,
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    demo: true
  };

  const response = await fetch('http://localhost:8000/generateBotCode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    },
    body: JSON.stringify({ strategy: 'rsi', config })
  });

  const data = await response.json();
  
  assertEquals(data.success, true);
  assertExists(data.artifact);
  assertExists(data.artifact.files['bot.py']);
  assertExists(data.artifact.files['requirements.txt']);
  assertExists(data.artifact.files['README.md']);
  
  // Check code contains expected elements
  const botCode = data.artifact.files['bot.py'];
  assertStringIncludes(botCode, 'class RSITradingBot');
  assertStringIncludes(botCode, 'calculate_rsi');
  assertStringIncludes(botCode, 'BTC/USDT');
  assertStringIncludes(botCode, 'rsi_period = 14');
  
  // Check safety - should not contain dangerous functions
  assertEquals(botCode.includes('eval('), false);
  assertEquals(botCode.includes('exec('), false);
  
  // Validation checks
  assertEquals(data.artifact.validation.passed, true);
  assertEquals(data.artifact.validation.sandboxed, true);
});

Deno.test('Bot Code Generator - Invalid Config', async () => {
  const config = {
    strategy: 'rsi',
    positionSize: 5.0, // Invalid - too high
    stopLoss: -0.1 // Invalid - negative
  };

  const response = await fetch('http://localhost:8000/generateBotCode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    },
    body: JSON.stringify({ strategy: 'rsi', config })
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Validation failed');
  assertExists(data.details);
});

Deno.test('Bot Code Generator - MACD Strategy', async () => {
  const config = {
    strategy: 'macd',
    symbol: 'ETH/USDT',
    timeframe: '1h',
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9
  };

  const response = await fetch('http://localhost:8000/generateBotCode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    },
    body: JSON.stringify({ strategy: 'macd', config })
  });

  const data = await response.json();
  
  assertEquals(data.success, true);
  const botCode = data.artifact.files['bot.py'];
  assertStringIncludes(botCode, 'class MACDTradingBot');
  assertStringIncludes(botCode, 'calculate_macd');
  assertStringIncludes(botCode, 'ETH/USDT');
});

Deno.test('Bot Code Generator - Code Injection Prevention', async () => {
  const config = {
    strategy: 'rsi',
    symbol: 'BTC/USDT; import os; os.system("rm -rf /")', // Injection attempt
    demo: true
  };

  const response = await fetch('http://localhost:8000/generateBotCode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    },
    body: JSON.stringify({ strategy: 'rsi', config })
  });

  const data = await response.json();
  const botCode = data.artifact.files['bot.py'];
  
  // Should NOT contain raw OS commands
  assertEquals(botCode.includes('os.system'), false);
  assertEquals(botCode.includes('rm -rf'), false);
});