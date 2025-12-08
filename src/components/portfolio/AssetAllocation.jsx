import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useTranslation } from '@/components/utils/translations';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AssetAllocation({ assets, miners, wallet, language }) {
  const { t } = useTranslation(language);
  
  const data = [];
  
  // Add crypto assets
  if (assets && assets.length > 0) {
    assets.forEach((asset, idx) => {
      data.push({
        name: asset.symbol,
        value: asset.value,
        percentage: 0,
        color: COLORS[idx % COLORS.length]
      });
    });
  }
  
  // Add fuel tokens
  if (wallet?.fuel_tokens > 0) {
    data.push({
      name: t('fuelTokens'),
      value: wallet.fuel_tokens * 0.5, // Assume $0.5 per token
      percentage: 0,
      color: '#eab308'
    });
  }
  
  // Add miners value
  if (miners && miners.length > 0) {
    const minersValue = miners.reduce((sum, m) => sum + (m.price || 0), 0);
    data.push({
      name: t('miners'),
      value: minersValue,
      percentage: 0,
      color: '#6366f1'
    });
  }
  
  // Calculate percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);
  data.forEach(item => {
    item.percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
  });
  
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white">{t('assetAllocation')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #334155', 
                    borderRadius: '8px' 
                  }}
                  formatter={(value) => `$${value.toFixed(2)}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="space-y-3">
            {data.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-white font-medium">{item.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">${item.value.toFixed(2)}</div>
                  <div className="text-sm text-slate-400">{item.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {total === 0 && (
          <div className="text-center text-slate-500 py-8">
            {t('noAssetsYet')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}