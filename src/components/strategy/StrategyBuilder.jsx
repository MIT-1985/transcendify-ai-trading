import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Activity, TrendingUp, Shield } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const INDICATORS = ['RSI', 'MACD', 'Bollinger Bands', 'SMA', 'EMA', 'Price'];
const CONDITIONS = ['greater than', 'less than', 'crosses above', 'crosses below', 'equals'];

export default function StrategyBuilder({ strategy, onChange }) {
  const addCondition = (type) => {
    const newCondition = { indicator: 'RSI', condition: 'greater than', value: 50 };
    const updated = { ...strategy };
    if (type === 'entry') {
      updated.entry_conditions = [...(strategy.entry_conditions || []), newCondition];
    } else {
      updated.exit_conditions = [...(strategy.exit_conditions || []), newCondition];
    }
    onChange(updated);
  };

  const removeCondition = (type, index) => {
    const updated = { ...strategy };
    if (type === 'entry') {
      updated.entry_conditions = strategy.entry_conditions.filter((_, i) => i !== index);
    } else {
      updated.exit_conditions = strategy.exit_conditions.filter((_, i) => i !== index);
    }
    onChange(updated);
  };

  const updateCondition = (type, index, field, value) => {
    const updated = { ...strategy };
    const conditions = type === 'entry' ? [...strategy.entry_conditions] : [...strategy.exit_conditions];
    conditions[index] = { ...conditions[index], [field]: value };
    if (type === 'entry') {
      updated.entry_conditions = conditions;
    } else {
      updated.exit_conditions = conditions;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Strategy Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Strategy Name</Label>
            <Input
              value={strategy.name || ''}
              onChange={(e) => onChange({ ...strategy, name: e.target.value })}
              placeholder="My Custom Strategy"
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={strategy.description || ''}
              onChange={(e) => onChange({ ...strategy, description: e.target.value })}
              placeholder="Describe your strategy..."
              className="bg-slate-800 border-slate-700"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="indicators" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 grid grid-cols-3">
          <TabsTrigger value="indicators">Indicators</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
        </TabsList>

        {/* Indicators Tab */}
        <TabsContent value="indicators">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="pt-6 space-y-4">
              {/* RSI */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>RSI (Relative Strength Index)</Label>
                  <Switch
                    checked={strategy.indicators?.rsi?.enabled}
                    onCheckedChange={(checked) => onChange({
                      ...strategy,
                      indicators: { ...strategy.indicators, rsi: { ...strategy.indicators?.rsi, enabled: checked } }
                    })}
                  />
                </div>
                {strategy.indicators?.rsi?.enabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-slate-400">Period</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.rsi?.period || 14}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, rsi: { ...strategy.indicators?.rsi, period: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Overbought</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.rsi?.overbought || 70}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, rsi: { ...strategy.indicators?.rsi, overbought: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Oversold</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.rsi?.oversold || 30}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, rsi: { ...strategy.indicators?.rsi, oversold: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* MACD */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>MACD</Label>
                  <Switch
                    checked={strategy.indicators?.macd?.enabled}
                    onCheckedChange={(checked) => onChange({
                      ...strategy,
                      indicators: { ...strategy.indicators, macd: { ...strategy.indicators?.macd, enabled: checked } }
                    })}
                  />
                </div>
                {strategy.indicators?.macd?.enabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-slate-400">Fast Period</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.macd?.fast || 12}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, macd: { ...strategy.indicators?.macd, fast: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Slow Period</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.macd?.slow || 26}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, macd: { ...strategy.indicators?.macd, slow: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Signal</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.macd?.signal || 9}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, macd: { ...strategy.indicators?.macd, signal: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bollinger Bands */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <Label>Bollinger Bands</Label>
                  <Switch
                    checked={strategy.indicators?.bollinger?.enabled}
                    onCheckedChange={(checked) => onChange({
                      ...strategy,
                      indicators: { ...strategy.indicators, bollinger: { ...strategy.indicators?.bollinger, enabled: checked } }
                    })}
                  />
                </div>
                {strategy.indicators?.bollinger?.enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-slate-400">Period</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.bollinger?.period || 20}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, bollinger: { ...strategy.indicators?.bollinger, period: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Std Dev</Label>
                      <Input
                        type="number"
                        value={strategy.indicators?.bollinger?.stdDev || 2}
                        onChange={(e) => onChange({
                          ...strategy,
                          indicators: { ...strategy.indicators, bollinger: { ...strategy.indicators?.bollinger, stdDev: Number(e.target.value) } }
                        })}
                        className="bg-slate-700 border-slate-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conditions Tab */}
        <TabsContent value="conditions">
          <div className="space-y-4">
            {/* Entry Conditions */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    Entry Conditions
                  </CardTitle>
                  <Button onClick={() => addCondition('entry')} size="sm" className="bg-green-600 hover:bg-green-500">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(strategy.entry_conditions || []).map((condition, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-800/50 p-3 rounded-lg">
                    <Select value={condition.indicator} onValueChange={(v) => updateCondition('entry', idx, 'indicator', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {INDICATORS.map(ind => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={condition.condition} onValueChange={(v) => updateCondition('entry', idx, 'condition', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {CONDITIONS.map(cond => <SelectItem key={cond} value={cond}>{cond}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition('entry', idx, 'value', Number(e.target.value))}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                    <Button onClick={() => removeCondition('entry', idx)} size="sm" variant="ghost">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                {strategy.entry_conditions?.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No entry conditions defined</p>
                )}
              </CardContent>
            </Card>

            {/* Exit Conditions */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-red-400" />
                    Exit Conditions
                  </CardTitle>
                  <Button onClick={() => addCondition('exit')} size="sm" className="bg-red-600 hover:bg-red-500">
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(strategy.exit_conditions || []).map((condition, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-800/50 p-3 rounded-lg">
                    <Select value={condition.indicator} onValueChange={(v) => updateCondition('exit', idx, 'indicator', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {INDICATORS.map(ind => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={condition.condition} onValueChange={(v) => updateCondition('exit', idx, 'condition', v)}>
                      <SelectTrigger className="bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {CONDITIONS.map(cond => <SelectItem key={cond} value={cond}>{cond}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition('exit', idx, 'value', Number(e.target.value))}
                      className="w-24 bg-slate-700 border-slate-600"
                    />
                    <Button onClick={() => removeCondition('exit', idx)} size="sm" variant="ghost">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                {strategy.exit_conditions?.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">No exit conditions defined</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Risk Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stop Loss (%)</Label>
                  <Input
                    type="number"
                    value={strategy.risk_management?.stop_loss || 5}
                    onChange={(e) => onChange({
                      ...strategy,
                      risk_management: { ...strategy.risk_management, stop_loss: Number(e.target.value) }
                    })}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label>Take Profit (%)</Label>
                  <Input
                    type="number"
                    value={strategy.risk_management?.take_profit || 10}
                    onChange={(e) => onChange({
                      ...strategy,
                      risk_management: { ...strategy.risk_management, take_profit: Number(e.target.value) }
                    })}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <Label>Trailing Stop Loss</Label>
                <Switch
                  checked={strategy.risk_management?.trailing_stop}
                  onCheckedChange={(checked) => onChange({
                    ...strategy,
                    risk_management: { ...strategy.risk_management, trailing_stop: checked }
                  })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}