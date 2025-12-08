import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';

export default function Portfolio() {
  const [liveData, setLiveData] = useState([]);
  const [marketData, setMarketData] = useState([
    { symbol: 'BTC/USD', price: 67842.50, change: 2.34, holdings: 0.045, value: 3052.91 },
    { symbol: 'ETH/USD', price: 3456.78, change: -0.89, holdings: 1.2, value: 4148.14 },
    { symbol: 'SOL/USD', price: 178.45, change: 5.67, holdings: 8.5, value: 1516.83 }
  ]);

  const { data: trades = [] } = useQuery({
    queryKey: ['trades'],
    queryFn: () => base44.entities.Trade.list('-timestamp', 50)
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.UserSubscription.filter({ status: 'active' })
  });

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketData(prev => prev.map(asset => {
        const newPrice = asset.price * (1 + (Math.random() - 0.5) * 0.002);
        return {
          ...asset,
          price: newPrice,
          change: asset.change + (Math.random() - 0.5) * 0.2,
          value: asset.holdings * newPrice
        };
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Build portfolio performance chart
  useEffect(() => {
    if (trades.length > 0) {
      const chartData = [];
      let runningProfit = 0;
      
      trades.slice().reverse().forEach((trade, idx) => {
        runningProfit += trade.profit_loss || 0;
        chartData.push({
          index: idx + 1,
          profit: runningProfit,
          time: new Date(trade.timestamp).toLocaleTimeString()
        });
      });
      
      setLiveData(chartData);
    }
  }, [trades]);

  const totalValue = marketData.reduce((sum, asset) => sum + asset.value, 0);
  const totalPnL = marketData.reduce((sum, asset) => sum + (asset.value * asset.change / 100), 0);
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => (t.profit_loss || 0) > 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
          <p className="text-slate-400">Real-time portfolio performance and holdings</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-500 border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-100 text-sm mb-1">Total Value</div>
                  <div className="text-2xl font-bold text-white">${totalValue.toFixed(2)}</div>
                </div>
                <DollarSign className="w-8 h-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-0 ${totalPnL >= 0 ? 'bg-gradient-to-br from-emerald-600 to-emerald-500' : 'bg-gradient-to-br from-red-600 to-red-500'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm mb-1 ${totalPnL >= 0 ? 'text-emerald-100' : 'text-red-100'}`}>24h P&L</div>
                  <div className="text-2xl font-bold text-white">
                    {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                  </div>
                </div>
                {totalPnL >= 0 ? (
                  <TrendingUp className="w-8 h-8 text-emerald-200" />
                ) : (
                  <TrendingDown className="w-8 h-8 text-red-200" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Total Trades</div>
                  <div className="text-2xl font-bold text-white">{totalTrades}</div>
                </div>
                <Activity className="w-8 h-8 text-slate-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-400 text-sm mb-1">Win Rate</div>
                  <div className="text-2xl font-bold text-white">{winRate}%</div>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="bg-slate-900/50 border border-slate-800">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="trades">Recent Trades</TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Portfolio Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {liveData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={liveData}>
                      <defs>
                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="index" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#cbd5e1' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="profit" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#profitGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-slate-500">
                    No trading data available yet. Start trading to see your performance.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="holdings">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Current Holdings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {marketData.map((asset) => (
                    <div key={asset.symbol} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                      <div>
                        <div className="font-semibold text-white">{asset.symbol}</div>
                        <div className="text-sm text-slate-400">
                          {asset.holdings.toFixed(4)} × ${asset.price.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">${asset.value.toFixed(2)}</div>
                        <div className={`text-sm flex items-center gap-1 justify-end ${
                          asset.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {asset.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {asset.change >= 0 ? '+' : ''}{asset.change.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trades">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Recent Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {trades.slice(0, 20).map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <div className="font-semibold text-white">{trade.symbol}</div>
                        <div className="text-xs text-slate-400">
                          {trade.side} • {trade.quantity} @ ${trade.price.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${
                          (trade.profit_loss || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {(trade.profit_loss || 0) >= 0 ? '+' : ''}${(trade.profit_loss || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(trade.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}