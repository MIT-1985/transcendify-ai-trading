import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/components/utils/translations';

export default function StrategySimulator({ language }) {
  const { t } = useTranslation(language);
  const [simulationData, setSimulationData] = useState([]);
  const [config, setConfig] = useState({
    initialCapital: 10000,
    strategy: 'scalping',
    riskLevel: 'medium',
    duration: 30,
    winRate: 60
  });
  
  const runSimulation = () => {
    const data = [];
    let capital = config.initialCapital;
    
    const strategyParams = {
      scalping: { avgWin: 50, avgLoss: 30, tradesPerDay: 20 },
      swing: { avgWin: 200, avgLoss: 150, tradesPerDay: 3 },
      grid: { avgWin: 100, avgLoss: 80, tradesPerDay: 10 },
      dca: { avgWin: 150, avgLoss: 100, tradesPerDay: 5 },
      momentum: { avgWin: 300, avgLoss: 200, tradesPerDay: 4 }
    };
    
    const params = strategyParams[config.strategy];
    const riskMultiplier = config.riskLevel === 'low' ? 0.7 : config.riskLevel === 'high' ? 1.3 : 1;
    
    for (let day = 0; day <= config.duration; day++) {
      const trades = params.tradesPerDay;
      let dayProfit = 0;
      
      for (let i = 0; i < trades; i++) {
        const isWin = Math.random() * 100 < config.winRate;
        if (isWin) {
          dayProfit += params.avgWin * riskMultiplier;
        } else {
          dayProfit -= params.avgLoss * riskMultiplier;
        }
      }
      
      capital += dayProfit;
      
      data.push({
        day,
        capital: Math.max(0, capital),
        profit: capital - config.initialCapital
      });
    }
    
    setSimulationData(data);
  };
  
  const finalCapital = simulationData.length > 0 ? simulationData[simulationData.length - 1].capital : 0;
  const totalProfit = finalCapital - config.initialCapital;
  const roi = config.initialCapital > 0 ? ((totalProfit / config.initialCapital) * 100) : 0;
  
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">{t('strategySimulator')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-400 mb-2 block">{t('initialCapital')}</label>
            <Input
              type="number"
              value={config.initialCapital}
              onChange={(e) => setConfig({...config, initialCapital: Number(e.target.value)})}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          
          <div>
            <label className="text-sm text-slate-400 mb-2 block">{t('strategy')}</label>
            <Select value={config.strategy} onValueChange={(v) => setConfig({...config, strategy: v})}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="scalping">{t('scalping')}</SelectItem>
                <SelectItem value="swing">{t('swing')}</SelectItem>
                <SelectItem value="grid">{t('grid')}</SelectItem>
                <SelectItem value="dca">{t('dca')}</SelectItem>
                <SelectItem value="momentum">{t('momentum')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm text-slate-400 mb-2 block">{t('riskLevel')}</label>
            <Select value={config.riskLevel} onValueChange={(v) => setConfig({...config, riskLevel: v})}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="low">{t('low')}</SelectItem>
                <SelectItem value="medium">{t('medium')}</SelectItem>
                <SelectItem value="high">{t('high')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm text-slate-400 mb-2 block">{t('duration')} ({t('days')})</label>
            <Input
              type="number"
              value={config.duration}
              onChange={(e) => setConfig({...config, duration: Number(e.target.value)})}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          
          <div>
            <label className="text-sm text-slate-400 mb-2 block">{t('winRate')} (%)</label>
            <Input
              type="number"
              value={config.winRate}
              onChange={(e) => setConfig({...config, winRate: Number(e.target.value)})}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
          
          <div className="flex items-end gap-2">
            <Button onClick={runSimulation} className="flex-1 bg-blue-600 hover:bg-blue-500">
              <Play className="w-4 h-4 mr-2" />
              {t('simulate')}
            </Button>
            <Button 
              onClick={() => setSimulationData([])} 
              variant="outline"
              className="border-slate-700"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Results */}
        {simulationData.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">{t('finalBalance')}</div>
                <div className="text-2xl font-bold text-white">${finalCapital.toFixed(2)}</div>
              </div>
              
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">{t('totalProfit')}</div>
                <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                </div>
              </div>
              
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">{t('roi')}</div>
                <div className={`text-2xl font-bold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                </div>
              </div>
            </div>
            
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={simulationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155', 
                    borderRadius: '8px' 
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="capital" 
                  stroke="#3b82f6" 
                  name={t('capital')}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#10b981" 
                  name={t('profit')}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
            
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-200">
                ⚠️ {t('simulationDisclaimer')}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}