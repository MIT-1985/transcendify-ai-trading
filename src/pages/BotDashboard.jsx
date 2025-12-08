import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Bot, 
  PlayCircle, 
  PauseCircle, 
  StopCircle, 
  Eye,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  Copy,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

export default function BotDashboard() {
  const queryClient = useQueryClient();
  const [selectedBots, setSelectedBots] = useState(new Set());

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['userSubscriptions'],
    queryFn: () => base44.entities.UserSubscription.filter({ created_by: user?.email }),
    enabled: !!user,
    refetchInterval: 3000
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['tradingBots'],
    queryFn: () => base44.entities.TradingBot.list()
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.UserSubscription.update(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('Bot status updated');
    }
  });

  const cloneMutation = useMutation({
    mutationFn: async (subscription) => {
      const { id, created_date, updated_date, created_by, ...config } = subscription;
      await base44.entities.UserSubscription.create({
        ...config,
        status: 'paused',
        total_profit: 0,
        total_trades: 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('Bot cloned successfully');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.UserSubscription.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSubscriptions'] });
      toast.success('Bot deleted');
    }
  });

  const getBotInfo = (botId) => {
    return bots.find(b => b.id === botId) || {};
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-500/20 text-green-300 border-green-500/30',
      paused: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      expired: 'bg-red-500/20 text-red-300 border-red-500/30',
      cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
    return colors[status] || colors.cancelled;
  };

  const calculateROI = (subscription) => {
    if (!subscription.capital_allocated || subscription.capital_allocated === 0) return 0;
    return ((subscription.total_profit || 0) / subscription.capital_allocated) * 100;
  };

  const totalProfit = subscriptions.reduce((sum, s) => sum + (s.total_profit || 0), 0);
  const totalTrades = subscriptions.reduce((sum, s) => sum + (s.total_trades || 0), 0);
  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const totalCapital = subscriptions.reduce((sum, s) => sum + (s.capital_allocated || 0), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex items-center justify-center">
        <div className="text-slate-400">Loading bot dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Bot className="w-8 h-8 text-blue-400" />
            Bot Dashboard
          </h1>
          <p className="text-slate-400">
            Manage and monitor all your trading bots
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Active Bots</div>
                  <div className="text-2xl font-bold">{activeCount}</div>
                </div>
                <Activity className="w-10 h-10 text-green-400 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Profit</div>
                  <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${totalProfit.toFixed(2)}
                  </div>
                </div>
                {totalProfit >= 0 ? (
                  <TrendingUp className="w-10 h-10 text-green-400 opacity-20" />
                ) : (
                  <TrendingDown className="w-10 h-10 text-red-400 opacity-20" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Trades</div>
                  <div className="text-2xl font-bold">{totalTrades}</div>
                </div>
                <BarChart3 className="w-10 h-10 text-blue-400 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Total Capital</div>
                  <div className="text-2xl font-bold">${totalCapital.toLocaleString()}</div>
                </div>
                <DollarSign className="w-10 h-10 text-purple-400 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bots Grid */}
        {subscriptions.length === 0 ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="py-12 text-center">
              <Bot className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No bots configured yet</p>
              <Link to={createPageUrl('Bots')}>
                <Button className="bg-blue-600 hover:bg-blue-500">
                  Subscribe to a Bot
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subscriptions.map(subscription => {
              const botInfo = getBotInfo(subscription.bot_id);
              const roi = calculateROI(subscription);
              const runtime = subscription.start_date 
                ? Math.floor((new Date() - new Date(subscription.start_date)) / (1000 * 60 * 60 * 24))
                : 0;

              return (
                <Card key={subscription.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Bot className="w-5 h-5 text-blue-400" />
                        {botInfo.name || 'Bot'}
                      </CardTitle>
                      <Badge className={getStatusColor(subscription.status)} variant="outline">
                        {subscription.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-slate-400">
                      {botInfo.strategy} • {subscription.trading_pairs?.join(', ') || 'N/A'}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Profit/Loss</div>
                        <div className={`text-lg font-bold ${(subscription.total_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${(subscription.total_profit || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">ROI</div>
                        <div className={`text-lg font-bold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {roi.toFixed(2)}%
                        </div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Trades</div>
                        <div className="text-lg font-bold">{subscription.total_trades || 0}</div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Capital</div>
                        <div className="text-lg font-bold">${(subscription.capital_allocated || 0).toLocaleString()}</div>
                      </div>
                    </div>

                    {runtime > 0 && (
                      <div className="text-xs text-slate-400 text-center">
                        Running for {runtime} day{runtime !== 1 ? 's' : ''}
                      </div>
                    )}

                    {/* Controls */}
                    <div className="flex gap-2">
                      {subscription.status === 'active' ? (
                        <Button
                          onClick={() => updateStatusMutation.mutate({ id: subscription.id, status: 'paused' })}
                          size="sm"
                          variant="outline"
                          className="flex-1 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20"
                        >
                          <PauseCircle className="w-4 h-4 mr-1" />
                          Pause
                        </Button>
                      ) : (
                        <Button
                          onClick={() => updateStatusMutation.mutate({ id: subscription.id, status: 'active' })}
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-500"
                        >
                          <PlayCircle className="w-4 h-4 mr-1" />
                          Start
                        </Button>
                      )}
                      
                      <Link to={createPageUrl('BotRunner') + `?id=${subscription.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>

                    {/* Secondary Actions */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => cloneMutation.mutate(subscription)}
                        size="sm"
                        variant="outline"
                        className="flex-1 border-slate-600 text-slate-300"
                        disabled={cloneMutation.isPending}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Clone
                      </Button>
                      <Button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this bot?')) {
                            deleteMutation.mutate(subscription.id);
                          }
                        }}
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-300 hover:bg-red-500/20"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}