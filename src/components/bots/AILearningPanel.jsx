import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, Shield, Target, Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { AILearningEngine } from './AILearningEngine';
import LearningObjectivesModal from './LearningObjectivesModal';
import { toast } from 'sonner';

export default function AILearningPanel({ subscription, trades }) {
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showObjectivesModal, setShowObjectivesModal] = useState(false);
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    if (trades && trades.length >= 10) {
      analyzePerformance();
      identifyOpportunities();
    }
  }, [trades]);

  const analyzePerformance = async () => {
    setIsAnalyzing(true);
    try {
      const engine = new AILearningEngine(subscription, trades);
      const result = await engine.analyzePastPerformance();
      setAnalysis(result);
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const identifyOpportunities = async () => {
    try {
      const engine = new AILearningEngine(subscription, trades);
      const opps = await engine.identifyOpportunities();
      setOpportunities(opps);
    } catch (error) {
      console.error('Opportunities error:', error);
    }
  };

  const handleApplyLearning = async () => {
    setIsAnalyzing(true);
    try {
      const engine = new AILearningEngine(subscription, trades);
      const result = await engine.applyLearning();
      
      if (result.success) {
        toast.success('AI learning applied successfully');
        await analyzePerformance();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to apply AI learning');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!trades || trades.length < 10) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">
              Complete at least 10 trades for AI learning to begin
            </p>
            <div className="mt-4">
              <Progress value={(trades.length / 10) * 100} className="h-2" />
              <p className="text-sm text-slate-500 mt-2">
                {trades.length} / 10 trades
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              AI Learning Engine
            </CardTitle>
            <Button
              onClick={() => setShowObjectivesModal(true)}
              variant="outline"
              size="sm"
              className="border-slate-700"
            >
              <Target className="w-4 h-4 mr-2" />
              Objectives
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Learning Status */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-400">Learning Progress</span>
              <Badge className="bg-purple-500/20 text-purple-400">
                {trades.length} trades analyzed
              </Badge>
            </div>
            <Progress value={Math.min(100, (trades.length / 50) * 100)} className="h-2 mb-2" />
            <p className="text-xs text-slate-500">
              Next learning cycle: {50 - (trades.length % 50)} trades
            </p>
          </div>

          {/* Performance Insights */}
          {analysis?.hasLearned && analysis.insights && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-slate-400">Win Rate</span>
                  </div>
                  <div className="text-xl font-bold text-white">
                    {(analysis.insights.winRate * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-slate-400">Sharpe Ratio</span>
                  </div>
                  <div className="text-xl font-bold text-white">
                    {analysis.insights.riskMetrics.sharpeRatio.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              {analysis.recommendations && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI Recommendations
                  </h4>
                  <ul className="space-y-1">
                    {analysis.recommendations.reasoning.map((reason, idx) => (
                      <li key={idx} className="text-xs text-purple-200 flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optimal Symbols */}
              {analysis.insights.optimalSymbols.length > 0 && (
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <h4 className="text-sm text-slate-400 mb-2">Best Performing Symbols</h4>
                  <div className="flex flex-wrap gap-2">
                    {analysis.insights.optimalSymbols.slice(0, 3).map(symbol => (
                      <Badge key={symbol.symbol} className="bg-green-500/20 text-green-400">
                        {symbol.symbol} ({(symbol.winRate * 100).toFixed(0)}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Trading Opportunities */}
              {opportunities.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-300 mb-2">
                    Identified Opportunities
                  </h4>
                  <div className="space-y-2">
                    {opportunities.slice(0, 3).map((opp, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-blue-200">{opp.symbol}</span>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            opp.priority === 'high' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {opp.confidence > 0.7 ? 'High' : 'Medium'} confidence
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Apply Learning Button */}
          <Button
            onClick={handleApplyLearning}
            disabled={isAnalyzing}
            className="w-full bg-purple-600 hover:bg-purple-500"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Apply AI Learning Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <LearningObjectivesModal
        subscription={subscription}
        isOpen={showObjectivesModal}
        onClose={() => setShowObjectivesModal(false)}
        onUpdate={(objectives) => {
          toast.success('Learning objectives updated');
        }}
      />
    </>
  );
}