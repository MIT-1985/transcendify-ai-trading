import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TrendingUp, Settings, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const AVAILABLE_INDICATORS = [
  { id: 'rsi', name: 'RSI', params: [{ name: 'period', default: 14, label: 'Period' }] },
  { id: 'macd', name: 'MACD', params: [] },
  { id: 'bollinger', name: 'Bollinger Bands', params: [{ name: 'period', default: 20, label: 'Period' }, { name: 'stdDev', default: 2, label: 'Std Dev' }] },
  { id: 'ema', name: 'EMA', params: [{ name: 'period', default: 20, label: 'Period' }] },
  { id: 'sma', name: 'SMA', params: [{ name: 'period', default: 50, label: 'Period' }] },
  { id: 'stochastic', name: 'Stochastic', params: [{ name: 'k', default: 14, label: '%K Period' }, { name: 'd', default: 3, label: '%D Period' }] },
  { id: 'atr', name: 'ATR', params: [{ name: 'period', default: 14, label: 'Period' }] },
  { id: 'obv', name: 'OBV', params: [] },
  { id: 'ichimoku', name: 'Ichimoku Cloud', params: [] },
  { id: 'vwap', name: 'VWAP', params: [] }
];

export default function AdvancedIndicators({ onIndicatorsChange }) {
  const [activeIndicators, setActiveIndicators] = useState([]);

  const toggleIndicator = (indicatorId) => {
    const indicator = AVAILABLE_INDICATORS.find(i => i.id === indicatorId);
    
    if (activeIndicators.some(i => i.id === indicatorId)) {
      const updated = activeIndicators.filter(i => i.id !== indicatorId);
      setActiveIndicators(updated);
      if (onIndicatorsChange) onIndicatorsChange(updated);
    } else {
      const params = {};
      indicator.params.forEach(p => {
        params[p.name] = p.default;
      });
      const updated = [...activeIndicators, { ...indicator, params }];
      setActiveIndicators(updated);
      if (onIndicatorsChange) onIndicatorsChange(updated);
    }
  };

  const updateParams = (indicatorId, paramName, value) => {
    const updated = activeIndicators.map(ind => {
      if (ind.id === indicatorId) {
        return { ...ind, params: { ...ind.params, [paramName]: value } };
      }
      return ind;
    });
    setActiveIndicators(updated);
    if (onIndicatorsChange) onIndicatorsChange(updated);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-400" />
          Technical Indicators
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Active Indicators */}
          {activeIndicators.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-400 mb-2">Active Indicators</div>
              <div className="flex flex-wrap gap-2">
                {activeIndicators.map(ind => (
                  <Badge key={ind.id} className="bg-purple-500/20 text-purple-300">
                    {ind.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Indicator List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {AVAILABLE_INDICATORS.map(indicator => {
              const isActive = activeIndicators.some(i => i.id === indicator.id);
              const activeInd = activeIndicators.find(i => i.id === indicator.id);
              
              return (
                <div key={indicator.id} className="bg-slate-800/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-white">{indicator.name}</Label>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => toggleIndicator(indicator.id)}
                    />
                  </div>
                  
                  {isActive && indicator.params.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {indicator.params.map(param => (
                        <div key={param.name}>
                          <Label className="text-xs text-slate-400">{param.label}</Label>
                          <Input
                            type="number"
                            value={activeInd?.params?.[param.name] || param.default}
                            onChange={(e) => updateParams(indicator.id, param.name, Number(e.target.value))}
                            className="bg-slate-700 border-slate-600 h-8"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}