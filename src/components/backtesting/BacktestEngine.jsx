import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Activity, TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';
import { toast } from 'sonner';

const STRATEGIES = [
  { value: 'sma_crossover', label: 'SMA Crossover', params: ['shortPeriod', 'longPeriod'] },
  { value: 'rsi', label: 'RSI Strategy', params: ['period', 'oversold', 'overbought'] },
  { value: 'bollinger_bands', label: 'Bollinger Bands', params: ['period', 'stdDev'] },
  { value: 'macd', label: 'MACD Strategy', params: [] }
];

const CRYPTO_SYMBOLS = [
  'X:BTCUSD',
  'X:ETHUSD',
  'X:SOLUSD',
  'X:XRPUSD',
  'X:ADAUSD',
  'X:DOGEUSD'
];

export default function BacktestEngine({ onResultsReady }) {
  const [strategy, setStrategy] = useState('sma_crossover');
  const [symbol, setSymbol] = useState('X:BTCUSD');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-01');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [params, setParams] = useState({
    shortPeriod: '20',
    longPeriod: '50',
    period: '14',
    oversold: '30',
    overbought: '70',
    stdDev: '2',
    feeRate: '0.001'
  });

  const backtestMutation = useMutation({
    mutationFn: async () => {
      const selectedStrategy = STRATEGIES.find(s => s.value === strategy);
      const strategyParams = { feeRate: parseFloat(params.feeRate) };
      
      selectedStrategy.params.forEach(param => {
        strategyParams[param] = parseFloat(params[param]);
      });

      const response = await base44.functions.invoke('backtestStrategy', {
        strategy,
        symbol,
        startDate,
        endDate,
        initialCapital: parseFloat(initialCapital),
        parameters: strategyParams
      });

      return response.data.result;
    },
    onSuccess: (result) => {
      toast.success('Backtest completed!');
      if (onResultsReady) onResultsReady(result);
    },
    onError: (error) => {
      toast.error(error.message || 'Backtest failed');
    }
  });

  const selectedStrategy = STRATEGIES.find(s => s.value === strategy);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-400" />
          Backtest Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-400">Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {STRATEGIES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-400">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CRYPTO_SYMBOLS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.replace('X:', '').replace('USD', '/USD')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-400">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <div>
            <Label className="text-slate-400">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800 border-slate-700"
            />
          </div>
        </div>

        <div>
          <Label className="text-slate-400">Initial Capital ($)</Label>
          <Input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(e.target.value)}
            className="bg-slate-800 border-slate-700"
          />
        </div>

        {selectedStrategy && (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="text-sm text-slate-400 font-semibold">Strategy Parameters</div>
            
            {strategy === 'sma_crossover' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400 text-xs">Short Period</Label>
                  <Input
                    type="number"
                    value={params.shortPeriod}
                    onChange={(e) => setParams({...params, shortPeriod: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Long Period</Label>
                  <Input
                    type="number"
                    value={params.longPeriod}
                    onChange={(e) => setParams({...params, longPeriod: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            )}

            {strategy === 'rsi' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-slate-400 text-xs">Period</Label>
                  <Input
                    type="number"
                    value={params.period}
                    onChange={(e) => setParams({...params, period: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Oversold</Label>
                  <Input
                    type="number"
                    value={params.oversold}
                    onChange={(e) => setParams({...params, oversold: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Overbought</Label>
                  <Input
                    type="number"
                    value={params.overbought}
                    onChange={(e) => setParams({...params, overbought: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            )}

            {strategy === 'bollinger_bands' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400 text-xs">Period</Label>
                  <Input
                    type="number"
                    value={params.period}
                    onChange={(e) => setParams({...params, period: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Std Deviation</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={params.stdDev}
                    onChange={(e) => setParams({...params, stdDev: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-slate-400 text-xs">Fee Rate (%)</Label>
              <Input
                type="number"
                step="0.001"
                value={params.feeRate}
                onChange={(e) => setParams({...params, feeRate: e.target.value})}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>
        )}

        <Button
          onClick={() => backtestMutation.mutate()}
          disabled={backtestMutation.isPending}
          className="w-full bg-purple-600 hover:bg-purple-500"
        >
          {backtestMutation.isPending ? 'Running Backtest...' : 'Run Backtest'}
        </Button>
      </CardContent>
    </Card>
  );
}