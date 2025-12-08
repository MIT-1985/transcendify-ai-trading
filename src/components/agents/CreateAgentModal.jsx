import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const AGENT_TYPES = [
  { value: 'data_analysis', label: 'Data Analysis Agent' },
  { value: 'strategy_optimization', label: 'Strategy Optimization Agent' },
  { value: 'news_sentiment', label: 'News Sentiment Agent' },
  { value: 'risk_assessment', label: 'Risk Assessment Agent' },
  { value: 'execution', label: 'Execution Agent' },
  { value: 'orchestrator', label: 'Orchestrator Agent' }
];

const DEFAULT_CAPABILITIES = {
  data_analysis: ['price analysis', 'volume analysis', 'trend detection', 'pattern recognition'],
  strategy_optimization: ['parameter tuning', 'backtesting', 'risk optimization', 'performance metrics'],
  news_sentiment: ['sentiment analysis', 'event detection', 'impact assessment', 'social media monitoring'],
  risk_assessment: ['VaR calculation', 'drawdown analysis', 'correlation metrics', 'exposure tracking'],
  execution: ['order placement', 'position management', 'slippage optimization', 'execution timing'],
  orchestrator: ['task coordination', 'decision synthesis', 'agent management', 'workflow execution']
};

export default function CreateAgentModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'data_analysis',
    description: '',
    capabilities: []
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.AIAgent.create({
        name: formData.name,
        type: formData.type,
        description: formData.description,
        capabilities: DEFAULT_CAPABILITIES[formData.type],
        status: 'idle',
        is_active: true,
        tasks_completed: 0,
        success_rate: 1.0
      });
    },
    onSuccess: () => {
      toast.success('Agent created successfully!');
      onSuccess();
      setFormData({ name: '', type: 'data_analysis', description: '', capabilities: [] });
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>Agent Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="My Analysis Agent"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div>
            <Label>Agent Type</Label>
            <Select
              value={formData.type}
              onValueChange={(v) => setFormData({...formData, type: v})}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {AGENT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe what this agent does..."
              className="bg-slate-800 border-slate-700 h-24"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" className="flex-1 border-slate-700">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formData.name || createMutation.isPending}
              className="flex-1 bg-purple-600 hover:bg-purple-500"
            >
              Create Agent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}