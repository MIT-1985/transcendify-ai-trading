import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, RefreshCw, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

const MOCK_SCENARIOS = {
  bullish: {
    name: 'Strong Bullish Momentum',
    data: {
      symbol: 'BTC/USD',
      price: 45000,
      change_24h: 8.5,
      rsi: 72,
      macd: 'bullish crossover',
      volatility: 4.2,
      volume: 'increasing',
      indicators: 'RSI: 72 (Overbought), MACD: Bullish, BB: Near upper band'
    }
  },
  bearish: {
    name: 'Strong Bearish Momentum',
    data: {
      symbol: 'BTC/USD',
      price: 42000,
      change_24h: -6.3,
      rsi: 28,
      macd: 'bearish crossover',
      volatility: 5.1,
      volume: 'decreasing',
      indicators: 'RSI: 28 (Oversold), MACD: Bearish, BB: Near lower band'
    }
  },
  sideways: {
    name: 'Sideways/Ranging Market',
    data: {
      symbol: 'BTC/USD',
      price: 43500,
      change_24h: 0.8,
      rsi: 52,
      macd: 'neutral',
      volatility: 1.5,
      volume: 'stable',
      indicators: 'RSI: 52 (Neutral), MACD: Flat, BB: Price in middle'
    }
  },
  volatile: {
    name: 'High Volatility',
    data: {
      symbol: 'BTC/USD',
      price: 44200,
      change_24h: 12.3,
      rsi: 65,
      macd: 'volatile',
      volatility: 8.7,
      volume: 'very high',
      indicators: 'RSI: 65, MACD: Erratic, BB: Wide bands, High volume'
    }
  }
};

export default function PromptPlayground({ prompt, onSaveResults }) {
  const [selectedScenario, setSelectedScenario] = useState('bullish');
  const [customScenario, setCustomScenario] = useState('');
  const [results, setResults] = useState([]);

  const testMutation = useMutation({
    mutationFn: async (scenario) => {
      const scenarioData = MOCK_SCENARIOS[scenario].data;
      const testPrompt = prompt
        .replace('{symbol}', scenarioData.symbol)
        .replace('{performance}', `Price: $${scenarioData.price}, Change: ${scenarioData.change_24h}%, ${scenarioData.indicators}`);
      
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: testPrompt,
        add_context_from_internet: false
      });
      
      return {
        scenario: MOCK_SCENARIOS[scenario].name,
        decision: response.trim().toUpperCase(),
        scenarioData,
        timestamp: new Date().toISOString()
      };
    },
    onSuccess: (result) => {
      setResults([result, ...results]);
      toast.success(`Test completed: ${result.decision}`);
    },
    onError: () => {
      toast.error('Test failed');
    }
  });

  const testAllScenarios = async () => {
    toast.info('Testing all scenarios...');
    const allResults = [];
    
    for (const scenario of Object.keys(MOCK_SCENARIOS)) {
      try {
        const result = await testMutation.mutateAsync(scenario);
        allResults.push(result);
      } catch (e) {
        console.error('Scenario test failed:', e);
      }
    }
    
    setResults(allResults);
    if (onSaveResults) {
      onSaveResults(allResults);
    }
  };

  const getDecisionColor = (decision) => {
    if (decision.includes('BUY')) return 'text-green-400';
    if (decision.includes('SELL')) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getDecisionIcon = (decision) => {
    if (decision.includes('BUY')) return TrendingUp;
    if (decision.includes('SELL')) return TrendingDown;
    return Activity;
  };

  return (
    <div className="space-y-6">
      {/* Test Controls */}
      <Card className="p-6 bg-slate-900/50 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Test Your Prompt</h3>
        
        <div className="space-y-4">
          <div>
            <Label>Select Market Scenario</Label>
            <Select value={selectedScenario} onValueChange={setSelectedScenario}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MOCK_SCENARIOS).map(([key, scenario]) => (
                  <SelectItem key={key} value={key}>{scenario.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scenario Details */}
          {selectedScenario && (
            <div className="bg-slate-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold mb-2">Scenario Details:</h4>
              <div className="text-sm text-slate-300 space-y-1">
                {Object.entries(MOCK_SCENARIOS[selectedScenario].data).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-400">{key}:</span>
                    <span className="font-mono">{typeof value === 'number' ? value.toFixed(2) : value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => testMutation.mutate(selectedScenario)}
              disabled={testMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-500"
            >
              <Play className="w-4 h-4 mr-2" />
              Test This Scenario
            </Button>
            <Button
              onClick={testAllScenarios}
              disabled={testMutation.isPending}
              variant="outline"
              className="border-purple-500 text-purple-400"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Test All Scenarios
            </Button>
          </div>
        </div>
      </Card>

      {/* Custom Scenario */}
      <Card className="p-6 bg-slate-900/50 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Custom Test Data (Optional)</h3>
        <Textarea
          value={customScenario}
          onChange={(e) => setCustomScenario(e.target.value)}
          placeholder="Enter custom market data for testing..."
          className="bg-slate-800 border-slate-700 min-h-[100px]"
        />
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card className="p-6 bg-slate-900/50 border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Test Results</h3>
          <div className="space-y-3">
            {results.map((result, i) => {
              const DecisionIcon = getDecisionIcon(result.decision);
              return (
                <div key={i} className="bg-slate-800 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">{result.scenario}</span>
                    <div className={`flex items-center gap-2 font-bold text-lg ${getDecisionColor(result.decision)}`}>
                      <DecisionIcon className="w-5 h-5" />
                      {result.decision}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Price: ${result.scenarioData.price} | Change: {result.scenarioData.change_24h}% | 
                    RSI: {result.scenarioData.rsi} | Volatility: {result.scenarioData.volatility}%
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Summary */}
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h4 className="font-semibold mb-2">Summary:</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-400">BUY Signals</div>
                <div className="text-green-400 font-bold text-lg">
                  {results.filter(r => r.decision.includes('BUY')).length}
                </div>
              </div>
              <div>
                <div className="text-slate-400">SELL Signals</div>
                <div className="text-red-400 font-bold text-lg">
                  {results.filter(r => r.decision.includes('SELL')).length}
                </div>
              </div>
              <div>
                <div className="text-slate-400">HOLD Signals</div>
                <div className="text-yellow-400 font-bold text-lg">
                  {results.filter(r => r.decision.includes('HOLD')).length}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}