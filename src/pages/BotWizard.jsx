import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Wand2, Download, CheckCircle, AlertCircle, Copy, Play } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConstantRecommendations from '@/components/wizard/ConstantRecommendations';

export default function BotWizard() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    strategy: 'rsi',
    symbol: 'BTC/USDT',
    timeframe: '5m',
    exchange: 'binance',
    positionSize: 0.01,
    stopLoss: 0.02,
    takeProfit: 0.04,
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    demo: true
  });
  const [generatedBot, setGeneratedBot] = useState(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('generateBotCode', {
        strategy: config.strategy,
        config
      });
      return response.data;
    },
    onSuccess: (data) => {
      setGeneratedBot(data.artifact);
      setStep(4);
      toast.success('Bot generated successfully!');
    },
    onError: (error) => {
      toast.error('Generation failed: ' + error.message);
    }
  });

  const downloadBot = () => {
    const files = generatedBot.files;
    const zip = Object.entries(files).map(([name, content]) => 
      `=== ${name} ===\n${content}\n\n`
    ).join('');
    
    const blob = new Blob([zip], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.strategy}_bot.txt`;
    a.click();
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied!');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Wand2 className="w-8 h-8 text-purple-400" />
            AI Bot Wizard
          </h1>
          <p className="text-slate-400">Generate production-ready trading bots in minutes</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 px-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= s ? 'bg-purple-600' : 'bg-slate-800'
              }`}>
                {step > s ? <CheckCircle className="w-6 h-6" /> : s}
              </div>
              {s < 4 && (
                <div className={`w-24 h-1 ${step > s ? 'bg-purple-600' : 'bg-slate-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Strategy */}
        {step === 1 && (
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Choose Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {['rsi', 'macd', 'bollinger'].map(strat => (
                  <button
                    key={strat}
                    onClick={() => setConfig({...config, strategy: strat})}
                    className={`p-6 rounded-lg border-2 transition-all ${
                      config.strategy === strat
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-bold text-lg mb-2">{strat.toUpperCase()}</div>
                    <div className="text-sm text-slate-400">
                      {strat === 'rsi' && 'Momentum oscillator strategy'}
                      {strat === 'macd' && 'Trend following strategy'}
                      {strat === 'bollinger' && 'Mean reversion strategy'}
                    </div>
                  </button>
                ))}
              </div>
              <Button onClick={() => setStep(2)} className="w-full bg-purple-600 hover:bg-purple-500">
                Next: Configure Parameters
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Parameters */}
        {step === 2 && (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle>Configure Parameters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Trading Pair</Label>
                  <Input
                    value={config.symbol}
                    onChange={(e) => setConfig({...config, symbol: e.target.value})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label>Timeframe</Label>
                  <Select value={config.timeframe} onValueChange={(v) => setConfig({...config, timeframe: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="1m">1 minute</SelectItem>
                      <SelectItem value="5m">5 minutes</SelectItem>
                      <SelectItem value="15m">15 minutes</SelectItem>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="4h">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Position Size (%)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={config.positionSize}
                    onChange={(e) => setConfig({...config, positionSize: parseFloat(e.target.value)})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label>Stop Loss (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.stopLoss * 100}
                    onChange={(e) => setConfig({...config, stopLoss: parseFloat(e.target.value) / 100})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div>
                  <Label>Take Profit (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.takeProfit * 100}
                    onChange={(e) => setConfig({...config, takeProfit: parseFloat(e.target.value) / 100})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                
                {config.strategy === 'rsi' && (
                  <>
                    <div>
                      <Label>RSI Period</Label>
                      <Input
                        type="number"
                        value={config.rsiPeriod}
                        onChange={(e) => setConfig({...config, rsiPeriod: parseInt(e.target.value)})}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div>
                      <Label>Oversold Level</Label>
                      <Input
                        type="number"
                        value={config.oversold}
                        onChange={(e) => setConfig({...config, oversold: parseInt(e.target.value)})}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div>
                      <Label>Overbought Level</Label>
                      <Input
                        type="number"
                        value={config.overbought}
                        onChange={(e) => setConfig({...config, overbought: parseInt(e.target.value)})}
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex gap-3">
                <Button onClick={() => setStep(1)} variant="outline" className="flex-1 border-slate-700">
                  Back
                </Button>
                <Button onClick={() => setStep(3)} className="flex-1 bg-purple-600 hover:bg-purple-500">
                  Next: Review & Generate
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <div>
          <ConstantRecommendations 
            strategy={config.strategy}
            currentParams={{
              stopLoss: config.stopLoss,
              takeProfit: config.takeProfit,
              positionSize: config.positionSize
            }}
          />
        </div>
      </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle>Review Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-400">Strategy:</span> <span className="font-bold">{config.strategy.toUpperCase()}</span></div>
                  <div><span className="text-slate-400">Symbol:</span> <span className="font-bold">{config.symbol}</span></div>
                  <div><span className="text-slate-400">Timeframe:</span> <span className="font-bold">{config.timeframe}</span></div>
                  <div><span className="text-slate-400">Position Size:</span> <span className="font-bold">{(config.positionSize * 100).toFixed(2)}%</span></div>
                  <div><span className="text-slate-400">Stop Loss:</span> <span className="font-bold text-red-400">{(config.stopLoss * 100).toFixed(2)}%</span></div>
                  <div><span className="text-slate-400">Take Profit:</span> <span className="font-bold text-green-400">{(config.takeProfit * 100).toFixed(2)}%</span></div>
                </div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-900 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-yellow-400 mb-1">Demo Mode Enabled</div>
                    <div className="text-sm text-yellow-200">Bot will run in paper trading mode by default. No real funds at risk.</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setStep(2)} variant="outline" className="flex-1 border-slate-700">
                  Back
                </Button>
                <Button 
                  onClick={() => generateMutation.mutate()} 
                  disabled={generateMutation.isPending}
                  className="flex-1 bg-purple-600 hover:bg-purple-500"
                >
                  {generateMutation.isPending ? 'Generating...' : 'Generate Bot'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Generated Bot */}
        {step === 4 && generatedBot && (
          <div className="space-y-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  Bot Generated Successfully!
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-900/20 border border-green-900 rounded-lg p-4">
                  <div className="text-sm space-y-2">
                    <div className="font-bold text-green-400">Validation Passed</div>
                    {generatedBot.validation.safetyChecks.map((check, i) => (
                      <div key={i} className="text-green-200 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {check}
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={downloadBot} className="w-full bg-blue-600 hover:bg-blue-500">
                  <Download className="w-5 h-5 mr-2" />
                  Download Bot Files
                </Button>
              </CardContent>
            </Card>

            <Tabs defaultValue="bot" className="w-full">
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="bot">bot.py</TabsTrigger>
                <TabsTrigger value="requirements">requirements.txt</TabsTrigger>
                <TabsTrigger value="readme">README.md</TabsTrigger>
              </TabsList>
              
              <TabsContent value="bot">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>bot.py</CardTitle>
                      <Button onClick={() => copyCode(generatedBot.files['bot.py'])} size="sm" variant="outline">
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-xs">
                      <code className="text-green-400">{generatedBot.files['bot.py']}</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="requirements">
                <Card className="bg-slate-900 border-slate-800">
                  <CardContent className="pt-6">
                    <pre className="bg-slate-950 p-4 rounded-lg text-sm">
                      <code className="text-blue-400">{generatedBot.files['requirements.txt']}</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="readme">
                <Card className="bg-slate-900 border-slate-800">
                  <CardContent className="pt-6">
                    <pre className="bg-slate-950 p-4 rounded-lg text-sm whitespace-pre-wrap">
                      <code className="text-slate-300">{generatedBot.files['README.md']}</code>
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Button onClick={() => {setStep(1); setGeneratedBot(null);}} variant="outline" className="w-full border-slate-700">
              Generate Another Bot
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}