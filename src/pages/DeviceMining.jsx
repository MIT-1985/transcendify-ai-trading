import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Cpu, Zap, Play, Pause, TrendingUp, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

export default function DeviceMining() {
  const [isMining, setIsMining] = useState(false);
  const [miningProgress, setMiningProgress] = useState(0);
  const [sessionFuel, setSessionFuel] = useState(0);
  const [benchmark, setBenchmark] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet', user?.email],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      if (wallets.length === 0) {
        return await base44.entities.Wallet.create({});
      }
      return wallets[0];
    },
    enabled: !!user?.email
  });

  const { data: userMiners = [] } = useQuery({
    queryKey: ['userMiners', user?.email],
    queryFn: () => base44.entities.UserMiner.filter({ created_by: user.email }),
    enabled: !!user?.email
  });

  const updateWalletMutation = useMutation({
    mutationFn: async (fuelToAdd) => {
      await base44.entities.Wallet.update(wallet.id, {
        fuel_tokens: (wallet.fuel_tokens || 0) + fuelToAdd,
        last_fuel_generation: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    }
  });

  // Device benchmark on mount
  useEffect(() => {
    const runBenchmark = () => {
      const start = performance.now();
      let result = 0;
      for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i);
      }
      const duration = performance.now() - start;
      
      // Normalize benchmark (lower is better, so invert)
      const factor = Math.max(0.5, Math.min(2.0, 100 / duration));
      setBenchmark(factor);
      
      toast.success(`Device benchmark completed! Factor: ${factor.toFixed(2)}x`);
    };

    if (!benchmark) {
      runBenchmark();
    }
  }, [benchmark]);

  // Mining loop
  useEffect(() => {
    if (!isMining || !benchmark) return;

    const interval = setInterval(() => {
      setMiningProgress(prev => {
        if (prev >= 100) {
          // Complete mining cycle
          const totalMiners = userMiners.reduce((sum, m) => sum + (m.is_active ? 1 : 0), 0);
          const baseFuel = 0.1;
          const minerBonus = totalMiners * 0.05;
          const fuelGenerated = (baseFuel + minerBonus) * benchmark;
          
          setSessionFuel(prev => prev + fuelGenerated);
          updateWalletMutation.mutate(fuelGenerated);
          
          toast.success(`+${fuelGenerated.toFixed(3)} Fuel tokens mined!`);
          return 0;
        }
        return prev + 2;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isMining, benchmark, userMiners, updateWalletMutation]);

  const toggleMining = () => {
    if (!benchmark) {
      toast.error('Device benchmark in progress...');
      return;
    }
    setIsMining(!isMining);
    if (!isMining) {
      toast.info('Mining started! Keep this page open.');
    } else {
      toast.info('Mining paused.');
    }
  };

  const totalActiveMiners = userMiners.filter(m => m.is_active).length;
  const estimatedHourlyFuel = totalActiveMiners * 0.15 * (benchmark || 1);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Cpu className="w-8 h-8 text-blue-400" />
            Device Mining
          </h1>
          <p className="text-slate-400">Use your device to mine fuel tokens for trading bots</p>
        </div>

        {/* Mining Control */}
        <Card className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30 mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-slate-400 mb-1">Mining Status</div>
                <div className="text-2xl font-bold flex items-center gap-2">
                  {isMining ? (
                    <>
                      <span className="text-emerald-400">Active</span>
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    </>
                  ) : (
                    <span className="text-slate-400">Inactive</span>
                  )}
                </div>
              </div>
              <Button
                onClick={toggleMining}
                size="lg"
                className={isMining ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}
              >
                {isMining ? (
                  <>
                    <Pause className="w-5 h-5 mr-2" />
                    Stop Mining
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Start Mining
                  </>
                )}
              </Button>
            </div>

            {isMining && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Mining Progress</span>
                  <span className="text-white">{miningProgress.toFixed(0)}%</span>
                </div>
                <Progress value={miningProgress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <span className="text-sm text-slate-400">Device Performance</span>
              </div>
              <div className="text-2xl font-bold">
                {benchmark ? `${benchmark.toFixed(2)}x` : 'Calculating...'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <span className="text-sm text-slate-400">Session Fuel Mined</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">
                {sessionFuel.toFixed(3)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-slate-400">Est. Hourly Rate</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {estimatedHourlyFuel.toFixed(2)} /hr
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Balance */}
        {wallet && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Fuel Token Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-amber-400 mb-2">
                {wallet.fuel_tokens?.toFixed(3) || '0.000'} FUEL
              </div>
              <p className="text-sm text-slate-400">
                Used to power trading bots • {totalActiveMiners} active miners boosting generation
              </p>
            </CardContent>
          </Card>
        )}

        {/* Mining Info */}
        <Card className="bg-blue-500/10 border-blue-500/20 mt-6">
          <CardContent className="p-4">
            <div className="text-sm text-blue-300 space-y-2">
              <p><strong>How it works:</strong> Your device performs computational tasks to generate fuel tokens.</p>
              <p><strong>Optimization:</strong> Purchase miners from the Miners page to boost your fuel generation rate.</p>
              <p><strong>Usage:</strong> Fuel tokens are consumed by trading bots during operation.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}