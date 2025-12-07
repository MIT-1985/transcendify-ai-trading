import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Brain, Loader2, TrendingUp, TrendingDown, AlertTriangle, Sparkles, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

export default function AIAnalysis() {
  const [symbol, setSymbol] = useState('BTC');
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const analyzeMarket = async () => {
    setIsLoading(true);
    setAnalysis(null);
    
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert crypto market analyst. Analyze ${symbol} cryptocurrency.
        
${question ? `User question: ${question}` : 'Provide a comprehensive market analysis.'}

Include:
1. Current market sentiment (bullish/bearish/neutral)
2. Key support and resistance levels
3. Technical indicators summary
4. Recent news impact
5. Short-term and long-term outlook
6. Risk factors to consider
7. Trading recommendation with confidence level`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            sentiment: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            confidence: { type: 'number' },
            support_levels: { type: 'array', items: { type: 'number' } },
            resistance_levels: { type: 'array', items: { type: 'number' } },
            technical_summary: { type: 'string' },
            news_summary: { type: 'string' },
            short_term_outlook: { type: 'string' },
            long_term_outlook: { type: 'string' },
            risk_factors: { type: 'array', items: { type: 'string' } },
            recommendation: { type: 'string' },
            detailed_analysis: { type: 'string' }
          }
        }
      });
      
      setAnalysis(result);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sentimentConfig = {
    bullish: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: TrendingUp },
    bearish: { color: 'text-red-400', bg: 'bg-red-500/20', icon: TrendingDown },
    neutral: { color: 'text-amber-400', bg: 'bg-amber-500/20', icon: AlertTriangle }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold">AI Market Analysis</h1>
          </div>
          <p className="text-slate-400">Get AI-powered insights on any cryptocurrency</p>
        </div>

        {/* Input Section */}
        <Card className="bg-slate-900/50 border-slate-800 p-6 mb-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm text-slate-400 mb-2 block">Symbol</label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="BTC, ETH, SOL..."
                  className="bg-slate-800 border-slate-700 text-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Specific Question (optional)</label>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="E.g., What's the best entry point for a long position?"
                className="bg-slate-800 border-slate-700 min-h-[80px]"
              />
            </div>
            <Button
              onClick={analyzeMarket}
              disabled={isLoading || !symbol}
              className="w-full bg-purple-600 hover:bg-purple-500 gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Analyze {symbol}
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Results */}
        {analysis && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Sentiment Card */}
            <Card className="bg-slate-900/50 border-slate-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-16 h-16 rounded-xl flex items-center justify-center",
                    sentimentConfig[analysis.sentiment]?.bg
                  )}>
                    {React.createElement(sentimentConfig[analysis.sentiment]?.icon || AlertTriangle, {
                      className: cn("w-8 h-8", sentimentConfig[analysis.sentiment]?.color)
                    })}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{analysis.symbol}</h2>
                    <p className={cn(
                      "text-lg font-semibold capitalize",
                      sentimentConfig[analysis.sentiment]?.color
                    )}>
                      {analysis.sentiment} Sentiment
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400">Confidence</div>
                  <div className="text-3xl font-bold">{Math.round(analysis.confidence * 100)}%</div>
                </div>
              </div>

              {/* Key Levels */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-2">Support Levels</div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.support_levels?.map((level, idx) => (
                      <span key={idx} className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-mono">
                        ${level.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-2">Resistance Levels</div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.resistance_levels?.map((level, idx) => (
                      <span key={idx} className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-mono">
                        ${level.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Technical Summary */}
              <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Technical Summary
                </h3>
                <p className="text-slate-300">{analysis.technical_summary}</p>
              </div>

              {/* News Summary */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Recent News Impact</h3>
                <p className="text-slate-300">{analysis.news_summary}</p>
              </div>
            </Card>

            {/* Outlook */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-800 p-5">
                <h3 className="font-semibold mb-3 text-blue-400">Short-term Outlook</h3>
                <p className="text-slate-300 text-sm">{analysis.short_term_outlook}</p>
              </Card>
              <Card className="bg-slate-900/50 border-slate-800 p-5">
                <h3 className="font-semibold mb-3 text-purple-400">Long-term Outlook</h3>
                <p className="text-slate-300 text-sm">{analysis.long_term_outlook}</p>
              </Card>
            </div>

            {/* Risk Factors */}
            <Card className="bg-slate-900/50 border-slate-800 p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Risk Factors
              </h3>
              <ul className="space-y-2">
                {analysis.risk_factors?.map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-slate-300 text-sm">
                    <span className="text-amber-400 mt-1">•</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </Card>

            {/* Recommendation */}
            <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/30 p-6">
              <h3 className="font-semibold mb-3 text-lg">AI Recommendation</h3>
              <p className="text-slate-200">{analysis.recommendation}</p>
            </Card>

            {/* Detailed Analysis */}
            {analysis.detailed_analysis && (
              <Card className="bg-slate-900/50 border-slate-800 p-6">
                <h3 className="font-semibold mb-4">Detailed Analysis</h3>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{analysis.detailed_analysis}</ReactMarkdown>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}