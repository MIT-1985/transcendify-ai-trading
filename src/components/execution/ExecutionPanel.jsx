import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, XCircle, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import TROKIndicator from '@/components/bots/TROKIndicator';
import { toast } from 'sonner';

export default function ExecutionPanel() {
  const queryClient = useQueryClient();

  const { data: orders = [] } = useQuery({
    queryKey: ['executionOrders'],
    queryFn: () => base44.entities.ExecutionOrder.list('-created_date', 50),
    refetchInterval: 3000
  });

  const executeMutation = useMutation({
    mutationFn: async (orderId) => {
      const response = await base44.functions.invoke('executeTrade', {
        order_id: orderId,
        mode: 'testnet'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionOrders'] });
      toast.success('Trade executed successfully!');
    },
    onError: (error) => {
      toast.error('Execution failed: ' + error.message);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (orderId) => {
      await base44.entities.ExecutionOrder.update(orderId, { status: 'approved' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionOrders'] });
      toast.success('Order approved');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (orderId) => {
      await base44.entities.ExecutionOrder.update(orderId, { status: 'rejected' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionOrders'] });
      toast.info('Order rejected');
    }
  });

  const getStatusIcon = (status) => {
    const icons = {
      pending_approval: <Clock className="w-4 h-4 text-yellow-400" />,
      approved: <CheckCircle className="w-4 h-4 text-green-400" />,
      rejected: <XCircle className="w-4 h-4 text-red-400" />,
      executing: <PlayCircle className="w-4 h-4 text-blue-400 animate-pulse" />,
      filled: <CheckCircle className="w-4 h-4 text-green-400" />,
      failed: <AlertTriangle className="w-4 h-4 text-red-400" />
    };
    return icons[status] || <Clock className="w-4 h-4" />;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending_approval: 'bg-yellow-500/20 text-yellow-300',
      approved: 'bg-green-500/20 text-green-300',
      rejected: 'bg-red-500/20 text-red-300',
      executing: 'bg-blue-500/20 text-blue-300',
      filled: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300'
    };
    return colors[status] || 'bg-slate-500/20 text-slate-300';
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle>Execution Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {orders.map(order => (
            <div key={order.id} className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Badge className={order.side === 'BUY' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
                    {order.side}
                  </Badge>
                  <span className="font-semibold">{order.symbol}</span>
                  <span className="text-slate-400">×</span>
                  <span>{order.quantity}</span>
                </div>
                <div className="flex items-center gap-2">
                  {order.trok_constants_applied?.length > 0 && (
                    <TROKIndicator 
                      constantsCount={order.trok_constants_applied.length}
                      avgKPI={order.trok_constants_applied.reduce((sum, c) => sum + (c.kpi_value || 0), 0) / order.trok_constants_applied.length}
                      compact
                    />
                  )}
                  <Badge className={getStatusColor(order.status)} variant="outline">
                    {getStatusIcon(order.status)}
                    <span className="ml-1">{order.status.replace('_', ' ')}</span>
                  </Badge>
                </div>
              </div>

              {order.orchestrator_decision && (
                <div className="text-xs text-slate-400 mb-2">
                  Confidence: {(order.orchestrator_decision.confidence * 100).toFixed(0)}%
                  {order.orchestrator_decision.reasoning && ` • ${order.orchestrator_decision.reasoning}`}
                </div>
              )}

              {order.status === 'pending_approval' && (
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={() => approveMutation.mutate(order.id)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-500 flex-1"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => rejectMutation.mutate(order.id)}
                    size="sm"
                    variant="outline"
                    className="border-red-500/30 text-red-400 flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}

              {order.status === 'approved' && (
                <Button
                  onClick={() => executeMutation.mutate(order.id)}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 w-full mt-3"
                  disabled={executeMutation.isPending}
                >
                  <PlayCircle className="w-4 h-4 mr-1" />
                  Execute Trade
                </Button>
              )}

              {order.error_message && (
                <div className="mt-2 text-xs text-red-400 bg-red-900/20 p-2 rounded">
                  {order.error_message}
                </div>
              )}
            </div>
          ))}

          {orders.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No pending execution orders
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}