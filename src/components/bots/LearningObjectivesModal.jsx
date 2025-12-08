import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Brain, TrendingUp, Shield, Target, Activity, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function LearningObjectivesModal({ subscription, isOpen, onClose, onUpdate }) {
  const [objectives, setObjectives] = useState({
    maximize_profit: subscription?.learning_objectives?.maximize_profit ?? true,
    minimize_risk: subscription?.learning_objectives?.minimize_risk ?? true,
    optimize_winrate: subscription?.learning_objectives?.optimize_winrate ?? true,
    adapt_to_volatility: subscription?.learning_objectives?.adapt_to_volatility ?? true,
    focus_best_symbols: subscription?.learning_objectives?.focus_best_symbols ?? false,
    optimize_timing: subscription?.learning_objectives?.optimize_timing ?? true,
    aggressive_learning: subscription?.learning_objectives?.aggressive_learning ?? false,
    learning_rate: subscription?.learning_objectives?.learning_rate ?? 50
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.UserSubscription.update(subscription.id, {
        learning_objectives: objectives
      });
      
      toast.success('Learning objectives updated successfully');
      onUpdate?.(objectives);
      onClose();
    } catch (error) {
      toast.error('Failed to update learning objectives');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (!subscription) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            AI Learning Objectives
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Define how your bot should learn and adapt from market behavior
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Primary Objectives */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Primary Learning Goals
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <div>
                    <Label className="text-slate-200">Maximize Profit</Label>
                    <p className="text-xs text-slate-400">Adjust take-profit levels to capture larger gains</p>
                  </div>
                </div>
                <Switch
                  checked={objectives.maximize_profit}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, maximize_profit: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-red-400" />
                  <div>
                    <Label className="text-slate-200">Minimize Risk</Label>
                    <p className="text-xs text-slate-400">Tighten stop-losses to protect capital</p>
                  </div>
                </div>
                <Switch
                  checked={objectives.minimize_risk}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, minimize_risk: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-blue-400" />
                  <div>
                    <Label className="text-slate-200">Optimize Win Rate</Label>
                    <p className="text-xs text-slate-400">Focus on consistency over large gains</p>
                  </div>
                </div>
                <Switch
                  checked={objectives.optimize_winrate}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, optimize_winrate: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-purple-400" />
                  <div>
                    <Label className="text-slate-200">Adapt to Volatility</Label>
                    <p className="text-xs text-slate-400">Adjust position sizes based on market conditions</p>
                  </div>
                </div>
                <Switch
                  checked={objectives.adapt_to_volatility}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, adapt_to_volatility: checked })}
                />
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Advanced Learning Options
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-200">Focus on Best Symbols</Label>
                  <p className="text-xs text-slate-400">Only trade pairs with proven performance</p>
                </div>
                <Switch
                  checked={objectives.focus_best_symbols}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, focus_best_symbols: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-200">Optimize Trading Times</Label>
                  <p className="text-xs text-slate-400">Learn and prioritize best hours for trading</p>
                </div>
                <Switch
                  checked={objectives.optimize_timing}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, optimize_timing: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-200">Aggressive Learning</Label>
                  <p className="text-xs text-slate-400">Make larger adjustments based on results</p>
                </div>
                <Switch
                  checked={objectives.aggressive_learning}
                  onCheckedChange={(checked) => setObjectives({ ...objectives, aggressive_learning: checked })}
                />
              </div>
            </div>
          </div>

          {/* Learning Rate */}
          <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-200">Learning Rate</Label>
                <span className="text-sm text-purple-400">{objectives.learning_rate}%</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                How quickly the bot adapts to new patterns
              </p>
              <Slider
                value={[objectives.learning_rate]}
                onValueChange={([value]) => setObjectives({ ...objectives, learning_rate: value })}
                min={10}
                max={100}
                step={10}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>Conservative</span>
                <span>Moderate</span>
                <span>Aggressive</span>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-200">
              <strong>How it works:</strong> The AI analyzes your past trades every 50 trades and automatically 
              adjusts risk parameters, trading pairs, and timing based on your selected objectives. 
              Higher learning rates mean faster adaptation but more frequent changes.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-700"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-purple-600 hover:bg-purple-500"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Objectives'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}