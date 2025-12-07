import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Zap, TrendingUp, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';

const VIP_BENEFITS = {
  none: { 
    level: 0, 
    name: 'Standard', 
    color: 'text-slate-400',
    bgColor: 'from-slate-600 to-slate-700',
    feeDiscount: 0,
    profitBoost: 0,
    maxBots: 3
  },
  bronze: { 
    level: 1, 
    name: 'Bronze', 
    color: 'text-amber-600',
    bgColor: 'from-amber-600 to-amber-700',
    feeDiscount: 10,
    profitBoost: 5,
    maxBots: 5
  },
  silver: { 
    level: 2, 
    name: 'Silver', 
    color: 'text-slate-300',
    bgColor: 'from-slate-400 to-slate-500',
    feeDiscount: 20,
    profitBoost: 10,
    maxBots: 10
  },
  gold: { 
    level: 3, 
    name: 'Gold', 
    color: 'text-yellow-400',
    bgColor: 'from-yellow-500 to-yellow-600',
    feeDiscount: 30,
    profitBoost: 15,
    maxBots: 15
  },
  platinum: { 
    level: 4, 
    name: 'Platinum', 
    color: 'text-cyan-400',
    bgColor: 'from-cyan-500 to-blue-500',
    feeDiscount: 40,
    profitBoost: 20,
    maxBots: 25
  },
  diamond: { 
    level: 5, 
    name: 'Diamond', 
    color: 'text-purple-400',
    bgColor: 'from-purple-500 to-pink-500',
    feeDiscount: 50,
    profitBoost: 25,
    maxBots: 50
  }
};

export default function VIPBenefitsCard({ vipLevel = 'none', compact = false }) {
  const benefits = VIP_BENEFITS[vipLevel] || VIP_BENEFITS.none;

  if (compact) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r",
        benefits.bgColor
      )}>
        <Crown className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-sm">{benefits.name}</span>
      </div>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className={benefits.color} />
          VIP Benefits: {benefits.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Fee Discount</span>
            </div>
            <div className="text-xl font-bold text-emerald-400">-{benefits.feeDiscount}%</div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">Profit Boost</span>
            </div>
            <div className="text-xl font-bold text-blue-400">+{benefits.profitBoost}%</div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Max Active Bots</span>
          </div>
          <div className="text-xl font-bold text-white">{benefits.maxBots}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export { VIP_BENEFITS };