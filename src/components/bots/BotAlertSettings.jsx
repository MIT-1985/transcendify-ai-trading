import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function BotAlertSettings({ subscription, isOpen, onClose }) {
  const [alerts, setAlerts] = useState({
    high_profit_enabled: subscription?.alert_settings?.high_profit_enabled ?? true,
    high_profit_threshold: subscription?.alert_settings?.high_profit_threshold ?? 500,
    large_loss_enabled: subscription?.alert_settings?.large_loss_enabled ?? true,
    large_loss_threshold: subscription?.alert_settings?.large_loss_threshold ?? 200,
    strategy_change_enabled: subscription?.alert_settings?.strategy_change_enabled ?? true,
    win_streak_enabled: subscription?.alert_settings?.win_streak_enabled ?? false,
    win_streak_count: subscription?.alert_settings?.win_streak_count ?? 5,
    loss_streak_enabled: subscription?.alert_settings?.loss_streak_enabled ?? true,
    loss_streak_count: subscription?.alert_settings?.loss_streak_count ?? 3
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.UserSubscription.update(subscription.id, {
        alert_settings: alerts
      });
      toast.success('Alert settings saved successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to save alert settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-400" />
            Alert Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* High Profit Alert */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <Label>High Profit Alert</Label>
              </div>
              <Switch
                checked={alerts.high_profit_enabled}
                onCheckedChange={(checked) => setAlerts({ ...alerts, high_profit_enabled: checked })}
              />
            </div>
            {alerts.high_profit_enabled && (
              <div>
                <Label className="text-slate-400 text-xs mb-2">Threshold ($)</Label>
                <Input
                  type="number"
                  value={alerts.high_profit_threshold}
                  onChange={(e) => setAlerts({ ...alerts, high_profit_threshold: Number(e.target.value) })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            )}
          </div>

          {/* Large Loss Alert */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-400" />
                <Label>Large Loss Alert</Label>
              </div>
              <Switch
                checked={alerts.large_loss_enabled}
                onCheckedChange={(checked) => setAlerts({ ...alerts, large_loss_enabled: checked })}
              />
            </div>
            {alerts.large_loss_enabled && (
              <div>
                <Label className="text-slate-400 text-xs mb-2">Threshold ($)</Label>
                <Input
                  type="number"
                  value={alerts.large_loss_threshold}
                  onChange={(e) => setAlerts({ ...alerts, large_loss_threshold: Number(e.target.value) })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            )}
          </div>

          {/* Strategy Change Alert */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <Label>Strategy Change Alert</Label>
                  <p className="text-xs text-slate-400">Notify when AI adjusts strategy parameters</p>
                </div>
              </div>
              <Switch
                checked={alerts.strategy_change_enabled}
                onCheckedChange={(checked) => setAlerts({ ...alerts, strategy_change_enabled: checked })}
              />
            </div>
          </div>

          {/* Win Streak Alert */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <Label>Win Streak Alert</Label>
              </div>
              <Switch
                checked={alerts.win_streak_enabled}
                onCheckedChange={(checked) => setAlerts({ ...alerts, win_streak_enabled: checked })}
              />
            </div>
            {alerts.win_streak_enabled && (
              <div>
                <Label className="text-slate-400 text-xs mb-2">Consecutive Wins</Label>
                <Input
                  type="number"
                  value={alerts.win_streak_count}
                  onChange={(e) => setAlerts({ ...alerts, win_streak_count: Number(e.target.value) })}
                  className="bg-slate-700 border-slate-600"
                  min={2}
                />
              </div>
            )}
          </div>

          {/* Loss Streak Alert */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-400" />
                <Label>Loss Streak Alert</Label>
              </div>
              <Switch
                checked={alerts.loss_streak_enabled}
                onCheckedChange={(checked) => setAlerts({ ...alerts, loss_streak_enabled: checked })}
              />
            </div>
            {alerts.loss_streak_enabled && (
              <div>
                <Label className="text-slate-400 text-xs mb-2">Consecutive Losses</Label>
                <Input
                  type="number"
                  value={alerts.loss_streak_count}
                  onChange={(e) => setAlerts({ ...alerts, loss_streak_count: Number(e.target.value) })}
                  className="bg-slate-700 border-slate-600"
                  min={2}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button variant="outline" onClick={onClose} className="flex-1 border-slate-700" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500" disabled={saving}>
            {saving ? 'Saving...' : 'Save Alerts'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}