import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function AIOptimizationSuggestions({ subscription }) {
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', subscription.id],
    queryFn: () => base44.entities.Trade.filter({ subscription_id: subscription.id })
  });

  const { data: suggestions, refetch: analyzeSuggestions } = useQuery({
    queryKey: ['aiSuggestions', subscription.id],
    queryFn: async () => {
      if (trades.length < 10) return null;

      setIsAnalyzing(true);
      try {
        // Analyze trading performance
        const profitableTrades = trades.filter(t => (t.profit_loss || 0) > 0);
        const losingTrades = trades.filter(t => (t.profit_loss || 0) < 0);
        const winRate = (profitableTrades.length / trades.length) * 100;
        const avgWin = profitableTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / profitableTrades.length || 0;
        const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / losingTrades.length || 0);

        // Get AI recommendations
        const response = await base44.integrations.Core.InvokeLLM({
          prompt: `Analyze this trading bot performance and suggest parameter optimizations:

Strategy: ${subscription.strategy || 'Unknown'}
Total Trades: ${trades.length}
Win Rate: ${winRate.toFixed(2)}%
Average Win: $${avgWin.toFixed(2)}
Average Loss: $${avgLoss.toFixed(2)}
Total Profit: $${subscription.total_profit || 0}

Current Parameters:
- Stop Loss: ${subscription.stop_loss || 5}%
- Take Profit: ${subscription.take_profit || 10}%
- Position Size: ${subscription.max_position_size || 25}%
- Capital: $${subscription.capital_allocated || 1000}

Based on this data, provide 3-5 specific parameter optimization suggestions that could improve performance. Focus on risk management and profitability.`,
          response_json_schema: {
            type: "object",
            properties: {
              overall_assessment: { type: "string" },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    parameter: { type: "string" },
                    current_value: { type: "string" },
                    suggested_value: { type: "string" },
                    reason: { type: "string" },
                    expected_impact: { type: "string" },
                    priority: { type: "string" }
                  }
                }
              }
            }
          }
        });

        return response;
      } finally {
        setIsAnalyzing(false);
      }
    },
    enabled: false
  });

  const applyOptimizationMutation = useMutation({
    mutationFn: async (suggestion) => {
      // Parse suggested value and update subscription
      const updates = {};
      
      if (suggestion.parameter.toLowerCase().includes('stop loss')) {
        updates.stop_loss = parseFloat(suggestion.suggested_value);
      } else if (suggestion.parameter.toLowerCase().includes('take profit')) {
        updates.take_profit = parseFloat(suggestion.suggested_value);
      } else if (suggestion.parameter.toLowerCase().includes('position')) {
        updates.max_position_size = parseFloat(suggestion.suggested_value);
      }

      if (Object.keys(updates).length > 0) {
        await base44.entities.UserSubscription.update(subscription.id, updates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('Optimization applied successfully');
    }
  });

  const getPriorityColor = (priority) => {
    const colors = {
      high: 'bg-red-500/20 text-red-300 border-red-500/30',
      medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      low: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    };
    return colors[priority?.toLowerCase()] || colors.low;
  };

  const canAnalyze = trades.length >= 10;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI Optimization
          </div>
          <Button
            onClick={() => analyzeSuggestions()}
            disabled={!canAnalyze || isAnalyzing}
            size="sm"
            className="bg-purple-600 hover:bg-purple-500"
          >
            <Sparkles className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canAnalyze ? (
          <div className="text-center py-8 text-slate-400">
            <Brain className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm">Need at least 10 trades to analyze performance</p>
            <p className="text-xs mt-1">Current: {trades.length} trades</p>
          </div>
        ) : !suggestions ? (
          <div className="text-center py-8 text-slate-400">
            <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm">Click Analyze to get AI-powered optimization suggestions</p>
          </div>
        ) : (
          <>
            {/* Overall Assessment */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-300 mb-2">Assessment</div>
              <p className="text-sm text-slate-400">{suggestions.overall_assessment}</p>
            </div>

            {/* Suggestions */}
            <div className="space-y-3">
              {suggestions.suggestions?.map((suggestion, idx) => (
                <div key={idx} className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">{suggestion.parameter}</span>
                        <Badge className={getPriorityColor(suggestion.priority)} variant="outline">
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <span>{suggestion.current_value}</span>
                        <ArrowRight className="w-4 h-4" />
                        <span className="text-green-400 font-semibold">{suggestion.suggested_value}</span>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{suggestion.reason}</p>
                      <div className="text-xs text-blue-300 bg-blue-900/20 rounded px-2 py-1 inline-block">
                        Expected: {suggestion.expected_impact}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={() => applyOptimizationMutation.mutate(suggestion)}
                    disabled={applyOptimizationMutation.isPending}
                    size="sm"
                    className="w-full mt-3 bg-green-600 hover:bg-green-500"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Apply Optimization
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}