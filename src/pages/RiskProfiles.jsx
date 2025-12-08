import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Edit, Trash2 } from 'lucide-react';
import RiskProfileModal from '@/components/risk/RiskProfileModal';
import { toast } from 'sonner';

export default function RiskProfiles() {
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['riskProfiles'],
    queryFn: () => base44.entities.RiskProfile.list('-created_date'),
    enabled: !!user
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RiskProfile.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskProfiles'] });
      toast.success('Profile deleted');
    }
  });

  const getRiskColor = (level) => {
    const colors = {
      conservative: 'bg-green-500/20 text-green-300 border-green-500/30',
      moderate: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      aggressive: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      ultra: 'bg-red-500/20 text-red-300 border-red-500/30'
    };
    return colors[level] || colors.moderate;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Shield className="w-8 h-8 text-blue-400" />
              Risk Profiles
            </h1>
            <p className="text-slate-400">
              Define risk management rules for automated trading
            </p>
          </div>
          <Button 
            onClick={() => {
              setEditingProfile(null);
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Profile
          </Button>
        </div>

        <div className="grid gap-4">
          {profiles.map(profile => (
            <Card key={profile.id} className="bg-slate-900 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3">
                    {profile.name}
                    <Badge className={getRiskColor(profile.risk_tolerance)} variant="outline">
                      {profile.risk_tolerance}
                    </Badge>
                    {profile.use_trok_optimization && (
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                        TROK Enabled
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setEditingProfile(profile);
                        setShowModal(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="border-slate-700"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate(profile.id)}
                      size="sm"
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400 mb-1">Max Position</div>
                    <div className="font-semibold">{(profile.max_position_size * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Daily Loss Limit</div>
                    <div className="font-semibold text-red-400">{(profile.max_daily_loss * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Max Drawdown</div>
                    <div className="font-semibold text-yellow-400">{(profile.max_drawdown * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Min Confidence</div>
                    <div className="font-semibold text-green-400">{(profile.min_confidence_threshold * 100).toFixed(0)}%</div>
                  </div>
                </div>
                
                <div className="mt-4 flex gap-4 text-xs text-slate-400">
                  <div>Orchestrator Approval: {profile.require_orchestrator_approval ? 'Required' : 'Not Required'}</div>
                  <div>•</div>
                  <div>Exchanges: {profile.allowed_exchanges?.join(', ') || 'None'}</div>
                </div>
              </CardContent>
            </Card>
          ))}

          {profiles.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No risk profiles created. Create one to enable automated trading.
            </div>
          )}
        </div>

        <RiskProfileModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          profile={editingProfile}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['riskProfiles'] });
            setShowModal(false);
          }}
        />
      </div>
    </div>
  );
}