import { base44 } from '@/api/base44Client';

export class ConstantsService {
  static async getRelevantConstants(domain, useCase, minKPI = 0.85) {
    const allConstants = await base44.entities.GlobalIntelligenceLaw.filter({
      domain,
      use_cases_notes: useCase
    });

    // Filter by KPI and sort by optimization weight
    return allConstants
      .filter(c => (c.kpi_value || 0) >= minKPI)
      .sort((a, b) => (b.optimization_weight || 1) - (a.optimization_weight || 1))
      .slice(0, 10);
  }

  static async getOptimizationConstants(strategy) {
    const domains = {
      'rsi': ['Signal Processing', 'Mathematics', 'Information Theory'],
      'macd': ['Signal Processing', 'Information Theory', 'Mathematics'],
      'bollinger': ['Mathematics', 'Signal Processing', 'Artificial Intelligence'],
      'scalping': ['Signal Processing', 'Artificial Intelligence', 'DimGPT Grid'],
      'swing': ['Mathematics', 'Artificial Intelligence', 'Economics'],
      'momentum': ['Physics', 'Signal Processing', 'Artificial Intelligence']
    };

    const relevantDomains = domains[strategy] || ['Artificial Intelligence'];
    const constants = [];

    for (const domain of relevantDomains) {
      const domainConstants = await base44.entities.GlobalIntelligenceLaw.filter({ domain });
      constants.push(...domainConstants.filter(c => 
        (c.use_cases_notes?.includes('optimization') || 
         c.use_cases_notes?.includes('AI optimization') ||
         c.use_cases_notes?.includes('model calibration')) &&
        (c.kpi_value || 0) >= 0.85
      ));
    }

    return constants.slice(0, 15);
  }

  static async getRiskConstants() {
    const riskDomains = ['Risk Assessment', 'Economics', 'Mathematics', 'Physics'];
    const constants = [];

    for (const domain of riskDomains) {
      const domainConstants = await base44.entities.GlobalIntelligenceLaw.filter({ domain });
      constants.push(...domainConstants.filter(c => 
        (c.use_cases_notes?.includes('risk') || 
         c.use_cases_notes?.includes('quantum/control modeling')) &&
        (c.kpi_value || 0) >= 0.90
      ));
    }

    return constants.slice(0, 10);
  }

  static applyConstantToParameter(constant, baseValue) {
    // Apply TROK constant as optimization multiplier
    const kpiWeight = constant.kpi_value || 0.85;
    const optimizationFactor = constant.optimization_weight || 1.0;
    
    // Extract numeric value from formula if possible
    const formulaMatch = constant.formula_statement.match(/k\s*×\s*f\((.+?)\)/);
    const adaptiveFactor = kpiWeight * optimizationFactor;
    
    return baseValue * adaptiveFactor;
  }

  static calculateOptimalParameters(constants, baseParams) {
    const optimized = { ...baseParams };
    
    // Use high-KPI constants to adjust parameters
    const topConstants = constants
      .sort((a, b) => (b.kpi_value || 0) - (a.kpi_value || 0))
      .slice(0, 5);

    if (topConstants.length > 0) {
      const avgKPI = topConstants.reduce((sum, c) => sum + (c.kpi_value || 0), 0) / topConstants.length;
      const avgWeight = topConstants.reduce((sum, c) => sum + (c.optimization_weight || 1), 0) / topConstants.length;
      
      // Adjust stop loss (lower for higher confidence)
      if (optimized.stopLoss) {
        optimized.stopLoss = optimized.stopLoss * (2 - avgKPI);
      }
      
      // Adjust take profit (higher for higher confidence)
      if (optimized.takeProfit) {
        optimized.takeProfit = optimized.takeProfit * (0.5 + avgKPI);
      }
      
      // Adjust position size (optimize based on constants)
      if (optimized.positionSize) {
        optimized.positionSize = optimized.positionSize * avgWeight;
      }
    }

    return optimized;
  }

  static generateRecommendations(constants, strategy) {
    const recommendations = [];

    // Analyze constant patterns
    const theoreticalCount = constants.filter(c => c.type === 'Theoretical').length;
    const empiricalCount = constants.filter(c => c.type === 'Empirical').length;
    const avgKPI = constants.reduce((sum, c) => sum + (c.kpi_value || 0), 0) / (constants.length || 1);

    if (avgKPI > 0.92) {
      recommendations.push({
        type: 'confidence',
        message: `High confidence strategy (avg KPI: ${avgKPI.toFixed(3)}). Consider increasing position size by 15-25%.`,
        priority: 'high'
      });
    }

    if (theoreticalCount > empiricalCount) {
      recommendations.push({
        type: 'validation',
        message: 'Strategy based on theoretical constants. Recommended to validate with backtest before live trading.',
        priority: 'medium'
      });
    }

    if (constants.some(c => c.use_cases_notes?.includes('quantum/control modeling'))) {
      recommendations.push({
        type: 'advanced',
        message: 'Advanced quantum modeling constants detected. Enable adaptive parameters for optimal performance.',
        priority: 'high'
      });
    }

    return recommendations;
  }
}