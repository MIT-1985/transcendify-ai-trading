import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const RISK_PRESETS = {
  conservative: {
    max_position_size: 0.05,
    max_daily_loss: 0.02,
    max_drawdown: 0.10,
    min_confidence_threshold: 0.85,
    require_orchestrator_approval: true
  },
  moderate: {
    max_position_size: 0.10,
    max_daily_loss: 0.05,
    max_drawdown: 0.15,
    min_confidence_threshold: 0.75,
    require_orchestrator_approval: true
  },
  aggressive: {
    max_position_size: 0.20,
    max_daily_loss: 0.10,
    max_drawdown: 0.25,
    min_confidence_threshold: 0.65,
    require_orchestrator_approval: false
  },
  ultra: {
    max_position_size: 0.35,
    max_daily_loss: 0.15,
    max_drawdown: 0.35,
    min_confidence_threshold: 0.55,
    require_orchestrator_approval: false
  }
};

export default function RiskProfileModal({ isOpen, onClose, profile, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    risk_tolerance: 'moderate',
    max_position_size: 0.10,
    max_daily_loss: 0.05,
    max_drawdown: 0.15,
    require_orchestrator_approval: true,
    min_confidence_threshold: 0.75,
    use_trok_optimization: true,
    allowed_exchanges: ['binance']
  });

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (profile) {
        await base44.entities.RiskProfile.update(profile.id, formData);
      } else {
        await base44.entities.RiskProfile.create(formData);
      }
    },
    onSuccess: () => {
      toast.success(profile ? 'Profile updated' : 'Profile created');
      onSuccess();
    }
  });

  const applyPreset = (preset) => {
    setFormData({
      ...formData,
      ...RISK_PRESETS[preset],
      risk_tolerance: preset
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>{profile ? 'Edit' : 'Create'} Risk Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>Profile Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="My Risk Profile"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div>
            <Label>Risk Tolerance</Label>
            <Select
              value={formData.risk_tolerance}
              onValueChange={(v) => applyPreset(v)}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
                <SelectItem value="ultra">Ultra Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Position Size (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.max_position_size * 100}
                onChange={(e) => setFormData({...formData, max_position_size: parseFloat(e.target.value) / 100})}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label>Max Daily Loss (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.max_daily_loss * 100}
                onChange={(e) => setFormData({...formData, max_daily_loss: parseFloat(e.target.value) / 100})}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label>Max Drawdown (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.max_drawdown * 100}
                onChange={(e) => setFormData({...formData, max_drawdown: parseFloat(e.target.value) / 100})}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <div>
              <Label>Min AI Confidence (%)</Label>
              <Input
                type="number"
                step="1"
                value={formData.min_confidence_threshold * 100}
                onChange={(e) => setFormData({...formData, min_confidence_threshold: parseFloat(e.target.value) / 100})}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div>
                <div className="font-medium">TROK Optimization</div>
                <div className="text-xs text-slate-400">Use TROK constants for risk assessment</div>
              </div>
              <Switch
                checked={formData.use_trok_optimization}
                onCheckedChange={(v) => setFormData({...formData, use_trok_optimization: v})}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div>
                <div className="font-medium">Require Orchestrator Approval</div>
                <div className="text-xs text-slate-400">All trades need AI orchestrator approval</div>
              </div>
              <Switch
                checked={formData.require_orchestrator_approval}
                onCheckedChange={(v) => setFormData({...formData, require_orchestrator_approval: v})}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" className="flex-1 border-slate-700">
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!formData.name || saveMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-500"
            >
              {profile ? 'Update' : 'Create'} Profile
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}