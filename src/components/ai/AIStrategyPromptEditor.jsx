import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Save, RotateCw, Lightbulb } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const PROMPT_TEMPLATES = {
  conservative: "Analyze {symbol} with focus on risk minimization. Use technical indicators to identify low-risk entry points. Prioritize capital preservation over aggressive gains. Set tight stop losses and take profits at 5-8% gains.",
  aggressive: "Identify high-momentum opportunities in {symbol}. Look for breakout patterns and strong volume. Accept higher risk for potential 15-25% gains. Use trailing stops to maximize profits.",
  volatility: "Trade {symbol} based on volatility expansion and contraction. Enter during low volatility periods and exit during volatility spikes. Use Bollinger Bands and ATR for signals.",
  trend_following: "Follow the dominant trend in {symbol}. Enter on pullbacks during uptrends. Exit when trend reversal signals appear. Use moving averages and MACD for confirmation.",
  mean_reversion: "Identify overbought/oversold conditions in {symbol}. Enter counter-trend positions when price deviates significantly from mean. Exit when price returns to average levels."
};

export default function AIStrategyPromptEditor({ subscription, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [customPrompt, setCustomPrompt] = useState(
    subscription?.ai_prompt || PROMPT_TEMPLATES.conservative
  );
  const [selectedTemplate, setSelectedTemplate] = useState('conservative');

  const updatePromptMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.UserSubscription.update(subscription.id, {
        ai_prompt: customPrompt,
        ai_enabled: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('AI prompt updated successfully');
      onClose();
    }
  });

  const testPromptMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Trading Strategy Analysis:\n\n${customPrompt}\n\nProvide a brief strategy summary and 3 key trading rules.`,
        response_json_schema: {
          type: "object",
          properties: {
            strategy_summary: { type: "string" },
            trading_rules: { type: "array", items: { type: "string" } }
          }
        }
      });
      return response;
    },
    onSuccess: (data) => {
      toast.success('AI prompt validated successfully');
      console.log('Strategy preview:', data);
    },
    onError: () => {
      toast.error('Failed to validate prompt');
    }
  });

  const applyTemplate = (template) => {
    setSelectedTemplate(template);
    setCustomPrompt(PROMPT_TEMPLATES[template]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Custom AI Strategy Prompt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info */}
          <div className="bg-blue-900/20 border border-blue-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                Define how the AI should analyze markets and generate trading signals. 
                Use {'{symbol}'} as placeholder for the trading pair. The AI will use this prompt 
                to make intelligent trading decisions tailored to your strategy.
              </div>
            </div>
          </div>

          {/* Templates */}
          <div>
            <Label className="mb-3 block">Quick Templates</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.keys(PROMPT_TEMPLATES).map((template) => (
                <Button
                  key={template}
                  size="sm"
                  variant="outline"
                  onClick={() => applyTemplate(template)}
                  className={`justify-start ${
                    selectedTemplate === template 
                      ? 'border-purple-500 bg-purple-500/20' 
                      : 'border-slate-700'
                  }`}
                >
                  {template.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Prompt Editor */}
          <div>
            <Label className="mb-2 block">Custom AI Prompt</Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe your trading strategy and how the AI should analyze the market..."
              className="bg-slate-800 border-slate-700 min-h-[200px] font-mono text-sm"
            />
            <div className="text-xs text-slate-500 mt-2">
              {customPrompt.length} characters
            </div>
          </div>

          {/* Example Variables */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-sm font-semibold mb-2">Available Variables:</div>
            <div className="space-y-1 text-xs text-slate-400">
              <div><code className="bg-slate-700 px-1 rounded">{'{symbol}'}</code> - Trading pair (e.g., BTC/USD)</div>
              <div><code className="bg-slate-700 px-1 rounded">{'{timeframe}'}</code> - Timeframe (e.g., 5m, 1h)</div>
              <div><code className="bg-slate-700 px-1 rounded">{'{capital}'}</code> - Allocated capital</div>
              <div><code className="bg-slate-700 px-1 rounded">{'{risk_level}'}</code> - Risk tolerance</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => testPromptMutation.mutate()}
              disabled={testPromptMutation.isPending || !customPrompt}
              variant="outline"
              className="border-blue-500/30 text-blue-300"
            >
              <RotateCw className={`w-4 h-4 mr-2 ${testPromptMutation.isPending ? 'animate-spin' : ''}`} />
              Test Prompt
            </Button>
            <Button
              onClick={() => updatePromptMutation.mutate()}
              disabled={updatePromptMutation.isPending || !customPrompt}
              className="flex-1 bg-purple-600 hover:bg-purple-500"
            >
              <Save className="w-4 h-4 mr-2" />
              {updatePromptMutation.isPending ? 'Saving...' : 'Save & Apply'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}