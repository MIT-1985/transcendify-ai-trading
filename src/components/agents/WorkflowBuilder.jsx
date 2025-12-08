import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, PlayCircle, Trash2, ArrowDown } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function WorkflowBuilder({ agents }) {
  const [steps, setSteps] = useState([]);
  const [initialData, setInitialData] = useState('{"symbol": "BTC/USDT", "timeframe": "1h"}');

  const addStep = () => {
    setSteps([...steps, {
      agent_id: agents[0]?.id || '',
      task_type: '',
      transform: true
    }]);
  };

  const removeStep = (index) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const runWorkflowMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('orchestrateAgents', {
        action: 'runWorkflow',
        workflow: {
          steps,
          initial_data: JSON.parse(initialData)
        }
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Workflow completed successfully!');
      console.log('Workflow results:', data);
    },
    onError: (error) => {
      toast.error('Workflow failed: ' + error.message);
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Workflow Builder</span>
          <Button 
            onClick={addStep}
            size="sm"
            variant="outline"
            className="border-slate-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Step
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-6">
          <div>
            <Label>Initial Data (JSON)</Label>
            <Input
              value={initialData}
              onChange={(e) => setInitialData(e.target.value)}
              placeholder='{"symbol": "BTC/USDT"}'
              className="bg-slate-800 border-slate-700 font-mono text-sm"
            />
          </div>

          {steps.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Add workflow steps to create your agent pipeline
            </div>
          )}

          {steps.map((step, index) => (
            <div key={index}>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Step {index + 1}</div>
                    <Button
                      onClick={() => removeStep(index)}
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Agent</Label>
                    <Select
                      value={step.agent_id}
                      onValueChange={(v) => updateStep(index, 'agent_id', v)}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600">
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        {agents.map(agent => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name} ({agent.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Task Type</Label>
                    <Input
                      value={step.task_type}
                      onChange={(e) => updateStep(index, 'task_type', e.target.value)}
                      placeholder="e.g., analyze_market, optimize_strategy"
                      className="bg-slate-900 border-slate-600"
                    />
                  </div>
                </CardContent>
              </Card>
              {index < steps.length - 1 && (
                <div className="flex justify-center py-2">
                  <ArrowDown className="w-5 h-5 text-slate-600" />
                </div>
              )}
            </div>
          ))}
        </div>

        <Button
          onClick={() => runWorkflowMutation.mutate()}
          disabled={steps.length === 0 || runWorkflowMutation.isPending}
          className="w-full bg-purple-600 hover:bg-purple-500"
        >
          <PlayCircle className="w-5 h-5 mr-2" />
          {runWorkflowMutation.isPending ? 'Running Workflow...' : 'Run Workflow'}
        </Button>
      </CardContent>
    </Card>
  );
}