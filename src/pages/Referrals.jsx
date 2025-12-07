import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, Copy, TrendingUp, Gift, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const COMMISSION_STRUCTURE = [
  { level: 1, rate: 10, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { level: 2, rate: 5, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { level: 3, rate: 2, color: 'text-purple-400', bg: 'bg-purple-500/20' }
];

export default function Referrals() {
  const [copied, setCopied] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals', user?.email],
    queryFn: () => base44.entities.Referral.filter({ referrer_email: user.email }),
    enabled: !!user
  });

  const referralCode = user?.email?.split('@')[0] || 'user';
  const referralLink = `${window.location.origin}?ref=${referralCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Referral link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const totalEarned = referrals.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);
  const activeReferrals = referrals.filter(r => r.status === 'active').length;

  const referralsByLevel = {
    1: referrals.filter(r => r.level === 1),
    2: referrals.filter(r => r.level === 2),
    3: referrals.filter(r => r.level === 3)
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold">Referral Program</h1>
          </div>
          <p className="text-slate-400">Earn commissions by inviting friends</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Total Earned</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {totalEarned.toLocaleString()} TFI
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Active Referrals</span>
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-3xl font-bold text-blue-400">
              {activeReferrals}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">Total Referrals</span>
              <Gift className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-3xl font-bold text-purple-400">
              {referrals.length}
            </div>
          </Card>
        </div>

        {/* Referral Link */}
        <Card className="bg-slate-900/50 border-slate-800 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Your Referral Link</h2>
          <div className="flex gap-3">
            <Input
              value={referralLink}
              readOnly
              className="bg-slate-800 border-slate-700 font-mono"
            />
            <Button
              onClick={copyToClipboard}
              className={cn(
                "gap-2 min-w-32",
                copied ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-500"
              )}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Commission Structure */}
        <Card className="bg-slate-900/50 border-slate-800 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-6">Commission Structure</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMMISSION_STRUCTURE.map((tier) => (
              <div
                key={tier.level}
                className={cn("p-5 rounded-xl border", tier.bg, `border-${tier.color.split('-')[1]}-500/30`)}
              >
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-2">Level {tier.level}</div>
                  <div className={cn("text-4xl font-bold mb-2", tier.color)}>
                    {tier.rate}%
                  </div>
                  <div className="text-sm text-slate-500">
                    {tier.level === 1 ? 'Direct referrals' :
                     tier.level === 2 ? 'Second level' :
                     'Third level'}
                  </div>
                  <div className={cn("text-2xl font-bold mt-3", tier.color)}>
                    {referralsByLevel[tier.level].length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">referrals</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* How it Works */}
        <Card className="bg-slate-900/50 border-slate-800 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-400 font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Share Your Link</h3>
                <p className="text-slate-400 text-sm">
                  Send your unique referral link to friends and colleagues
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">They Sign Up</h3>
                <p className="text-slate-400 text-sm">
                  When they register and start trading, you earn commissions
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Earn Passive Income</h3>
                <p className="text-slate-400 text-sm">
                  Get 10% from level 1, 5% from level 2, and 2% from level 3
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Referrals List */}
        <Card className="bg-slate-900/50 border-slate-800 p-6">
          <h2 className="text-xl font-semibold mb-6">Your Referrals</h2>
          <div className="space-y-3">
            {referrals.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No referrals yet</p>
                <p className="text-sm mt-2">Share your link to get started!</p>
              </div>
            ) : (
              referrals.map((ref) => {
                const levelConfig = COMMISSION_STRUCTURE.find(c => c.level === ref.level);
                return (
                  <div key={ref.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", levelConfig.bg)}>
                        <span className={cn("font-bold", levelConfig.color)}>L{ref.level}</span>
                      </div>
                      <div>
                        <div className="font-medium">{ref.referred_email}</div>
                        <div className="text-sm text-slate-500 capitalize">{ref.status}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-emerald-400">
                        +{ref.total_commission_earned?.toLocaleString() || 0} TFI
                      </div>
                      <div className="text-sm text-slate-500">{levelConfig.rate}% commission</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}