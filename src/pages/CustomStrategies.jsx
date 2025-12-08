import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import StrategyBuilder from '@/components/strategy/StrategyBuilder';

export default function CustomStrategies() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState(null);
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    description: '',
    indicators: { rsi: { enabled: false }, macd: { enabled: false }, bollinger: { enabled: false } },
    entry_conditions: [],
    exit_conditions: [],
    risk_management: { stop_loss: 5, take_profit: 10, trailing_stop: false }
  });

  const queryClient = useQueryClient();

  const { data: strategies = [] } = useQuery({
    queryKey: ['customStrategies'],
    queryFn: () => base44.entities.CustomStrategy.list('-created_date')
  });

  const createMutation = useMutation({
    mutationFn: (strategy) => base44.entities.CustomStrategy.create(strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customStrategies'] });
      toast.success('Strategy created');
      setShowBuilder(false);
      setNewStrategy({
        name: '',
        description: '',
        indicators: { rsi: { enabled: false }, macd: { enabled: false }, bollinger: { enabled: false } },
        entry_conditions: [],
        exit_conditions: [],
        risk_management: { stop_loss: 5, take_profit: 10, trailing_stop: false }
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CustomStrategy.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customStrategies'] });
      toast.success('Strategy updated');
      setShowBuilder(false);
      setEditingStrategy(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomStrategy.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customStrategies'] });
      toast.success('Strategy deleted');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: (strategy) => {
      const { id, created_date, updated_date, created_by, ...data } = strategy;
      return base44.entities.CustomStrategy.create({ ...data, name: `${data.name} (Copy)` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customStrategies'] });
      toast.success('Strategy duplicated');
    }
  });

  const handleSave = () => {
    const strategy = editingStrategy || newStrategy;
    if (!strategy.name) {
      toast.error('Strategy name is required');
      return;
    }
    if (editingStrategy) {
      updateMutation.mutate({ id: editingStrategy.id, data: strategy });
    } else {
      createMutation.mutate(strategy);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Custom Strategies</h1>
            <p className="text-slate-400">Create and manage your trading strategies</p>
          </div>
          <Button onClick={() => setShowBuilder(true)} className="bg-blue-600 hover:bg-blue-500">
            <Plus className="w-5 h-5 mr-2" />
            New Strategy
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {strategies.map((strategy) => (
            <Card key={strategy.id} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-white">{strategy.name}</CardTitle>
                    <p className="text-sm text-slate-400 mt-1">{strategy.description}</p>
                  </div>
                  <Badge className={strategy.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                    {strategy.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="text-slate-500 mb-1">Indicators</div>
                    <div className="flex flex-wrap gap-1">
                      {strategy.indicators?.rsi?.enabled && <Badge variant="outline" className="text-xs">RSI</Badge>}
                      {strategy.indicators?.macd?.enabled && <Badge variant="outline" className="text-xs">MACD</Badge>}
                      {strategy.indicators?.bollinger?.enabled && <Badge variant="outline" className="text-xs">BB</Badge>}
                      {strategy.indicators?.sma?.enabled && <Badge variant="outline" className="text-xs">SMA</Badge>}
                      {strategy.indicators?.ema?.enabled && <Badge variant="outline" className="text-xs">EMA</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-slate-800/50 rounded p-2">
                      <div className="text-slate-500 text-xs">Entry Rules</div>
                      <div className="text-white font-semibold">{strategy.entry_conditions?.length || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2">
                      <div className="text-slate-500 text-xs">Exit Rules</div>
                      <div className="text-white font-semibold">{strategy.exit_conditions?.length || 0}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setEditingStrategy(strategy);
                        setShowBuilder(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="flex-1 border-slate-700"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => duplicateMutation.mutate(strategy)}
                      size="sm"
                      variant="outline"
                      className="border-slate-700"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate(strategy.id)}
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {strategies.length === 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-16 text-center">
              <p className="text-slate-400 mb-4">No custom strategies yet</p>
              <Button onClick={() => setShowBuilder(true)} className="bg-blue-600 hover:bg-blue-500">
                Create Your First Strategy
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Strategy Builder Modal */}
        <Dialog open={showBuilder} onOpenChange={() => {
          setShowBuilder(false);
          setEditingStrategy(null);
        }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStrategy ? 'Edit Strategy' : 'Create Strategy'}</DialogTitle>
            </DialogHeader>
            <StrategyBuilder
              strategy={editingStrategy || newStrategy}
              onChange={(updated) => editingStrategy ? setEditingStrategy(updated) : setNewStrategy(updated)}
            />
            <div className="flex gap-3 pt-4 border-t border-slate-700">
              <Button variant="outline" onClick={() => {
                setShowBuilder(false);
                setEditingStrategy(null);
              }} className="flex-1 border-slate-700">
                Cancel
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500">
                {editingStrategy ? 'Update' : 'Create'} Strategy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}