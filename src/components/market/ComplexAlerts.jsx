import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, Plus, Trash2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const INDICATORS = ['Price', 'RSI', 'MACD', 'Volume', 'Bollinger Upper', 'Bollinger Lower', 'EMA', 'SMA'];
const CONDITIONS = ['>', '<', '>=', '<=', '==', 'crosses above', 'crosses below'];
const LOGIC = ['AND', 'OR'];

export default function ComplexAlerts({ symbol }) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [alertConditions, setAlertConditions] = useState([
    { indicator: 'Price', condition: '>', value: 0 }
  ]);
  const [alertName, setAlertName] = useState('');
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['complexAlerts', symbol],
    queryFn: async () => {
      const results = await base44.entities.PriceAlert.filter({ symbol });
      return results.filter(a => a.is_active);
    },
    enabled: !!symbol
  });

  const createAlertMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.PriceAlert.create({
        symbol,
        target_price: 0,
        condition: 'complex',
        is_active: true,
        alert_name: alertName,
        conditions: alertConditions
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complexAlerts'] });
      toast.success('Alert created');
      setShowBuilder(false);
      setAlertName('');
      setAlertConditions([{ indicator: 'Price', condition: '>', value: 0 }]);
    }
  });

  const deleteAlertMutation = useMutation({
    mutationFn: (id) => base44.entities.PriceAlert.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complexAlerts'] });
      toast.success('Alert deleted');
    }
  });

  const addCondition = () => {
    setAlertConditions([...alertConditions, { indicator: 'Price', condition: '>', value: 0 }]);
  };

  const updateCondition = (index, field, value) => {
    const updated = [...alertConditions];
    updated[index][field] = value;
    setAlertConditions(updated);
  };

  const removeCondition = (index) => {
    setAlertConditions(alertConditions.filter((_, i) => i !== index));
  };

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-400" />
              Complex Alerts
            </CardTitle>
            <Button onClick={() => setShowBuilder(true)} size="sm" className="bg-yellow-600 hover:bg-yellow-500">
              <Plus className="w-4 h-4 mr-1" />
              New Alert
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {alerts.map(alert => (
              <div key={alert.id} className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-white">{alert.alert_name || 'Unnamed Alert'}</div>
                    <div className="text-xs text-slate-400">{symbol}</div>
                  </div>
                  <Button
                    onClick={() => deleteAlertMutation.mutate(alert.id)}
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {alert.conditions?.map((cond, idx) => (
                  <div key={idx} className="text-xs text-slate-300 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {cond.indicator} {cond.condition} {cond.value}
                    {idx < alert.conditions.length - 1 && <Badge variant="outline" className="text-xs">AND</Badge>}
                  </div>
                ))}
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-sm">
                No active alerts. Create one to get notified.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Complex Alert</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Alert Name</Label>
              <Input
                value={alertName}
                onChange={(e) => setAlertName(e.target.value)}
                placeholder="My Alert"
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-3">
              <Label>Conditions (All must be true)</Label>
              {alertConditions.map((condition, idx) => (
                <div key={idx} className="flex gap-2 items-end bg-slate-800/50 p-3 rounded-lg">
                  <div className="flex-1">
                    <Label className="text-xs text-slate-400">Indicator</Label>
                    <Select 
                      value={condition.indicator} 
                      onValueChange={(v) => updateCondition(idx, 'indicator', v)}
                    >
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {INDICATORS.map(ind => (
                          <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex-1">
                    <Label className="text-xs text-slate-400">Condition</Label>
                    <Select 
                      value={condition.condition} 
                      onValueChange={(v) => updateCondition(idx, 'condition', v)}
                    >
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {CONDITIONS.map(cond => (
                          <SelectItem key={cond} value={cond}>{cond}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex-1">
                    <Label className="text-xs text-slate-400">Value</Label>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition(idx, 'value', Number(e.target.value))}
                      className="bg-slate-700 border-slate-600"
                    />
                  </div>
                  
                  <Button
                    onClick={() => removeCondition(idx)}
                    size="sm"
                    variant="ghost"
                    className="text-red-400"
                    disabled={alertConditions.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              
              <Button onClick={addCondition} variant="outline" size="sm" className="w-full border-slate-700">
                <Plus className="w-4 h-4 mr-1" />
                Add Condition
              </Button>
            </div>

            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <Button 
                variant="outline" 
                onClick={() => setShowBuilder(false)} 
                className="flex-1 border-slate-700"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => createAlertMutation.mutate()} 
                className="flex-1 bg-yellow-600 hover:bg-yellow-500"
                disabled={!alertName || createAlertMutation.isPending}
              >
                Create Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}