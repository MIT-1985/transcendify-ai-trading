import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, MessageSquare } from 'lucide-react';

export default function AgentConversationMonitor({ conversations, agents }) {
  const getAgentName = (id) => agents.find(a => a.id === id)?.name || 'Unknown';

  const getMessageTypeColor = (type) => {
    const colors = {
      query: 'bg-blue-500/20 text-blue-300',
      response: 'bg-green-500/20 text-green-300',
      notification: 'bg-yellow-500/20 text-yellow-300',
      collaboration_request: 'bg-purple-500/20 text-purple-300'
    };
    return colors[type] || 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="space-y-3">
      {conversations.length === 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-6 text-center text-slate-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
            No agent conversations yet
          </CardContent>
        </Card>
      )}

      {conversations.map(conv => (
        <Card key={conv.id} className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className="bg-purple-500/20 text-purple-300">
                  {getAgentName(conv.from_agent)}
                </Badge>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <Badge className="bg-blue-500/20 text-blue-300">
                  {getAgentName(conv.to_agent)}
                </Badge>
              </div>
              <Badge className={getMessageTypeColor(conv.message_type)} variant="outline">
                {conv.message_type.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                {JSON.stringify(conv.message, null, 2)}
              </pre>
            </div>
            {conv.context && (
              <div className="mt-3 text-xs text-slate-500">
                Context: {JSON.stringify(conv.context)}
              </div>
            )}
            <div className="mt-2 text-xs text-slate-600">
              {new Date(conv.created_date).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}