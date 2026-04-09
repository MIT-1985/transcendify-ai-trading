import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Zap, Shield, TrendingUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const strategyIcons = {
  scalping: Zap,
  swing: TrendingUp,
  arbitrage: Sparkles,
  grid: Bot,
  dca: Shield,
  momentum: TrendingUp
};

const riskColors = {
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  extreme: 'bg-red-500/20 text-red-400 border-red-500/30'
};

export default function BotCard({ bot, onSubscribe, isSubscribed }) {
  const [loading, setLoading] = useState(false);
  const Icon = strategyIcons[bot.strategy] || Bot;

  const handleSubscribe = async () => {
    // Check if running in iframe (preview)
    if (window.self !== window.top) {
      alert('Checkout works only from the published app. Please open the app in a new tab.');
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('stripeCheckout', {
        bot_id: bot.id,
        success_url: `${window.location.origin}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/Bots`,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error(res.data?.error || 'Failed to start checkout');
      }
    } catch (e) {
      toast.error('Checkout failed: ' + e.message);
    }
    setLoading(false);
  };
  
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl p-6 hover:border-blue-500/50 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Icon className="w-6 h-6 text-blue-400" />
        </div>
        <Badge className={cn("border", riskColors[bot.risk_level])}>
          {bot.risk_level} risk
        </Badge>
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2">{bot.name}</h3>
      <p className="text-slate-400 text-sm mb-4 line-clamp-2">{bot.description}</p>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Expected ROI</div>
          <div className="text-emerald-400 font-semibold">{bot.expected_roi}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Min Capital</div>
          <div className="text-white font-semibold">${bot.min_capital?.toLocaleString()}</div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-1 mb-4">
        {bot.supported_markets?.slice(0, 4).map((market, idx) => (
          <span key={idx} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
            {market}
          </span>
        ))}
        {bot.supported_markets?.length > 4 && (
          <span className="text-xs text-slate-500">+{bot.supported_markets.length - 4} more</span>
        )}
      </div>
      
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <div>
          <div className="text-2xl font-bold text-white">${bot.price}</div>
          {bot.monthly_fee > 0 && (
            <div className="text-xs text-slate-500">+${bot.monthly_fee}/month</div>
          )}
        </div>
        <Button 
          onClick={isSubscribed ? undefined : handleSubscribe}
          disabled={isSubscribed || loading}
          className={cn(
            "bg-blue-600 hover:bg-blue-500",
            isSubscribed && "bg-emerald-600 hover:bg-emerald-600"
          )}
        >
          {loading ? 'Loading...' : isSubscribed ? 'Active' : `Buy $${bot.price}`}
        </Button>
      </div>
    </div>
  );
}