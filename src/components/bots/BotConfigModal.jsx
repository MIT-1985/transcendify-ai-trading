import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Shield, TrendingUp, Grid3x3, DollarSign, Zap, Settings, Clock, Activity, AlertTriangle, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import AIOptimizer from './AIOptimizer';

export default function BotConfigModal({ bot, isOpen, onClose, onSubscribe }) {
  const [config, setConfig] = useState({
    capital_allocated: bot?.min_capital || 1000,
    risk_profile: 'moderate',
    exchange: 'binance',
    custom_strategy_enabled: false,
    strategy_rules: [],
    stop_loss: bot?.default_stop_loss || 5,
    take_profit: bot?.default_take_profit || 10,
    grid_levels: bot?.grid_levels || 10,
    grid_spacing: bot?.grid_spacing || 1,
    dca_interval: bot?.dca_interval || 60,
    dca_amount: bot?.dca_amount || 100,
    momentum_period: bot?.momentum_period || 15,
    momentum_threshold: bot?.momentum_threshold || 2,
    max_position_size: 25,
    trailing_stop: false,
    trade_frequency: 'medium',
    max_trades_per_hour: 10,
    min_trade_interval: 2,
    trading_pairs: ['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:ADAUSD']
  });

  const { data: exchangeConnections = [] } = useQuery({
    queryKey: ['exchange-connections'],
    queryFn: () => base44.entities.ExchangeConnection.filter({ status: 'connected' }),
    enabled: isOpen
  });

  const [availableTickers, setAvailableTickers] = useState([]);
  const [loadingTickers, setLoadingTickers] = useState(false);

  const { data: riskProfiles = [] } = useQuery({
    queryKey: ['riskProfiles'],
    queryFn: () => base44.entities.RiskProfile.list('-created_date')
  });

  const riskProfilePresets = {
    conservative: {
      stop_loss: 2,
      take_profit: 5,
      max_position_size: 10,
      max_trades_per_hour: 3,
      min_trade_interval: 10,
      description: 'Lower risk, smaller profits, more stable'
    },
    moderate: {
      stop_loss: 5,
      take_profit: 10,
      max_position_size: 25,
      max_trades_per_hour: 10,
      min_trade_interval: 2,
      description: 'Balanced risk/reward ratio'
    },
    aggressive: {
      stop_loss: 10,
      take_profit: 20,
      max_position_size: 50,
      max_trades_per_hour: 30,
      min_trade_interval: 1,
      description: 'Higher risk, higher potential returns'
    },
    ultra: {
      stop_loss: 15,
      take_profit: 30,
      max_position_size: 75,
      max_trades_per_hour: 60,
      min_trade_interval: 0.5,
      description: 'Maximum risk, maximum potential'
    }
  };

  const applyRiskProfile = (profile) => {
    const preset = riskProfilePresets[profile];
    if (preset) {
      setConfig({
        ...config,
        risk_profile: profile,
        stop_loss: preset.stop_loss,
        take_profit: preset.take_profit,
        max_position_size: preset.max_position_size,
        max_trades_per_hour: preset.max_trades_per_hour,
        min_trade_interval: preset.min_trade_interval
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTickers();
    }
  }, [isOpen]);

  const fetchTickers = async () => {
    setLoadingTickers(true);
    try {
      const response = await base44.functions.invoke('polygonMarketData', {
        action: 'tickers',
        limit: 50
      });
      
      if (response.data?.success && response.data.data?.results) {
        const tickers = response.data.data.results.map(t => t.ticker);
        setAvailableTickers(tickers);
      }
    } catch (error) {
      toast.error('Failed to load trading pairs');
    } finally {
      setLoadingTickers(false);
    }
  };

  const handleSubmit = () => {
    onSubscribe(config);
  };

  if (!bot) return null;

  const isGridStrategy = bot.strategy === 'grid';
  const isDcaStrategy = bot.strategy === 'dca';
  const isMomentumStrategy = bot.strategy === 'momentum';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            Configure {bot.name}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Set up risk management and strategy parameters
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="risk" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-slate-800">
            <TabsTrigger value="risk">Risk Profile</TabsTrigger>
            <TabsTrigger value="capital">Capital</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Risk</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="frequency">Frequency</TabsTrigger>
          </TabsList>

          {/* Exchange Selection */}
          <div className="mt-4 bg-slate-800/50 rounded-lg p-4">
            <Label className="text-slate-300 mb-3 block font-semibold">Борса за търговия</Label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'binance', label: 'Binance', color: 'text-yellow-400', border: 'border-yellow-500' },
                { id: 'okx', label: 'OKX', color: 'text-blue-400', border: 'border-blue-500' }
              ].map(ex => {
                const hasConn = exchangeConnections.some(c => c.exchange === ex.id);
                return (
                  <button
                    key={ex.id}
                    onClick={() => setConfig({ ...config, exchange: ex.id })}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-all text-left relative',
                      config.exchange === ex.id
                        ? `${ex.border} bg-slate-700/60`
                        : 'border-slate-700 bg-slate-700/20 hover:border-slate-600'
                    )}
                  >
                    <div className={`font-bold text-lg ${ex.color}`}>{ex.label}</div>
                    {hasConn
                      ? <div className="text-xs text-emerald-400 mt-1">✓ Свързан</div>
                      : <div className="text-xs text-red-400 mt-1">⚠ Не е свързан</div>
                    }
                  </button>
                );
              })}
            </div>
            {!exchangeConnections.some(c => c.exchange === config.exchange) && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400">
                ⚠️ Нямате свързан {config.exchange.toUpperCase()} акаунт. Ботът ще работи в SIM режим. Свържете акаунта от страницата Connect {config.exchange === 'binance' ? 'Binance' : 'OKX'}.
              </div>
            )}
          </div>

          {/* Risk Profile Tab */}
          <TabsContent value="risk" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold">Risk Profile Presets</h3>
              </div>
              <p className="text-sm text-slate-400">
                Choose a risk profile that matches your trading style
              </p>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(riskProfilePresets).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyRiskProfile(key)}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all text-left",
                      config.risk_profile === key
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 bg-slate-700/30 hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold capitalize">{key}</span>
                      {config.risk_profile === key && (
                        <Shield className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{preset.description}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">SL:</span>
                        <span className="text-red-400 ml-1">{preset.stop_loss}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500">TP:</span>
                        <span className="text-emerald-400 ml-1">{preset.take_profit}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Pos:</span>
                        <span className="text-blue-400 ml-1">{preset.max_position_size}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Freq:</span>
                        <span className="text-purple-400 ml-1">{preset.max_trades_per_hour}/h</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-300">
                    <div className="font-semibold mb-1">Current Profile: {config.risk_profile}</div>
                    <div className="text-xs text-amber-400/80">
                      {riskProfilePresets[config.risk_profile]?.description}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Capital Tab */}
          <TabsContent value="capital" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div>
                <Label className="text-slate-300 flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4" />
                  Allocated Capital (USD)
                </Label>
                <Input
                  type="number"
                  value={config.capital_allocated}
                  onChange={(e) => setConfig({ ...config, capital_allocated: parseFloat(e.target.value) })}
                  min={bot.min_capital}
                  className="bg-slate-700 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Minimum: ${bot.min_capital?.toLocaleString()}
                </p>
              </div>

              <div>
                <Label className="text-slate-300 mb-2">Trading Pairs</Label>
                <div className="space-y-2">
                  {['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:ADAUSD', 'X:DOGEUSD', 'X:BNBUSD', 'X:MATICUSD'].map((pair) => (
                    <label key={pair} className="flex items-center gap-2 p-2 bg-slate-700/50 rounded hover:bg-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.trading_pairs.includes(pair)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConfig({ ...config, trading_pairs: [...config.trading_pairs, pair] });
                          } else {
                            setConfig({ ...config, trading_pairs: config.trading_pairs.filter(p => p !== pair) });
                          }
                        }}
                        className="w-4 h-4 text-blue-500"
                      />
                      <span className="text-sm text-slate-300">{pair.replace('X:', '').replace('USD', '/USD')}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Bot will trade all selected pairs ({config.trading_pairs.length} selected)
                </p>
              </div>

              <div>
                <Label className="text-slate-300 mb-2">Capital Allocation per Trade: {config.max_position_size}%</Label>
                <Slider
                  value={[config.max_position_size]}
                  onValueChange={([value]) => setConfig({ ...config, max_position_size: value })}
                  min={5}
                  max={100}
                  step={5}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Conservative (5%)</span>
                  <span>${((config.capital_allocated * config.max_position_size) / 100).toFixed(2)} per trade</span>
                  <span>Aggressive (100%)</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Advanced Risk Tab */}
          <TabsContent value="advanced" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold">Advanced Risk Settings</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-300 mb-2">Stop Loss (%)</Label>
                  <Input
                    type="number"
                    value={config.stop_loss}
                    onChange={(e) => setConfig({ ...config, stop_loss: parseFloat(e.target.value) })}
                    step={0.5}
                    min={0.5}
                    max={50}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <p className="text-xs text-red-400 mt-1">
                    Max loss: ${((config.capital_allocated * config.stop_loss) / 100).toFixed(2)}
                  </p>
                </div>

                <div>
                  <Label className="text-slate-300 mb-2">Take Profit (%)</Label>
                  <Input
                    type="number"
                    value={config.take_profit}
                    onChange={(e) => setConfig({ ...config, take_profit: parseFloat(e.target.value) })}
                    step={0.5}
                    min={1}
                    max={100}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <p className="text-xs text-emerald-400 mt-1">
                    Target: ${((config.capital_allocated * config.take_profit) / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-slate-300 mb-2">Max Position Size: {config.max_position_size}%</Label>
                <Slider
                  value={[config.max_position_size]}
                  onValueChange={([value]) => setConfig({ ...config, max_position_size: value })}
                  min={5}
                  max={100}
                  step={5}
                  className="mt-2"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Max ${((config.capital_allocated * config.max_position_size) / 100).toFixed(2)} per trade
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <Label className="text-slate-300">Trailing Stop Loss</Label>
                  <p className="text-xs text-slate-500">Automatically adjust stop loss as profit increases</p>
                </div>
                <Switch
                  checked={config.trailing_stop}
                  onCheckedChange={(checked) => setConfig({ ...config, trailing_stop: checked })}
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="text-sm text-blue-300">
                  Risk/Reward Ratio: <span className="font-bold">1:{(config.take_profit / config.stop_loss).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Strategy Tab */}
          <TabsContent value="strategy" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              {isGridStrategy && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Grid3x3 className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold">Grid Trading Settings</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300 mb-2">Grid Levels</Label>
                      <Input
                        type="number"
                        value={config.grid_levels}
                        onChange={(e) => setConfig({ ...config, grid_levels: parseInt(e.target.value) })}
                        min={3}
                        max={50}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Number of buy/sell orders</p>
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2">Grid Spacing (%)</Label>
                      <Input
                        type="number"
                        value={config.grid_spacing}
                        onChange={(e) => setConfig({ ...config, grid_spacing: parseFloat(e.target.value) })}
                        step={0.1}
                        min={0.1}
                        max={10}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Distance between levels</p>
                    </div>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-sm text-purple-300">
                    ${(config.capital_allocated / config.grid_levels).toFixed(2)} per grid level
                  </div>
                </>
              )}

              {isDcaStrategy && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                    <h3 className="font-semibold">Dollar-Cost Averaging Settings</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300 mb-2">Buy Interval (minutes)</Label>
                      <Input
                        type="number"
                        value={config.dca_interval}
                        onChange={(e) => setConfig({ ...config, dca_interval: parseInt(e.target.value) })}
                        min={5}
                        max={1440}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Time between purchases</p>
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2">Amount per Buy ($)</Label>
                      <Input
                        type="number"
                        value={config.dca_amount}
                        onChange={(e) => setConfig({ ...config, dca_amount: parseFloat(e.target.value) })}
                        min={10}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Fixed buy amount</p>
                    </div>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300">
                    ~{Math.floor(config.capital_allocated / config.dca_amount)} total buys possible
                  </div>
                </>
              )}

              {isMomentumStrategy && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold">Momentum Trading Settings</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300 mb-2">Period (minutes)</Label>
                      <Input
                        type="number"
                        value={config.momentum_period}
                        onChange={(e) => setConfig({ ...config, momentum_period: parseInt(e.target.value) })}
                        min={5}
                        max={240}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Momentum calculation period</p>
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2">Threshold (%)</Label>
                      <Input
                        type="number"
                        value={config.momentum_threshold}
                        onChange={(e) => setConfig({ ...config, momentum_threshold: parseFloat(e.target.value) })}
                        step={0.5}
                        min={0.5}
                        max={20}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      <p className="text-xs text-slate-500 mt-1">Minimum momentum to trade</p>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-300">
                    Trades when price moves ±{config.momentum_threshold}% in {config.momentum_period}min
                  </div>
                </>
              )}

              {!isGridStrategy && !isDcaStrategy && !isMomentumStrategy && (
                <div className="text-center py-8 text-slate-500">
                  <p>No additional strategy settings required for {bot.strategy}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Trade Frequency Tab */}
          <TabsContent value="frequency" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold">Trade Frequency & Timing</h3>
              </div>

              <div>
                <Label className="text-slate-300 mb-2">Max Trades per Hour: {config.max_trades_per_hour}</Label>
                <Slider
                  value={[config.max_trades_per_hour]}
                  onValueChange={([value]) => setConfig({ ...config, max_trades_per_hour: value })}
                  min={1}
                  max={60}
                  step={1}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Slow (1/hour)</span>
                  <span>Fast (60/hour)</span>
                </div>
              </div>

              <div>
                <Label className="text-slate-300 mb-2">Min Interval Between Trades: {config.min_trade_interval}s</Label>
                <Slider
                  value={[config.min_trade_interval]}
                  onValueChange={([value]) => setConfig({ ...config, min_trade_interval: value })}
                  min={0.5}
                  max={60}
                  step={0.5}
                  className="mt-2"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Prevents overtrading by enforcing minimum wait time
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setConfig({ ...config, max_trades_per_hour: 3, min_trade_interval: 10 })}
                  className="p-3 rounded-lg border border-slate-700 bg-slate-700/30 hover:border-blue-500 transition-all"
                >
                  <Activity className="w-5 h-5 text-green-400 mx-auto mb-1" />
                  <div className="text-xs font-semibold">Slow</div>
                  <div className="text-xs text-slate-500">~3/hour</div>
                </button>
                <button
                  onClick={() => setConfig({ ...config, max_trades_per_hour: 10, min_trade_interval: 2 })}
                  className="p-3 rounded-lg border border-slate-700 bg-slate-700/30 hover:border-blue-500 transition-all"
                >
                  <Activity className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                  <div className="text-xs font-semibold">Medium</div>
                  <div className="text-xs text-slate-500">~10/hour</div>
                </button>
                <button
                  onClick={() => setConfig({ ...config, max_trades_per_hour: 30, min_trade_interval: 1 })}
                  className="p-3 rounded-lg border border-slate-700 bg-slate-700/30 hover:border-blue-500 transition-all"
                >
                  <Activity className="w-5 h-5 text-red-400 mx-auto mb-1" />
                  <div className="text-xs font-semibold">Fast</div>
                  <div className="text-xs text-slate-500">~30/hour</div>
                </button>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                <div className="text-sm text-purple-300">
                  <div className="font-semibold mb-1">Estimated Daily Trades</div>
                  <div className="text-2xl">{(config.max_trades_per_hour * 24).toLocaleString()}</div>
                  <div className="text-xs text-purple-400/80 mt-1">
                    Based on max frequency • Actual may be lower
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          </Tabs>

          <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-500"
          >
            Proceed to Payment →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}