import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/components/utils/translations';

export default function RiskExposure({ subscriptions, trades, language }) {
  const { t } = useTranslation(language);
  
  // Calculate risk metrics
  const calculateRiskMetrics = () => {
    const riskLevels = { low: 0, medium: 0, high: 0, extreme: 0 };
    
    subscriptions.forEach(sub => {
      const level = sub.risk_level || 'medium';
      riskLevels[level]++;
    });
    
    return [
      { level: t('low'), count: riskLevels.low, color: '#10b981' },
      { level: t('medium'), count: riskLevels.medium, color: '#f59e0b' },
      { level: t('high'), count: riskLevels.high, color: '#ef4444' },
      { level: t('extreme'), count: riskLevels.extreme, color: '#dc2626' }
    ];
  };
  
  // Calculate volatility
  const calculateVolatility = () => {
    if (trades.length < 10) return 0;
    
    const returns = [];
    for (let i = 1; i < trades.length; i++) {
      const prevTrade = trades[i - 1];
      const currTrade = trades[i];
      if (prevTrade.total_value && currTrade.total_value) {
        returns.push((currTrade.total_value - prevTrade.total_value) / prevTrade.total_value);
      }
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100;
  };
  
  // Calculate max drawdown
  const calculateMaxDrawdown = () => {
    if (trades.length === 0) return 0;
    
    let maxProfit = 0;
    let maxDrawdown = 0;
    let runningProfit = 0;
    
    trades.forEach(trade => {
      runningProfit += trade.profit_loss || 0;
      maxProfit = Math.max(maxProfit, runningProfit);
      const drawdown = maxProfit - runningProfit;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });
    
    return maxDrawdown;
  };
  
  // Calculate Sharpe ratio
  const calculateSharpeRatio = () => {
    if (trades.length < 10) return 0;
    
    const returns = trades.map(t => t.profit_loss || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? (avgReturn / stdDev) : 0;
  };
  
  const riskData = calculateRiskMetrics();
  const volatility = calculateVolatility();
  const maxDrawdown = calculateMaxDrawdown();
  const sharpeRatio = calculateSharpeRatio();
  
  // Calculate overall risk score (0-100)
  const riskScore = Math.min(100, (
    (riskData.find(r => r.level === t('high'))?.count || 0) * 25 +
    (riskData.find(r => r.level === t('extreme'))?.count || 0) * 35 +
    (volatility * 2) +
    (maxDrawdown / 10)
  ));
  
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5" />
          {t('riskExposure')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Risk Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400">{t('overallRisk')}</span>
            <span className={`font-semibold ${
              riskScore < 30 ? 'text-green-400' : 
              riskScore < 60 ? 'text-yellow-400' : 
              'text-red-400'
            }`}>
              {riskScore.toFixed(0)}/100
            </span>
          </div>
          <Progress 
            value={riskScore} 
            className="h-3"
          />
        </div>
        
        {/* Risk Distribution */}
        <div>
          <h4 className="text-white font-medium mb-3">{t('riskDistribution')}</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={riskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="level" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155', 
                  borderRadius: '8px' 
                }}
              />
              <Bar dataKey="count" fill="#3b82f6">
                {riskData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Risk Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('volatility')}</div>
            <div className="text-xl font-bold text-white">{volatility.toFixed(2)}%</div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('maxDrawdown')}</div>
            <div className="text-xl font-bold text-red-400">${maxDrawdown.toFixed(2)}</div>
          </div>
          
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-slate-400 text-sm mb-1">{t('sharpeRatio')}</div>
            <div className={`text-xl font-bold ${
              sharpeRatio > 1 ? 'text-green-400' : 
              sharpeRatio > 0 ? 'text-yellow-400' : 
              'text-red-400'
            }`}>
              {sharpeRatio.toFixed(2)}
            </div>
          </div>
        </div>
        
        {/* Risk Warning */}
        {riskScore > 70 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <div className="text-red-300 font-semibold mb-1">{t('highRiskWarning')}</div>
              <div className="text-sm text-red-200">
                {t('highRiskWarningText')}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}