import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, TrendingUp, TrendingDown, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderHistory() {
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 50),
    refetchInterval: 5000
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId) => base44.entities.Order.update(orderId, { status: 'CANCELLED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled');
    }
  });

  const getStatusBadge = (status) => {
    const config = {
      PENDING: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
      FILLED: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
      PARTIALLY_FILLED: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Clock },
      CANCELLED: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: X },
      REJECTED: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: X }
    };
    const { color, icon: Icon } = config[status] || config.PENDING;
    return (
      <Badge className={color}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          Order History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-slate-400 py-8">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {orders.map((order) => (
              <div key={order.id} className="bg-slate-800/50 rounded-lg p-3 hover:bg-slate-800 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {order.side === 'BUY' ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <span className={`font-semibold ${order.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {order.side}
                    </span>
                    <span className="text-white font-medium">
                      {order.symbol.replace('X:', '').replace('USD', '/USD')}
                    </span>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Type:</span>
                    <span className="text-white ml-2">{order.type}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Quantity:</span>
                    <span className="text-white ml-2">{order.quantity.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Price:</span>
                    <span className="text-white ml-2">${order.price?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Total:</span>
                    <span className="text-white ml-2">${order.total_value?.toFixed(2)}</span>
                  </div>
                </div>

                {order.status === 'FILLED' && order.filled_at && (
                  <div className="text-xs text-slate-500 mt-2">
                    Filled at {new Date(order.filled_at).toLocaleString()}
                  </div>
                )}

                {order.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelMutation.mutate(order.id)}
                    className="mt-2 text-red-400 hover:text-red-300 text-xs"
                  >
                    Cancel Order
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}