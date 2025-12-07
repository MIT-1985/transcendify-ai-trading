import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Crown, Check, Zap, TrendingUp, Percent, Shield, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VIP_BENEFITS } from '@/components/bots/VIPBenefitsCard';

const VIP_TIERS = [
  { 
    level: 'bronze', 
    name: 'Bronze VIP', 
    price: 50, 
    color: 'from-amber-600 to-amber-700',
    icon: Shield,
    features: [
      '10% trading fee discount',
      '5% profit boost on all bots',
      'Up to 5 active bots',
      'Priority support',
      'Bronze badge'
    ]
  },
  { 
    level: 'silver', 
    name: 'Silver VIP', 
    price: 150, 
    color: 'from-slate-400 to-slate-500',
    icon: Sparkles,
    features: [
      '20% trading fee discount',
      '10% profit boost on all bots',
      'Up to 10 active bots',
      'Advanced analytics',
      'Priority support',
      'Silver badge'
    ]
  },
  { 
    level: 'gold', 
    name: 'Gold VIP', 
    price: 300, 
    color: 'from-yellow-500 to-yellow-600',
    icon: Crown,
    features: [
      '30% trading fee discount',
      '15% profit boost on all bots',
      'Up to 15 active bots',
      'AI trading signals',
      'Advanced analytics',
      'VIP support channel',
      'Gold badge'
    ]
  },
  { 
    level: 'platinum', 
    name: 'Platinum VIP', 
    price: 600, 
    color: 'from-cyan-500 to-blue-500',
    icon: Zap,
    features: [
      '40% trading fee discount',
      '20% profit boost on all bots',
      'Up to 25 active bots',
      'Custom bot strategies',
      'AI trading signals',
      'Advanced analytics',
      'Dedicated account manager',
      'Platinum badge'
    ]
  },
  { 
    level: 'diamond', 
    name: 'Diamond VIP', 
    price: 1200, 
    color: 'from-purple-500 to-pink-500',
    icon: Crown,
    features: [
      '50% trading fee discount',
      '25% profit boost on all bots',
      'Unlimited active bots',
      'Custom bot development',
      'AI trading signals',
      'Real-time market insights',
      'Personal trading consultant',
      'Diamond badge + exclusive perks'
    ]
  }
];

export default function VIPUpgrade() {
  const [selectedTier, setSelectedTier] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
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

  const upgradeMutation = useMutation({
    mutationFn: async (tier) => {
      const tierData = VIP_TIERS.find(t => t.level === tier.level);
      
      if ((wallet.balance_tfi || 0) < tierData.price) {
        throw new Error('Insufficient TFI balance');
      }

      // Deduct payment
      await base44.entities.Wallet.update(wallet.id, {
        balance_tfi: wallet.balance_tfi - tierData.price,
        vip_level: tier.level
      });

      // Record transaction
      await base44.entities.Transaction.create({
        type: 'subscription_payment',
        amount: tierData.price,
        currency: 'TFI',
        status: 'completed',
        description: `VIP ${tier.name} upgrade`,
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success('VIP upgrade successful!');
      setShowConfirmDialog(false);
      setSelectedTier(null);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleUpgrade = (tier) => {
    setSelectedTier(tier);
    setShowConfirmDialog(true);
  };

  const confirmUpgrade = () => {
    upgradeMutation.mutate(selectedTier);
  };

  const currentVIPLevel = wallet?.vip_level || 'none';
  const currentVIPIndex = VIP_TIERS.findIndex(t => t.level === currentVIPLevel);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Crown className="w-8 h-8 text-yellow-400" />
            VIP Upgrades
          </h1>
          <p className="text-slate-400">Unlock exclusive benefits and boost your trading performance</p>
        </div>

        {/* Current Status */}
        {wallet && (
          <Card className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30 mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-2">Current VIP Status</div>
                  <div className="text-3xl font-bold flex items-center gap-3">
                    <Crown className="w-8 h-8 text-yellow-400" />
                    {VIP_BENEFITS[currentVIPLevel]?.name || 'Standard'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400 mb-2">Available Balance</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {wallet.balance_tfi?.toLocaleString() || 0} TFI
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* VIP Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {VIP_TIERS.map((tier, index) => {
            const Icon = tier.icon;
            const isCurrentTier = tier.level === currentVIPLevel;
            const isLowerTier = index <= currentVIPIndex;
            const canAfford = (wallet?.balance_tfi || 0) >= tier.price;

            return (
              <Card 
                key={tier.level}
                className={cn(
                  "border-2 transition-all",
                  isCurrentTier 
                    ? "border-emerald-500 bg-emerald-500/10" 
                    : isLowerTier
                    ? "border-slate-700 bg-slate-900/30 opacity-60"
                    : "border-slate-700 bg-slate-900/50 hover:border-blue-500/50"
                )}
              >
                <CardHeader>
                  <div className={cn(
                    "w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mb-4 mx-auto",
                    tier.color
                  )}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-center text-2xl">{tier.name}</CardTitle>
                  <div className="text-center">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-slate-400 ml-2">TFI</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {tier.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {isCurrentTier ? (
                    <Button disabled className="w-full bg-emerald-600">
                      <Check className="w-4 h-4 mr-2" />
                      Current Tier
                    </Button>
                  ) : isLowerTier ? (
                    <Button disabled className="w-full">
                      Already Unlocked
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(tier)}
                      disabled={!canAfford}
                      className={cn(
                        "w-full",
                        canAfford ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700"
                      )}
                    >
                      {canAfford ? 'Upgrade Now' : 'Insufficient Balance'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Benefits Comparison */}
        <Card className="bg-slate-900/50 border-slate-800 mt-8">
          <CardHeader>
            <CardTitle>VIP Benefits Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <Percent className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <div className="text-xs text-slate-400 mb-1">Fee Discount</div>
                <div className="text-lg font-bold">Up to 50%</div>
              </div>
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <div className="text-xs text-slate-400 mb-1">Profit Boost</div>
                <div className="text-lg font-bold">Up to 25%</div>
              </div>
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <Zap className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <div className="text-xs text-slate-400 mb-1">Active Bots</div>
                <div className="text-lg font-bold">Unlimited</div>
              </div>
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <Crown className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <div className="text-xs text-slate-400 mb-1">Exclusive</div>
                <div className="text-lg font-bold">Perks</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Confirm VIP Upgrade</DialogTitle>
          </DialogHeader>
          {selectedTier && (
            <div className="space-y-4">
              <div className={cn(
                "w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto",
                selectedTier.color
              )}>
                <selectedTier.icon className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold mb-2">{selectedTier.name}</div>
                <div className="text-3xl font-bold text-blue-400">{selectedTier.price} TFI</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-2">Your Balance After:</div>
                <div className="text-xl font-bold">
                  {((wallet?.balance_tfi || 0) - selectedTier.price).toLocaleString()} TFI
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 border-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmUpgrade}
                  disabled={upgradeMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-500"
                >
                  {upgradeMutation.isPending ? 'Processing...' : 'Confirm Upgrade'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}