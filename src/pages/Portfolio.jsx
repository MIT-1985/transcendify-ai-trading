import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, PieChart, Shield, Zap, LineChart } from 'lucide-react';
import AssetAllocation from '@/components/portfolio/AssetAllocation';
import RiskExposure from '@/components/portfolio/RiskExposure';
import StrategySimulator from '@/components/portfolio/StrategySimulator';
import PortfolioForecasting from '@/components/portfolio/PortfolioForecasting';
import { useTranslation } from '@/components/utils/translations';

export default function Portfolio() {
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
  const { t } = useTranslation(language);
  const [liveData, setLiveData] = useState([]);
  const [marketData, setMarketData] = useState([
    { symbol: 'BTC/USD', price: 67842.50, change: 2.34, holdings: 0.045, value: 3052.91 },
    { symbol: 'ETH/USD', price: 3456.78, change: -0.89, holdings: 1.2, value: 4148.14 },
    { symbol: 'SOL/USD', price: 178.45, change: 5.67, holdings: 8.5, value: 1516.83 }
  ]);

  const { data: trades = [] } = useQuery({
    queryKey: ['trades'],
    queryFn: () => base44.entities.Trade.list('-timestamp', 100)
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.UserSubscription.filter({ status: 'active' })
  });

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
    enabled: !!user?.email
  });

  const { data: miners = [] } = useQuery({
    queryKey: ['userMiners', user?.email],
    queryFn: async () => {
      const userMiners = await base44.entities.UserMiner.filter({ created_by: user.email });
      const minersData = await base44.entities.Miner.list();
      return userMiners.map(um => {
        const miner = minersData.find(m => m.id === um.miner_id);
        return { ...um, ...miner };
      });
    },
    enabled: !!user?.email
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
          <h1 className="text-3xl font-bold mb-2">{t('portfolio')}</h1>
          <p className="text-slate-400">
            {language === 'bg' 
              ? 'Представяне на портфолиото в реално време и активи'
              : language === 'de'
              ? 'Echtzeit-Portfolio-Performance und Bestände'
              : 'Real-time portfolio performance and holdings'}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-500 border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-100 text-sm mb-1">
                    {language === 'bg' ? 'Обща Стойност' : language === 'de' ? 'Gesamtwert' : 'Total Value'}
                  </div>
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
                  <div className="text-slate-400 text-sm mb-1">{t('totalTrades')}</div>
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
                  <div className="text-slate-400 text-sm mb-1">{t('winRate')}</div>
                  <div className="text-2xl font-bold text-white">{winRate}%</div>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="bg-slate-900/50 border border-slate-800 grid grid-cols-2 lg:grid-cols-6 w-full">
            <TabsTrigger value="performance">
              <LineChart className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Представяне' : language === 'de' ? 'Leistung' : 'Performance'}
            </TabsTrigger>
            <TabsTrigger value="allocation">
              <PieChart className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Активи' : language === 'de' ? 'Allokation' : 'Allocation'}
            </TabsTrigger>
            <TabsTrigger value="risk">
              <Shield className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Риск' : language === 'de' ? 'Risiko' : 'Risk'}
            </TabsTrigger>
            <TabsTrigger value="simulator">
              <Zap className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Симулатор' : language === 'de' ? 'Simulator' : 'Simulator'}
            </TabsTrigger>
            <TabsTrigger value="forecast">
              <TrendingUp className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Прогноза' : language === 'de' ? 'Prognose' : 'Forecast'}
            </TabsTrigger>
            <TabsTrigger value="trades">
              <Activity className="w-4 h-4 mr-2" />
              {language === 'bg' ? 'Сделки' : language === 'de' ? 'Trades' : 'Trades'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">
                  {language === 'bg' ? 'Представяне на Портфолио' : language === 'de' ? 'Portfolio-Leistung' : 'Portfolio Performance'}
                </CardTitle>
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
                    {language === 'bg' 
                      ? 'Все още няма данни за търговия. Започнете търговия, за да видите представянето си.'
                      : language === 'de'
                      ? 'Noch keine Handelsdaten verfügbar. Beginnen Sie mit dem Handel, um Ihre Leistung zu sehen.'
                      : 'No trading data available yet. Start trading to see your performance.'}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allocation">
            <AssetAllocation 
              assets={marketData} 
              miners={miners}
              wallet={wallet}
              language={language}
            />
          </TabsContent>

          <TabsContent value="risk">
            <RiskExposure 
              subscriptions={subscriptions}
              trades={trades}
              language={language}
            />
          </TabsContent>

          <TabsContent value="simulator">
            <StrategySimulator language={language} />
          </TabsContent>

          <TabsContent value="forecast">
            <PortfolioForecasting 
              trades={trades}
              subscriptions={subscriptions}
              currentValue={totalValue}
              language={language}
            />
          </TabsContent>

          <TabsContent value="trades">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">
                  {language === 'bg' ? 'Скорошни Сделки' : language === 'de' ? 'Letzte Trades' : 'Recent Trades'}
                </CardTitle>
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