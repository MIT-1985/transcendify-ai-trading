import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, Zap, TrendingUp, ShoppingCart, Power, Gauge, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const EFFICIENCY_CONFIG = {
  low: { color: 'text-slate-400', bg: 'bg-slate-500/20' },
  medium: { color: 'text-blue-400', bg: 'bg-blue-500/20' },
  high: { color: 'text-purple-400', bg: 'bg-purple-500/20' },
  ultra: { color: 'text-amber-400', bg: 'bg-amber-500/20' }
};

const MINING_CAP_MINUTES = 360; // 6 hours per day

export default function Miners() {
  const [selectedMiner, setSelectedMiner] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.email],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      return wallets[0];
    },
    enabled: !!user
  });

  const { data: miners = [] } = useQuery({
    queryKey: ['miners'],
    queryFn: () => base44.entities.Miner.list()
  });

  const { data: userMiners = [] } = useQuery({
    queryKey: ['userMiners', user?.email],
    queryFn: () => base44.entities.UserMiner.filter({ created_by: user.email }),
    enabled: !!user
  });

  const purchaseMutation = useMutation({
    mutationFn: async (miner) => {
      if (wallet.balance_tfi < miner.price) {
        throw new Error('Insufficient balance');
      }

      // Create user miner
      const userMiner = await base44.entities.UserMiner.create({
        miner_id: miner.id,
        purchase_date: new Date().toISOString().split('T')[0],
        is_active: true,
        total_fuel_generated: 0,
        active_minutes_today: 0,
        benchmark_factor: 0.7 + Math.random() * 0.6 // Random 0.7-1.3
      });

      // Deduct from wallet
      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: wallet.balance_tfi - miner.price
      });

      // Record transaction
      await base44.entities.Transaction.create({
        type: 'fuel_purchase',
        amount: miner.price,
        currency: 'TFI',
        status: 'completed',
        description: `Purchased ${miner.name}`,
        timestamp: new Date().toISOString()
      });

      return userMiner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMiners'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Miner purchased successfully!');
      setSelectedMiner(null);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const toggleMinerMutation = useMutation({
    mutationFn: async ({ userMiner, isActive }) => {
      return base44.entities.UserMiner.update(userMiner.id, {
        is_active: isActive,
        last_mining_time: isActive ? new Date().toISOString() : userMiner.last_mining_time
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMiners'] });
      toast.success('Miner status updated');
    }
  });

  // Simulate mining progress
  useEffect(() => {
    if (userMiners.length === 0) return;

    const interval = setInterval(async () => {
      const activeMiners = userMiners.filter(um => um.is_active);
      
      for (const userMiner of activeMiners) {
        const miner = miners.find(m => m.id === userMiner.miner_id);
        if (!miner) continue;

        const newMinutes = Math.min(userMiner.active_minutes_today + 1, MINING_CAP_MINUTES);
        const progressPct = newMinutes / MINING_CAP_MINUTES;
        const fuelGenerated = miner.daily_fuel_tokens * progressPct * userMiner.benchmark_factor;

        await base44.entities.UserMiner.update(userMiner.id, {
          active_minutes_today: newMinutes,
          total_fuel_generated: userMiner.total_fuel_generated + (miner.daily_fuel_tokens / 1440) * userMiner.benchmark_factor,
          last_mining_time: new Date().toISOString()
        });

        // Update wallet fuel
        if (wallet) {
          await base44.entities.Wallet.update(wallet.id, {
            fuel_tokens: wallet.fuel_tokens + (miner.daily_fuel_tokens / 1440) * userMiner.benchmark_factor
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['userMiners'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [userMiners, miners, wallet, queryClient]);

  const hasMiner = (minerId) => userMiners.some(um => um.miner_id === minerId);
  const totalDailyFuel = userMiners.reduce((sum, um) => {
    const miner = miners.find(m => m.id === um.miner_id);
    return sum + (miner?.daily_fuel_tokens || 0) * um.benchmark_factor;
  }, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <h1 className="text-3xl font-bold">Fuel Miners</h1>
          </div>
          <p className="text-slate-400">Purchase miners to generate fuel tokens for your bots</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Active Miners</span>
              <Power className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-3xl font-bold text-amber-400">
              {userMiners.filter(um => um.is_active).length}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Daily Fuel Output</span>
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-bold text-purple-400">
              {totalDailyFuel.toFixed(1)}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Total Generated</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {userMiners.reduce((s, um) => s + um.total_fuel_generated, 0).toFixed(1)}
            </div>
          </Card>
        </div>

        {/* Your Miners */}
        {userMiners.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Power className="w-5 h-5 text-amber-400" />
              Your Miners
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userMiners.map(userMiner => {
                const miner = miners.find(m => m.id === userMiner.miner_id);
                if (!miner) return null;

                const progress = (userMiner.active_minutes_today / MINING_CAP_MINUTES) * 100;
                const effConfig = EFFICIENCY_CONFIG[miner.efficiency];

                return (
                  <Card key={userMiner.id} className="bg-slate-900/50 border-slate-800 p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", effConfig.bg)}>
                          <Cpu className={cn("w-6 h-6", effConfig.color)} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{miner.name}</h3>
                          <span className="text-xs text-slate-500">Tier {miner.tier}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={userMiner.is_active ? "default" : "outline"}
                        onClick={() => toggleMinerMutation.mutate({ userMiner, isActive: !userMiner.is_active })}
                        className={cn(
                          "gap-2",
                          userMiner.is_active ? "bg-emerald-600 hover:bg-emerald-500" : ""
                        )}
                      >
                        <Power className="w-4 h-4" />
                        {userMiner.is_active ? 'ON' : 'OFF'}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Mining Progress</span>
                          <span className="text-amber-400">{userMiner.active_minutes_today} / {MINING_CAP_MINUTES} min</span>
                        </div>
                        <Progress value={progress} className="h-2 bg-slate-800" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">Daily Output</div>
                          <div className="text-purple-400 font-semibold">
                            {(miner.daily_fuel_tokens * userMiner.benchmark_factor).toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <div className="text-xs text-slate-500 mb-1">Efficiency</div>
                          <div className={cn("font-semibold", effConfig.color)}>
                            {(userMiner.benchmark_factor * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-500">
                        Total: {userMiner.total_fuel_generated.toFixed(1)} fuel
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Available Miners */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-400" />
            Available Miners
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {miners.map(miner => {
              const owned = hasMiner(miner.id);
              const effConfig = EFFICIENCY_CONFIG[miner.efficiency];

              return (
                <Card
                  key={miner.id}
                  className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 p-6 hover:border-amber-500/50 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center", effConfig.bg)}>
                      <Cpu className={cn("w-7 h-7", effConfig.color)} />
                    </div>
                    <Badge className={cn("border", effConfig.bg, effConfig.color)}>
                      Tier {miner.tier}
                    </Badge>
                  </div>

                  <h3 className="text-xl font-bold mb-2">{miner.name}</h3>

                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Daily Output</span>
                      <span className="text-purple-400 font-semibold flex items-center gap-1">
                        <Zap className="w-4 h-4" />
                        {miner.daily_fuel_tokens} fuel
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Hash Rate</span>
                      <span className="text-white font-semibold">{miner.hash_rate} MH/s</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Power</span>
                      <span className="text-white">{miner.power_consumption}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Efficiency</span>
                      <span className={cn("capitalize font-semibold", effConfig.color)}>
                        {miner.efficiency}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                    <div>
                      <div className="text-2xl font-bold text-white">{miner.price} TFI</div>
                      <div className="text-xs text-slate-500">≈ ${(miner.price * 0.5).toFixed(2)}</div>
                    </div>
                    <Button
                      onClick={() => setSelectedMiner(miner)}
                      disabled={owned}
                      className={cn(
                        owned ? "bg-emerald-600" : "bg-amber-600 hover:bg-amber-500"
                      )}
                    >
                      {owned ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Owned
                        </>
                      ) : (
                        'Purchase'
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Purchase Dialog */}
        <Dialog open={!!selectedMiner} onOpenChange={() => setSelectedMiner(null)}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>Purchase {selectedMiner?.name}</DialogTitle>
              <DialogDescription className="text-slate-400">
                Confirm your miner purchase
              </DialogDescription>
            </DialogHeader>

            {selectedMiner && (
              <div className="space-y-4 py-4">
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Price</span>
                    <span className="font-semibold">{selectedMiner.price} TFI</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Daily Fuel Output</span>
                    <span className="text-purple-400 font-semibold">{selectedMiner.daily_fuel_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Your Balance</span>
                    <span className="font-semibold">{wallet?.balance_tfi?.toLocaleString() || 0} TFI</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-slate-700">
                    <span className="text-slate-400">After Purchase</span>
                    <span className="font-semibold">
                      {((wallet?.balance_tfi || 0) - selectedMiner.price).toLocaleString()} TFI
                    </span>
                  </div>
                </div>

                {wallet?.balance_tfi < selectedMiner.price && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                    Insufficient balance. Please deposit more TFI.
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedMiner(null)}
                    className="flex-1 border-slate-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => purchaseMutation.mutate(selectedMiner)}
                    disabled={purchaseMutation.isPending || wallet?.balance_tfi < selectedMiner.price}
                    className="flex-1 bg-amber-600 hover:bg-amber-500"
                  >
                    {purchaseMutation.isPending ? 'Processing...' : 'Confirm Purchase'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}