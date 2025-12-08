import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { ConstantsService } from '@/components/bots/ConstantsService';

export default function ConstantRecommendations({ strategy, currentParams }) {
  const [constants, setConstants] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [optimizedParams, setOptimizedParams] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConstants = async () => {
      setLoading(true);
      const strategyConstants = await ConstantsService.getOptimizationConstants(strategy);
      setConstants(strategyConstants);
      
      const recs = ConstantsService.generateRecommendations(strategyConstants, strategy);
      setRecommendations(recs);
      
      const optimized = ConstantsService.calculateOptimalParameters(strategyConstants, currentParams);
      setOptimizedParams(optimized);
      
      setLoading(false);
    };

    if (strategy && currentParams) {
      loadConstants();
    }
  }, [strategy, currentParams]);

  if (loading) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 text-center text-slate-400">
          Loading TROK recommendations...
        </CardContent>
      </Card>
    );
  }

  const getPriorityIcon = (priority) => {
    if (priority === 'high') return <Zap className="w-4 h-4 text-yellow-400" />;
    if (priority === 'medium') return <TrendingUp className="w-4 h-4 text-blue-400" />;
    return <Lightbulb className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="space-y-4">
      {/* TROK-Optimized Parameters */}
      {optimizedParams && (
        <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              TROK-Optimized Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-400">Stop Loss</div>
                <div className="flex items-center gap-2">
                  <span className="line-through text-slate-600">
                    {(currentParams.stopLoss * 100).toFixed(2)}%
                  </span>
                  <span className="font-bold text-green-400">
                    {(optimizedParams.stopLoss * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div>
                <div className="text-slate-400">Take Profit</div>
                <div className="flex items-center gap-2">
                  <span className="line-through text-slate-600">
                    {(currentParams.takeProfit * 100).toFixed(2)}%
                  </span>
                  <span className="font-bold text-green-400">
                    {(optimizedParams.takeProfit * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div>
                <div className="text-slate-400">Position Size</div>
                <div className="flex items-center gap-2">
                  <span className="line-through text-slate-600">
                    {(currentParams.positionSize * 100).toFixed(2)}%
                  </span>
                  <span className="font-bold text-green-400">
                    {(optimizedParams.positionSize * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              Based on {constants.length} high-KPI constants from TROK theory
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">AI Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                {getPriorityIcon(rec.priority)}
                <div className="flex-1">
                  <div className="text-sm">{rec.message}</div>
                  <Badge 
                    variant="outline" 
                    className={`mt-2 text-xs ${
                      rec.priority === 'high' ? 'border-yellow-500/30 text-yellow-300' :
                      rec.priority === 'medium' ? 'border-blue-500/30 text-blue-300' :
                      'border-slate-500/30 text-slate-300'
                    }`}
                  >
                    {rec.type}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Applied Constants Preview */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg">Applied TROK Constants ({constants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {constants.slice(0, 5).map(constant => (
              <div key={constant.id} className="text-xs p-2 bg-slate-800/50 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-purple-300">{constant.law_principle}</span>
                  <Badge className="bg-green-500/20 text-green-300 text-xs">
                    KPI: {constant.kpi_value?.toFixed(3)}
                  </Badge>
                </div>
                <div className="font-mono text-slate-400">{constant.formula_statement}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}