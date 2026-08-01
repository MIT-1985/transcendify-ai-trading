import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { buildMicroSignal } from '../../shared/microMarketData.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, data } = await req.json();

    switch (action) {
      // ── Micro real-trade signal: OKX 1s candles + tick (ms) + Polygon macro,
      //    fed to the LLM for a real BUY/SELL/WAIT decision + TP/SL sizing.
      case 'micro_real_signal': {
        const instId = (data && data.instId) || 'BTC-USDT';
        const capitalUSDT = (data && data.capitalUSDT) || 15;
        const polyKey = Deno.env.get('POLYGON_API_KEY');

        const micro = await buildMicroSignal(instId, polyKey);

        if (!micro.ready) {
          return Response.json({
            success: false,
            instId,
            reason: micro.reason,
            micro,
          });
        }

        const prompt = `You are a micro-scalping crypto trader deciding a REAL BTC-USDT trade RIGHT NOW using sub-second data.

Pair: ${instId}
Composite score (0-100): ${micro.compositeScore}
Micro tick direction (ms): ${micro.micro.tickDirection}
Micro buy pressure %: ${micro.micro.buyPressurePercent}
Micro momentum % (tick drift): ${micro.micro.microMomentumPct}
1s momentum (last 10s): ${micro.momentum10s}%
1s volume momentum %: ${micro.volumeMomentum}
EMA9 vs EMA21: ${micro.emaFast} / ${micro.emaSlow} (${micro.emaFast > micro.emaSlow ? 'bullish' : 'bearish'})
RSI(14): ${micro.rsi}
Spread %: ${micro.spreadPct}
Last price: ${micro.lastPrice}
Polygon daily macro direction: ${micro.polygonMacro.dailyDirection}
Polygon minute momentum %: ${micro.polygonMacro.minuteMomentum}
Polygon macro confirmed: ${micro.polygonMacro.macroConfirmed}
Capital per trade: ${capitalUSDT} USDT
Taker fee: 0.1% each side

Decide NOW (this is real money, fees matter):
1. action: "BUY" | "SELL" | "WAIT"
2. take_profit_percent (realistic after 0.2% round-trip fees)
3. stop_loss_percent (1:2 risk/reward)
4. confidence (0-100)
5. one-line reasoning

Be conservative — WAIT unless micro tick + intraday + macro all align.`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              take_profit_percent: { type: 'number' },
              stop_loss_percent: { type: 'number' },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
            },
          },
        });

        return Response.json({
          success: true,
          instId,
          source: micro.source,
          micro,
          aiDecision: response,
        });
      }

      case 'optimize_parameters': {
        const { symbol, strategy, capital, historical_data } = data;
        
        const prompt = `You are an expert crypto trading analyst. Analyze the following:

Trading Pair: ${symbol}
Strategy Type: ${strategy}
Capital Allocated: $${capital}
Recent Market Data: ${JSON.stringify(historical_data?.slice(-20) || [])}

Based on current market conditions and historical performance:

1. Recommend optimal strategy parameters:
   - Stop Loss percentage (balance risk vs opportunity)
   - Take Profit percentage (realistic targets)
   - For Grid strategy: optimal grid levels and spacing
   - For DCA strategy: optimal interval and amount
   - For Momentum strategy: optimal period and threshold

2. Assess current market volatility and trend direction

3. Provide risk assessment and expected win rate

Provide data-driven, specific numerical recommendations.`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              recommended_parameters: {
                type: 'object',
                properties: {
                  stop_loss: { type: 'number' },
                  take_profit: { type: 'number' },
                  grid_levels: { type: 'number' },
                  grid_spacing: { type: 'number' },
                  dca_interval: { type: 'number' },
                  dca_amount: { type: 'number' },
                  momentum_period: { type: 'number' },
                  momentum_threshold: { type: 'number' }
                }
              },
              market_analysis: {
                type: 'object',
                properties: {
                  volatility: { type: 'string' },
                  trend: { type: 'string' },
                  confidence: { type: 'number' }
                }
              },
              risk_assessment: {
                type: 'object',
                properties: {
                  risk_level: { type: 'string' },
                  expected_win_rate: { type: 'number' },
                  reasoning: { type: 'string' }
                }
              }
            }
          }
        });

        return Response.json({ success: true, data: response });
      }

      case 'analyze_performance': {
        const { trades, strategy, symbol } = data;
        
        const winningTrades = trades.filter(t => t.profit_loss > 0);
        const losingTrades = trades.filter(t => t.profit_loss < 0);
        const totalProfit = trades.reduce((sum, t) => sum + t.profit_loss, 0);
        
        const prompt = `Analyze this trading bot performance:

Strategy: ${strategy}
Trading Pair: ${symbol}
Total Trades: ${trades.length}
Winning Trades: ${winningTrades.length}
Losing Trades: ${losingTrades.length}
Total Profit/Loss: $${totalProfit.toFixed(2)}
Win Rate: ${((winningTrades.length / trades.length) * 100).toFixed(1)}%

Recent Trades Sample: ${JSON.stringify(trades.slice(-10))}

Provide:
1. Key insights on why the bot is winning or losing
2. Specific recommendations for parameter adjustments
3. Warning signs or positive patterns identified
4. Expected performance over next 7 days based on current market conditions`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              performance_insights: {
                type: 'object',
                properties: {
                  win_reasons: { type: 'array', items: { type: 'string' } },
                  loss_reasons: { type: 'array', items: { type: 'string' } },
                  patterns_detected: { type: 'array', items: { type: 'string' } }
                }
              },
              recommendations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    parameter: { type: 'string' },
                    current_value: { type: 'string' },
                    recommended_value: { type: 'string' },
                    reasoning: { type: 'string' }
                  }
                }
              },
              forecast: {
                type: 'object',
                properties: {
                  expected_7day_return: { type: 'number' },
                  confidence_level: { type: 'string' },
                  key_risks: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        });

        return Response.json({ success: true, data: response });
      }

      case 'suggest_strategy': {
        const { symbol, capital, risk_tolerance } = data;
        
        const prompt = `As a crypto trading expert, recommend the best trading strategy:

Trading Pair: ${symbol}
Available Capital: $${capital}
Risk Tolerance: ${risk_tolerance}

Analyze current market conditions for ${symbol} and recommend:
1. The most suitable strategy type (scalping, swing, grid, DCA, momentum, arbitrage)
2. Why this strategy is optimal right now
3. Specific parameter recommendations
4. Expected returns and risks
5. Alternative strategies if market conditions change

Use real-time market data to make data-driven recommendations.`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt: prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              recommended_strategy: {
                type: 'object',
                properties: {
                  strategy_type: { type: 'string' },
                  reasoning: { type: 'string' },
                  market_conditions: { type: 'string' },
                  confidence: { type: 'number' }
                }
              },
              parameters: {
                type: 'object',
                properties: {
                  stop_loss: { type: 'number' },
                  take_profit: { type: 'number' },
                  position_size: { type: 'number' },
                  additional_settings: { type: 'object' }
                }
              },
              expected_performance: {
                type: 'object',
                properties: {
                  estimated_monthly_return: { type: 'number' },
                  risk_level: { type: 'string' },
                  win_rate: { type: 'number' }
                }
              },
              alternatives: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    strategy: { type: 'string' },
                    when_to_use: { type: 'string' }
                  }
                }
              }
            }
          }
        });

        return Response.json({ success: true, data: response });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});