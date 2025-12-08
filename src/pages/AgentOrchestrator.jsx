import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Network, Plus, Activity, MessageSquare, PlayCircle } from 'lucide-react';
import AgentCard from '@/components/agents/AgentCard';
import AgentConversationMonitor from '@/components/agents/AgentConversationMonitor';
import WorkflowBuilder from '@/components/agents/WorkflowBuilder';
import CreateAgentModal from '@/components/agents/CreateAgentModal';

export default function AgentOrchestrator() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.AIAgent.list('-created_date'),
    refetchInterval: 5000
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['agentTasks'],
    queryFn: () => base44.entities.AgentTask.list('-created_date', 50),
    refetchInterval: 2000
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['agentConversations'],
    queryFn: () => base44.entities.AgentConversation.list('-created_date', 100),
    refetchInterval: 3000
  });

  const activeAgents = agents.filter(a => a.is_active && a.status !== 'offline');
  const runningTasks = tasks.filter(t => t.status === 'running');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Network className="w-8 h-8 text-purple-400" />
              AI Agent Orchestration
            </h1>
            <p className="text-slate-400">
              Multi-agent collaboration system for intelligent trading
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-500"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Agent
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{activeAgents.length}</div>
                  <div className="text-sm text-slate-400">Active Agents</div>
                </div>
                <Activity className="w-10 h-10 text-green-400 opacity-20" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{runningTasks.length}</div>
                  <div className="text-sm text-slate-400">Running Tasks</div>
                </div>
                <PlayCircle className="w-10 h-10 text-blue-400 opacity-20" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{conversations.length}</div>
                  <div className="text-sm text-slate-400">Conversations</div>
                </div>
                <MessageSquare className="w-10 h-10 text-purple-400 opacity-20" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">
                    {tasks.filter(t => t.status === 'completed').length}
                  </div>
                  <div className="text-sm text-slate-400">Completed Tasks</div>
                </div>
                <Network className="w-10 h-10 text-yellow-400 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-6">
            <div className="grid grid-cols-3 gap-4">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
            {agents.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                No agents created yet. Create your first agent to get started.
              </div>
            )}
          </TabsContent>

          <TabsContent value="conversations" className="mt-6">
            <AgentConversationMonitor conversations={conversations} agents={agents} />
          </TabsContent>

          <TabsContent value="workflows" className="mt-6">
            <WorkflowBuilder agents={agents} />
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <div className="space-y-3">
              {tasks.map(task => (
                <Card key={task.id} className="bg-slate-900 border-slate-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">{task.task_type}</div>
                        <div className="text-sm text-slate-400">
                          Agent: {agents.find(a => a.id === task.agent_id)?.name || 'Unknown'}
                        </div>
                      </div>
                      <Badge className={
                        task.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        task.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                        task.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                        'bg-slate-500/20 text-slate-300'
                      }>
                        {task.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Agent Modal */}
        <CreateAgentModal 
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['agents'] });
            setShowCreateModal(false);
          }}
        />
      </div>
    </div>
  );
}