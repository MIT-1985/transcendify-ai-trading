import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Search, Filter, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import BotCard from '@/components/trading/BotCard';
import BotConfigModal from '@/components/bots/BotConfigModal';

export default function Bots() {
  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selectedBot, setSelectedBot] = useState(null);
  
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: bots = [], isLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.TradingBot.list()
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions', user?.email],
    queryFn: () => base44.entities.UserSubscription.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 30000
  });

  const subscribeMutation = useMutation({
    mutationFn: async ({ bot, config }) => {
      const res = await base44.functions.invoke('stripeCheckout', {
        bot_id: bot.id,
        bot_config: config,
        success_url: `${window.location.origin}/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/Bots`,
      });
      if (res.data?.url) {
        window.open(res.data.url, '_blank');
      } else {
        throw new Error(res.data?.error || 'Failed to start checkout');
      }
    },
    onSuccess: () => {
      setSelectedBot(null);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const filteredBots = bots.filter(bot => {
    const matchesSearch = bot.name?.toLowerCase().includes(search.toLowerCase()) ||
                         bot.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStrategy = strategyFilter === 'all' || bot.strategy === strategyFilter;
    const matchesRisk = riskFilter === 'all' || bot.risk_level === riskFilter;
    return matchesSearch && matchesStrategy && matchesRisk;
  });

  const isSubscribed = (botId) => subscriptions.some(s => s.bot_id === botId && s.status === 'active');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold">Trading Bots</h1>
          </div>
          <p className="text-slate-400">Choose from our collection of AI-powered trading bots</p>
        </div>

        {/* Filters */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bots..."
                className="pl-9 bg-slate-800 border-slate-700"
              />
            </div>
            <div className="flex gap-3">
              <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="scalping">Scalping</SelectItem>
                  <SelectItem value="swing">Swing</SelectItem>
                  <SelectItem value="arbitrage">Arbitrage</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="dca">DCA</SelectItem>
                  <SelectItem value="momentum">Momentum</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-36 bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Risk" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Risks</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="extreme">Extreme</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Bots Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-80 bg-slate-800" />
            ))}
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
            <Bot className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Bots Found</h3>
            <p className="text-slate-400">
              {bots.length === 0 
                ? 'No trading bots available yet' 
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBots.map(bot => (
              <BotCard
                key={bot.id}
                bot={bot}
                onSubscribe={setSelectedBot}
                isSubscribed={isSubscribed(bot.id)}
              />
            ))}
          </div>
        )}

        {/* Bot Configuration Modal */}
        <BotConfigModal
          bot={selectedBot}
          isOpen={!!selectedBot}
          onClose={() => setSelectedBot(null)}
          onSubscribe={(config) => subscribeMutation.mutate({ bot: selectedBot, config })}
        />
      </div>
    </div>
  );
}