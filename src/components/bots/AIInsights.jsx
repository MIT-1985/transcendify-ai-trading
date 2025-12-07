import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, AlertCircle, Lightbulb, RefreshCw, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function AIInsights({ subscription, bot, trades }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzePerformance = async () => {
    if (trades.length === 0) {
      toast.error('Not enough trade data to analyze');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('aiTradingAnalysis', {
        action: 'analyze_performance',
        data: {
          trades: trades,
          strategy: bot.strategy,
          symbol: subscription.trading_pairs?.[0] || 'BTC/USD'
        }
      });

      if (response.data?.success) {
        setInsights(response.data.data);
        toast.success('AI analysis complete!');
      }
    } catch (error) {
      toast.error('Analysis failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trades.length >= 5 && !insights) {
      analyzePerformance();
    }
  }, [trades]);

  if (!insights && trades.length < 5) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6 text-center text-slate-400">
          <Brain className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p>AI insights will be available after 5+ trades</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI Performance Insights
          </CardTitle>
          <Button
            onClick={analyzePerformance}
            disabled={loading}
            size="sm"
            variant="ghost"
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-slate-400">Analyzing performance...</div>
        ) : insights ? (
          <>
            {/* Win/Loss Reasons */}
            <div className="space-y-3">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-emerald-400">Why You're Winning</span>
                </div>
                <ul className="space-y-1 text-sm text-slate-300">
                  {insights.performance_insights?.win_reasons?.map((reason, idx) => (
                    <li key={idx}>• {reason}</li>
                  ))}
                </ul>
              </div>

              {insights.performance_insights?.loss_reasons?.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="font-semibold text-red-400">Why You're Losing</span>
                  </div>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {insights.performance_insights?.loss_reasons?.map((reason, idx) => (
                      <li key={idx}>• {reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.performance_insights?.patterns_detected?.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-blue-400">Patterns Detected</span>
                  </div>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {insights.performance_insights?.patterns_detected?.map((pattern, idx) => (
                      <li key={idx}>• {pattern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {insights.recommendations?.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-white">AI Recommendations</span>
                </div>
                <div className="space-y-3">
                  {insights.recommendations.map((rec, idx) => (
                    <div key={idx} className="border-l-2 border-amber-500 pl-3">
                      <div className="text-sm font-medium text-white">{rec.parameter}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        Current: <span className="text-red-400">{rec.current_value}</span>
                        {' → '}
                        Recommended: <span className="text-emerald-400">{rec.recommended_value}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{rec.reasoning}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Forecast */}
            {insights.forecast && (
              <div className="bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-white">7-Day Forecast</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Expected Return:</span>
                    <span className={`font-semibold ${
                      insights.forecast.expected_7day_return >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {insights.forecast.expected_7day_return >= 0 ? '+' : ''}
                      {insights.forecast.expected_7day_return?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Confidence:</span>
                    <span className="text-blue-400 font-medium">
                      {insights.forecast.confidence_level}
                    </span>
                  </div>
                  {insights.forecast.key_risks?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <div className="text-xs text-slate-400 mb-1">Key Risks:</div>
                      <ul className="text-xs text-slate-300 space-y-1">
                        {insights.forecast.key_risks.map((risk, idx) => (
                          <li key={idx}>• {risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <Button onClick={analyzePerformance} className="bg-purple-600 hover:bg-purple-500">
              <Brain className="w-4 h-4 mr-2" />
              Generate AI Insights
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}