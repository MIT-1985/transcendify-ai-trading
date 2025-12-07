import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, TrendingUp, Grid3x3, DollarSign, Zap, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BotConfigModal({ bot, isOpen, onClose, onSubscribe }) {
  const [config, setConfig] = useState({
    capital_allocated: bot?.min_capital || 1000,
    stop_loss: bot?.default_stop_loss || 5,
    take_profit: bot?.default_take_profit || 10,
    grid_levels: bot?.grid_levels || 10,
    grid_spacing: bot?.grid_spacing || 1,
    dca_interval: bot?.dca_interval || 60,
    dca_amount: bot?.dca_amount || 100,
    momentum_period: bot?.momentum_period || 15,
    momentum_threshold: bot?.momentum_threshold || 2,
    max_position_size: 25,
    trailing_stop: false
  });

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

        <Tabs defaultValue="capital" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800">
            <TabsTrigger value="capital">Capital</TabsTrigger>
            <TabsTrigger value="risk">Risk Management</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
          </TabsList>

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
                <Label className="text-slate-300 mb-2">Max Position Size (% of Capital)</Label>
                <Input
                  type="number"
                  value={config.max_position_size}
                  onChange={(e) => setConfig({ ...config, max_position_size: parseFloat(e.target.value) })}
                  min={1}
                  max={100}
                  className="bg-slate-700 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Maximum ${((config.capital_allocated * config.max_position_size) / 100).toFixed(2)} per trade
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Risk Management Tab */}
          <TabsContent value="risk" className="space-y-4 mt-4">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold">Stop Loss & Take Profit</h3>
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
            Subscribe & Start Trading
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}