import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, Target } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/components/utils/translations';

export default function PortfolioForecasting({ trades, subscriptions, currentValue, language }) {
  const { t } = useTranslation(language);
  const [timeframe, setTimeframe] = useState('30');
  const [forecastData, setForecastData] = useState([]);
  
  useEffect(() => {
    generateForecast();
  }, [trades, subscriptions, timeframe, currentValue]);
  
  const generateForecast = () => {
    if (!trades || trades.length < 5) {
      setForecastData([]);
      return;
    }
    
    // Calculate average daily return
    const recentTrades = trades.slice(0, 50);
    const totalProfit = recentTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const avgDailyReturn = totalProfit / Math.max(1, recentTrades.length / 10); // Assume 10 trades per day
    
    // Calculate volatility
    const returns = recentTrades.map(t => t.profit_loss || 0);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Bot performance boost
    const activeBots = subscriptions?.filter(s => s.status === 'active').length || 0;
    const botMultiplier = 1 + (activeBots * 0.1); // 10% boost per active bot
    
    const days = parseInt(timeframe);
    const data = [];
    
    for (let day = 0; day <= days; day++) {
      const baseValue = currentValue + (avgDailyReturn * day * botMultiplier);
      const optimistic = baseValue + (stdDev * Math.sqrt(day) * 1.5);
      const pessimistic = baseValue - (stdDev * Math.sqrt(day) * 1.5);
      
      data.push({
        day,
        expected: Math.max(0, baseValue),
        optimistic: Math.max(0, optimistic),
        pessimistic: Math.max(0, pessimistic)
      });
    }
    
    setForecastData(data);
  };
  
  const finalExpected = forecastData.length > 0 ? forecastData[forecastData.length - 1].expected : 0;
  const expectedGrowth = currentValue > 0 ? ((finalExpected - currentValue) / currentValue * 100) : 0;
  
  const optimisticCase = forecastData.length > 0 ? forecastData[forecastData.length - 1].optimistic : 0;
  const pessimisticCase = forecastData.length > 0 ? forecastData[forecastData.length - 1].pessimistic : 0;
  
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t('portfolioForecasting')}
          </CardTitle>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="7">7 {t('days')}</SelectItem>
              <SelectItem value="30">30 {t('days')}</SelectItem>
              <SelectItem value="90">90 {t('days')}</SelectItem>
              <SelectItem value="180">180 {t('days')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {forecastData.length > 0 ? (
          <>
            {/* Forecast Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="optimisticGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="pessimisticGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155', 
                    borderRadius: '8px' 
                  }}
                  formatter={(value) => `$${value.toFixed(2)}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="optimistic" 
                  stroke="#10b981" 
                  fill="url(#optimisticGradient)" 
                  name={t('optimistic')}
                />
                <Area 
                  type="monotone" 
                  dataKey="expected" 
                  stroke="#3b82f6" 
                  fill="url(#expectedGradient)" 
                  strokeWidth={3}
                  name={t('expected')}
                />
                <Area 
                  type="monotone" 
                  dataKey="pessimistic" 
                  stroke="#ef4444" 
                  fill="url(#pessimisticGradient)" 
                  name={t('pessimistic')}
                />
              </AreaChart>
            </ResponsiveContainer>
            
            {/* Projections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 text-sm">{t('optimistic')}</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  ${optimisticCase.toFixed(2)}
                </div>
                <div className="text-sm text-green-300 mt-1">
                  +{((optimisticCase - currentValue) / currentValue * 100).toFixed(1)}%
                </div>
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300 text-sm">{t('expected')}</span>
                </div>
                <div className="text-2xl font-bold text-blue-400">
                  ${finalExpected.toFixed(2)}
                </div>
                <div className="text-sm text-blue-300 mt-1">
                  {expectedGrowth >= 0 ? '+' : ''}{expectedGrowth.toFixed(1)}%
                </div>
              </div>
              
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-red-400" />
                  <span className="text-red-300 text-sm">{t('pessimistic')}</span>
                </div>
                <div className="text-2xl font-bold text-red-400">
                  ${pessimisticCase.toFixed(2)}
                </div>
                <div className="text-sm text-red-300 mt-1">
                  {((pessimisticCase - currentValue) / currentValue * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-200">
                ℹ️ {t('forecastingInfo')}
              </p>
            </div>
          </>
        ) : (
          <div className="text-center text-slate-500 py-12">
            {t('notEnoughData')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}