import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Trash2, BellOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function PriceAlertsPanel() {
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['price-alerts'],
    queryFn: () => base44.entities.PriceAlert.filter({ is_active: true }, '-created_date')
  });

  const { data: prices = {} } = useQuery({
    queryKey: ['alert-prices', alerts],
    queryFn: async () => {
      const pricePromises = alerts.map(async (alert) => {
        try {
          const response = await base44.functions.invoke('polygonMarketData', {
            action: 'ticker',
            symbol: alert.symbol
          });
          if (response.data?.success && response.data.data?.results?.[0]) {
            return {
              symbol: alert.symbol,
              price: response.data.data.results[0].c
            };
          }
        } catch (error) {
          return null;
        }
      });
      const results = await Promise.all(pricePromises);
      return results.reduce((acc, item) => {
        if (item) acc[item.symbol] = item.price;
        return acc;
      }, {});
    },
    enabled: alerts.length > 0,
    refetchInterval: 5000,
    onSuccess: (newPrices) => {
      // Check for triggered alerts
      alerts.forEach(alert => {
        const currentPrice = newPrices[alert.symbol];
        if (!currentPrice) return;
        
        const isTriggered = alert.condition === 'above' 
          ? currentPrice >= alert.target_price 
          : currentPrice <= alert.target_price;
        
        if (isTriggered && !alert.triggered_at) {
          base44.entities.PriceAlert.update(alert.id, {
            triggered_at: new Date().toISOString(),
            is_active: false
          });
          toast.success(`Price Alert: ${alert.symbol} ${alert.condition} $${alert.target_price}!`);
          queryClient.invalidateQueries({ queryKey: ['price-alerts'] });
        }
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PriceAlert.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] });
      toast.success('Alert deleted');
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          Price Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center text-slate-400 py-6">
            <BellOff className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No active alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => {
              const currentPrice = prices[alert.symbol];
              const progress = currentPrice 
                ? alert.condition === 'above'
                  ? Math.min((currentPrice / alert.target_price) * 100, 100)
                  : Math.min((alert.target_price / currentPrice) * 100, 100)
                : 0;

              return (
                <div key={alert.id} className="bg-slate-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-white font-semibold">
                        {alert.symbol.replace('X:', '').replace('USD', '/USD')}
                      </span>
                      <div className="text-sm text-slate-400 mt-1">
                        Alert when price goes {alert.condition} ${alert.target_price.toFixed(2)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(alert.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {currentPrice && (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>Current: ${currentPrice.toFixed(2)}</span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}