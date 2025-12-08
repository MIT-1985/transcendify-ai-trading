import { base44 } from '@/api/base44Client';

/**
 * AI Learning Engine for Trading Bots
 * Analyzes past trades and market trends to dynamically adjust bot strategies
 */

export class AILearningEngine {
  constructor(subscription, trades = []) {
    this.subscription = subscription;
    this.trades = trades;
    this.learningObjectives = subscription.learning_objectives || {
      maximize_profit: true,
      minimize_risk: true,
      optimize_winrate: true,
      adapt_to_volatility: true
    };
  }

  /**
   * Analyze past trades and learn from performance
   */
  async analyzePastPerformance() {
    if (this.trades.length < 10) {
      return { hasLearned: false, reason: 'Not enough trades for learning' };
    }

    const recentTrades = this.trades.slice(0, 50);
    const winningTrades = recentTrades.filter(t => t.profit_loss > 0);
    const losingTrades = recentTrades.filter(t => t.profit_loss <= 0);
    
    const winRate = winningTrades.length / recentTrades.length;
    const avgWin = winningTrades.reduce((sum, t) => sum + t.profit_loss, 0) / winningTrades.length || 0;
    const avgLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.profit_loss), 0) / losingTrades.length || 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Analyze market conditions during winning vs losing trades
    const winningMarketConditions = this.extractMarketConditions(winningTrades);
    const losingMarketConditions = this.extractMarketConditions(losingTrades);

    // Identify patterns
    const insights = {
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      optimalTimeOfDay: this.findOptimalTimeOfDay(winningTrades),
      optimalSymbols: this.findOptimalSymbols(recentTrades),
      riskMetrics: this.calculateRiskMetrics(recentTrades),
      volatilityAdaptation: this.analyzeVolatilityPerformance(recentTrades)
    };

    return {
      hasLearned: true,
      insights,
      recommendations: this.generateRecommendations(insights)
    };
  }

  /**
   * Extract market conditions from trades
   */
  extractMarketConditions(trades) {
    const conditions = {
      avgVolatility: 0,
      priceMovements: [],
      timeDistribution: {}
    };

    trades.forEach(trade => {
      // Extract volatility from strategy info
      const strategyInfo = trade.strategy_used || '';
      const hour = new Date(trade.timestamp).getHours();
      
      conditions.timeDistribution[hour] = (conditions.timeDistribution[hour] || 0) + 1;
      
      if (trade.entry_price && trade.exit_price) {
        const movement = Math.abs((trade.exit_price - trade.entry_price) / trade.entry_price) * 100;
        conditions.priceMovements.push(movement);
      }
    });

    conditions.avgVolatility = conditions.priceMovements.reduce((a, b) => a + b, 0) / conditions.priceMovements.length || 0;

    return conditions;
  }

  /**
   * Find optimal time of day for trading
   */
  findOptimalTimeOfDay(winningTrades) {
    const hourPerformance = {};
    
    winningTrades.forEach(trade => {
      const hour = new Date(trade.timestamp).getHours();
      if (!hourPerformance[hour]) {
        hourPerformance[hour] = { profit: 0, count: 0 };
      }
      hourPerformance[hour].profit += trade.profit_loss;
      hourPerformance[hour].count += 1;
    });

    // Find best performing hours
    const bestHours = Object.entries(hourPerformance)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgProfit: data.profit / data.count,
        tradeCount: data.count
      }))
      .sort((a, b) => b.avgProfit - a.avgProfit)
      .slice(0, 3);

    return bestHours;
  }

  /**
   * Find optimal trading symbols
   */
  findOptimalSymbols(trades) {
    const symbolPerformance = {};
    
    trades.forEach(trade => {
      if (!symbolPerformance[trade.symbol]) {
        symbolPerformance[trade.symbol] = { profit: 0, count: 0, wins: 0 };
      }
      symbolPerformance[trade.symbol].profit += trade.profit_loss;
      symbolPerformance[trade.symbol].count += 1;
      if (trade.profit_loss > 0) symbolPerformance[trade.symbol].wins += 1;
    });

    return Object.entries(symbolPerformance)
      .map(([symbol, data]) => ({
        symbol,
        totalProfit: data.profit,
        winRate: data.wins / data.count,
        tradeCount: data.count,
        avgProfit: data.profit / data.count
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit);
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(trades) {
    const returns = trades.map(t => t.profit_loss);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Calculate max drawdown
    let maxProfit = 0;
    let maxDrawdown = 0;
    let runningProfit = 0;

    trades.forEach(trade => {
      runningProfit += trade.profit_loss;
      maxProfit = Math.max(maxProfit, runningProfit);
      const drawdown = maxProfit - runningProfit;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    return {
      stdDev,
      maxDrawdown,
      sharpeRatio: stdDev > 0 ? mean / stdDev : 0,
      consistencyScore: 1 - (stdDev / Math.abs(mean) || 0)
    };
  }

  /**
   * Analyze performance under different volatility conditions
   */
  analyzeVolatilityPerformance(trades) {
    const lowVolatility = [];
    const mediumVolatility = [];
    const highVolatility = [];

    trades.forEach(trade => {
      if (trade.entry_price && trade.exit_price) {
        const volatility = Math.abs((trade.exit_price - trade.entry_price) / trade.entry_price) * 100;
        
        if (volatility < 1) lowVolatility.push(trade);
        else if (volatility < 3) mediumVolatility.push(trade);
        else highVolatility.push(trade);
      }
    });

    const analyzeGroup = (group) => {
      if (group.length === 0) return { profit: 0, winRate: 0, count: 0 };
      const wins = group.filter(t => t.profit_loss > 0).length;
      const profit = group.reduce((sum, t) => sum + t.profit_loss, 0);
      return { profit, winRate: wins / group.length, count: group.length };
    };

    return {
      low: analyzeGroup(lowVolatility),
      medium: analyzeGroup(mediumVolatility),
      high: analyzeGroup(highVolatility)
    };
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(insights) {
    const recommendations = {
      adjustedStopLoss: this.subscription.stop_loss,
      adjustedTakeProfit: this.subscription.take_profit,
      preferredSymbols: [],
      preferredHours: [],
      positionSizeAdjustment: 0,
      riskAdjustment: 'maintain',
      reasoning: []
    };

    // Adjust stop loss based on risk metrics
    if (this.learningObjectives.minimize_risk && insights.riskMetrics.maxDrawdown > this.subscription.capital_allocated * 0.05) {
      recommendations.adjustedStopLoss = Math.max(2, this.subscription.stop_loss * 0.8);
      recommendations.reasoning.push('Reduced stop loss to minimize drawdown risk');
    }

    // Adjust take profit based on win rate and profit factor
    if (this.learningObjectives.maximize_profit && insights.profitFactor > 1.5 && insights.winRate > 0.6) {
      recommendations.adjustedTakeProfit = this.subscription.take_profit * 1.2;
      recommendations.reasoning.push('Increased take profit due to strong performance');
    }

    // Recommend optimal symbols
    if (insights.optimalSymbols.length > 0) {
      recommendations.preferredSymbols = insights.optimalSymbols
        .filter(s => s.winRate > 0.55 && s.totalProfit > 0)
        .slice(0, 3)
        .map(s => s.symbol);
      if (recommendations.preferredSymbols.length > 0) {
        recommendations.reasoning.push(`Focus on ${recommendations.preferredSymbols.join(', ')} for better performance`);
      }
    }

    // Recommend optimal hours
    if (insights.optimalTimeOfDay.length > 0) {
      recommendations.preferredHours = insights.optimalTimeOfDay.map(h => h.hour);
      recommendations.reasoning.push(`Best trading hours: ${recommendations.preferredHours.join(', ')}:00`);
    }

    // Volatility adaptation
    if (this.learningObjectives.adapt_to_volatility) {
      const { low, medium, high } = insights.volatilityAdaptation;
      if (high.profit > medium.profit && high.profit > low.profit && high.count > 5) {
        recommendations.riskAdjustment = 'increase';
        recommendations.positionSizeAdjustment = 0.1;
        recommendations.reasoning.push('Bot performs better in high volatility - slightly increase position sizes');
      } else if (low.profit > medium.profit && low.count > 5) {
        recommendations.riskAdjustment = 'decrease';
        recommendations.positionSizeAdjustment = -0.1;
        recommendations.reasoning.push('Bot performs better in low volatility - reduce position sizes');
      }
    }

    // Win rate optimization
    if (this.learningObjectives.optimize_winrate && insights.winRate < 0.5) {
      recommendations.adjustedStopLoss = Math.max(2, this.subscription.stop_loss * 0.9);
      recommendations.adjustedTakeProfit = this.subscription.take_profit * 0.9;
      recommendations.reasoning.push('Tightened stop loss and take profit to improve win rate');
    }

    return recommendations;
  }

  /**
   * Apply learned adjustments to subscription
   */
  async applyLearning() {
    const analysis = await this.analyzePastPerformance();
    
    if (!analysis.hasLearned) {
      return { success: false, message: analysis.reason };
    }

    const { recommendations } = analysis;
    
    // Update subscription with new parameters
    const updates = {
      stop_loss: recommendations.adjustedStopLoss,
      take_profit: recommendations.adjustedTakeProfit
    };

    // Add preferred symbols if they exist
    if (recommendations.preferredSymbols.length > 0) {
      updates.trading_pairs = recommendations.preferredSymbols;
    }

    // Apply position size adjustment
    if (recommendations.positionSizeAdjustment !== 0) {
      const currentSize = this.subscription.max_position_size || 25;
      updates.max_position_size = Math.min(50, Math.max(10, currentSize + (currentSize * recommendations.positionSizeAdjustment)));
    }

    await base44.entities.UserSubscription.update(this.subscription.id, updates);

    return {
      success: true,
      message: 'AI learning applied successfully',
      recommendations,
      analysis: analysis.insights
    };
  }

  /**
   * Identify new trading opportunities based on learned patterns
   */
  async identifyOpportunities(currentMarketData) {
    const analysis = await this.analyzePastPerformance();
    
    if (!analysis.hasLearned) {
      return [];
    }

    const opportunities = [];
    const { insights } = analysis;
    const currentHour = new Date().getHours();

    // Check if current hour is optimal
    const isOptimalHour = insights.optimalTimeOfDay.some(h => h.hour === currentHour);
    
    // Check optimal symbols
    insights.optimalSymbols.forEach(symbolData => {
      if (symbolData.winRate > 0.6 && symbolData.totalProfit > 0) {
        const opportunity = {
          symbol: symbolData.symbol,
          confidence: symbolData.winRate,
          expectedReturn: symbolData.avgProfit,
          reasoning: `High win rate (${(symbolData.winRate * 100).toFixed(1)}%) and positive total profit`,
          timing: isOptimalHour ? 'optimal' : 'suboptimal',
          priority: isOptimalHour && symbolData.winRate > 0.65 ? 'high' : 'medium'
        };
        opportunities.push(opportunity);
      }
    });

    return opportunities.sort((a, b) => b.confidence - a.confidence);
  }
}

/**
 * Helper function to run AI learning for a subscription
 */
export async function runAILearning(subscriptionId) {
  try {
    const [subscription] = await base44.entities.UserSubscription.filter({ id: subscriptionId });
    if (!subscription) {
      return { success: false, message: 'Subscription not found' };
    }

    const trades = await base44.entities.Trade.filter({ subscription_id: subscriptionId });
    
    const learningEngine = new AILearningEngine(subscription, trades);
    const result = await learningEngine.applyLearning();
    
    return result;
  } catch (error) {
    console.error('AI Learning error:', error);
    return { success: false, message: error.message };
  }
}