import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Brain, TrendingUp, AlertCircle, Play, Pause } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const AGENT_ICONS = {
  data_analysis: TrendingUp,
  strategy_optimization: Brain,
  news_sentiment: Activity,
  risk_assessment: AlertCircle,
  execution: Play,
  orchestrator: Brain
};

export default function AgentCard({ agent }) {
  const queryClient = useQueryClient();
  const Icon = AGENT_ICONS[agent.type] || Brain;

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.AIAgent.update(agent.id, {
        is_active: !agent.is_active
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(agent.is_active ? 'Agent paused' : 'Agent activated');
    }
  });

  const getStatusColor = (status) => {
    const colors = {
      idle: 'bg-green-500/20 text-green-300 border-green-500/30',
      busy: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      error: 'bg-red-500/20 text-red-300 border-red-500/30',
      offline: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
    return colors[status] || colors.offline;
  };

  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Icon className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <div className="text-xs text-slate-400">{agent.type.replace('_', ' ')}</div>
            </div>
          </div>
          <Badge className={getStatusColor(agent.status)} variant="outline">
            {agent.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400 mb-4">{agent.description}</p>
        
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div>
            <div className="text-slate-500">Tasks</div>
            <div className="font-semibold">{agent.tasks_completed || 0}</div>
          </div>
          <div>
            <div className="text-slate-500">Success Rate</div>
            <div className="font-semibold text-green-400">
              {((agent.success_rate || 1) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 mb-2">Capabilities</div>
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.slice(0, 3).map((cap, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-slate-800 border-slate-700">
                  {cap}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          variant={agent.is_active ? 'outline' : 'default'}
          size="sm"
          className="w-full"
        >
          {agent.is_active ? (
            <>
              <Pause className="w-4 h-4 mr-2" />
              Pause Agent
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Activate Agent
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}