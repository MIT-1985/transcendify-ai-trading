import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function AIOptimizer({ bot, currentConfig, onApplyRecommendations }) {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState(null);

  const analyzeAndOptimize = async () => {
    setLoading(true);
    try {
      // Fetch recent market data
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const marketResponse = await base44.functions.invoke('polygonMarketData', {
        action: 'aggregates',
        symbol: currentConfig.trading_pairs?.[0] || 'X:BTCUSD',
        from: from,
        to: to,
        timespan: 'hour',
        limit: 50
      });

      const historicalData = marketResponse.data?.data?.results || [];

      // Get AI recommendations
      const aiResponse = await base44.functions.invoke('aiTradingAnalysis', {
        action: 'optimize_parameters',
        data: {
          symbol: currentConfig.trading_pairs?.[0] || 'X:BTCUSD',
          strategy: bot.strategy,
          capital: currentConfig.capital_allocated,
          historical_data: historicalData
        }
      });

      if (aiResponse.data?.success) {
        setRecommendations(aiResponse.data.data);
        toast.success('AI analysis complete!');
      }
    } catch (error) {
      toast.error('AI analysis failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendations = () => {
    if (recommendations?.recommended_parameters) {
      onApplyRecommendations(recommendations.recommended_parameters);
      toast.success('AI recommendations applied!');
    }
  };

  return (
    <Card className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 border-purple-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Brain className="w-5 h-5 text-purple-400" />
          AI Strategy Optimizer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!recommendations ? (
          <div className="text-center py-4">
            <Sparkles className="w-12 h-12 text-purple-400 mx-auto mb-3" />
            <p className="text-slate-300 mb-4">
              Let AI analyze market conditions and optimize your strategy parameters
            </p>
            <Button
              onClick={analyzeAndOptimize}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Analyze & Optimize
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Market Analysis */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-white">Market Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">Volatility:</span>
                  <span className="ml-2 text-white font-medium">
                    {recommendations.market_analysis?.volatility}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Trend:</span>
                  <span className="ml-2 text-white font-medium">
                    {recommendations.market_analysis?.trend}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">AI Confidence:</span>
                  <span className="ml-2 text-emerald-400 font-medium">
                    {(recommendations.market_analysis?.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Recommended Parameters */}
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white">Recommended Parameters</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Stop Loss:</span>
                  <span className="text-red-400 font-medium">
                    {recommendations.recommended_parameters?.stop_loss?.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Take Profit:</span>
                  <span className="text-emerald-400 font-medium">
                    {recommendations.recommended_parameters?.take_profit?.toFixed(1)}%
                  </span>
                </div>
                {bot.strategy === 'grid' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Grid Levels:</span>
                      <span className="text-white font-medium">
                        {recommendations.recommended_parameters?.grid_levels}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Grid Spacing:</span>
                      <span className="text-white font-medium">
                        {recommendations.recommended_parameters?.grid_spacing?.toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
                {bot.strategy === 'dca' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">DCA Interval:</span>
                      <span className="text-white font-medium">
                        {recommendations.recommended_parameters?.dca_interval} min
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">DCA Amount:</span>
                      <span className="text-white font-medium">
                        ${recommendations.recommended_parameters?.dca_amount}
                      </span>
                    </div>
                  </>
                )}
                {bot.strategy === 'momentum' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Period:</span>
                      <span className="text-white font-medium">
                        {recommendations.recommended_parameters?.momentum_period} min
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Threshold:</span>
                      <span className="text-white font-medium">
                        {recommendations.recommended_parameters?.momentum_threshold?.toFixed(1)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Risk Assessment */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white">Risk Assessment</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-300">Risk Level:</span>
                  <span className="text-amber-400 font-medium">
                    {recommendations.risk_assessment?.risk_level}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Expected Win Rate:</span>
                  <span className="text-emerald-400 font-medium">
                    {(recommendations.risk_assessment?.expected_win_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-2">
                  {recommendations.risk_assessment?.reasoning}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setRecommendations(null)}
                variant="outline"
                className="flex-1 border-slate-700"
              >
                Re-analyze
              </Button>
              <Button
                onClick={applyRecommendations}
                className="flex-1 bg-purple-600 hover:bg-purple-500"
              >
                Apply Recommendations
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}