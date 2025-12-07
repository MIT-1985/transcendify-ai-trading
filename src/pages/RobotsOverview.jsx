import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, TrendingUp, TrendingDown, DollarSign, Zap, Activity } from 'lucide-react';
import { createPageUrl } from '../utils';

export default function RobotsOverview() {
  const { data: subscriptions = [] } = useQuery({
    queryKey: ['userSubscriptions'],
    queryFn: () => base44.entities.UserSubscription.list(),
    refetchInterval: 3000
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.TradingBot.list()
  });

  const { data: allTrades = [] } = useQuery({
    queryKey: ['allTrades'],
    queryFn: () => base44.entities.Trade.list('-timestamp', 100),
    refetchInterval: 2000
  });

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const totalProfit = subscriptions.reduce((sum, s) => sum + (s.total_profit || 0), 0);
  const totalTrades = subscriptions.reduce((sum, s) => sum + (s.total_trades || 0), 0);
  const winningTrades = allTrades.filter(t => t.profit_loss > 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Robots Overview</h1>
          <p className="text-slate-400">Monitor all active trading robots and their performance</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{activeSubscriptions.length}</div>
                  <div className="text-xs text-slate-500">Active Robots</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg ${totalProfit >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
                  <DollarSign className={`w-6 h-6 ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${totalProfit.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500">Total Profit/Loss</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{totalTrades}</div>
                  <div className="text-xs text-slate-500">Total Trades</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg ${winRate > 50 ? 'bg-green-500/20' : 'bg-amber-500/20'} flex items-center justify-center`}>
                  <TrendingUp className={`w-6 h-6 ${winRate > 50 ? 'text-green-400' : 'text-amber-400'}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{winRate.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">Win Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Robots */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Active Trading Robots
          </h2>
          
          {activeSubscriptions.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="py-12 text-center">
                <Bot className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No active robots. Start a bot from the Bots page.</p>
                <Button 
                  onClick={() => window.location.href = createPageUrl('Bots')}
                  className="mt-4 bg-blue-600 hover:bg-blue-500"
                >
                  Browse Bots
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSubscriptions.map((sub) => {
                const bot = bots.find(b => b.id === sub.bot_id);
                const robotTrades = allTrades.filter(t => t.subscription_id === sub.id);
                const lastTrade = robotTrades[0];
                
                return (
                  <Card key={sub.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Bot className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <div className="text-base">{bot?.name || 'Robot'}</div>
                            <div className="text-xs text-slate-500 font-normal">{bot?.strategy}</div>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          Running
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Profit */}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-500">Profit/Loss</span>
                          <span className={`text-lg font-bold ${
                            (sub.total_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {(sub.total_profit || 0) >= 0 ? '+' : ''}${(sub.total_profit || 0).toFixed(2)}
                          </span>
                        </div>

                        {/* Trades */}
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-500">Total Trades</span>
                          <span className="text-white font-semibold">{sub.total_trades || 0}</span>
                        </div>

                        {/* Last Trade */}
                        {lastTrade && (
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <div className="text-xs text-slate-500 mb-1">Last Trade</div>
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-medium ${
                                lastTrade.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {lastTrade.side} ${lastTrade.price.toFixed(2)}
                              </span>
                              <span className={`text-xs ${
                                lastTrade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {lastTrade.profit_loss >= 0 ? '+' : ''}${lastTrade.profit_loss.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => window.location.href = createPageUrl('BotRunner') + '?id=' + sub.id}
                          className="w-full bg-blue-600 hover:bg-blue-500"
                        >
                          Open Dashboard
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Trades */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Recent Trades (All Robots)
          </h2>
          
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              {allTrades.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No trades yet</div>
              ) : (
                <div className="space-y-2">
                  {allTrades.slice(0, 20).map((trade) => {
                    const sub = subscriptions.find(s => s.id === trade.subscription_id);
                    const bot = bots.find(b => b.id === sub?.bot_id);
                    
                    return (
                      <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${
                            trade.side === 'BUY' ? 'bg-green-500/20' : 'bg-red-500/20'
                          } flex items-center justify-center`}>
                            {trade.side === 'BUY' ? (
                              <TrendingUp className="w-4 h-4 text-green-400" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{bot?.name || 'Robot'} • {trade.symbol}</div>
                            <div className="text-xs text-slate-500">
                              {trade.side} {trade.quantity.toFixed(4)} @ ${trade.price.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${
                            trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}