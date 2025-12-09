import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Code, Save, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const PROMPT_COMPONENTS = {
  conditions: [
    { id: 'rsi_overbought', label: 'RSI is Overbought (>70)', template: 'if RSI > {{rsi_threshold}}' },
    { id: 'rsi_oversold', label: 'RSI is Oversold (<30)', template: 'if RSI < {{rsi_threshold}}' },
    { id: 'macd_bullish', label: 'MACD Bullish Crossover', template: 'when MACD crosses above signal line' },
    { id: 'macd_bearish', label: 'MACD Bearish Crossover', template: 'when MACD crosses below signal line' },
    { id: 'bb_upper', label: 'Price Touches Upper Bollinger Band', template: 'if price >= upper Bollinger Band' },
    { id: 'bb_lower', label: 'Price Touches Lower Bollinger Band', template: 'if price <= lower Bollinger Band' },
    { id: 'volatility_high', label: 'High Volatility', template: 'when volatility > {{volatility_threshold}}%' },
    { id: 'volatility_low', label: 'Low Volatility', template: 'when volatility < {{volatility_threshold}}%' },
    { id: 'price_up', label: 'Price Rising', template: 'if price change > +{{price_change}}% in last {{timeframe}} minutes' },
    { id: 'price_down', label: 'Price Falling', template: 'if price change < -{{price_change}}% in last {{timeframe}} minutes' }
  ],
  actions: [
    { id: 'buy', label: 'Execute BUY', template: 'BUY' },
    { id: 'sell', label: 'Execute SELL', template: 'SELL' },
    { id: 'hold', label: 'HOLD Position', template: 'HOLD' },
    { id: 'close', label: 'Close Position', template: 'close all positions' },
    { id: 'scale_in', label: 'Scale Into Position', template: 'scale in with {{scale_percent}}% of capital' },
    { id: 'scale_out', label: 'Scale Out of Position', template: 'scale out {{scale_percent}}% of position' }
  ],
  logic: [
    { id: 'and', label: 'AND', template: 'AND' },
    { id: 'or', label: 'OR', template: 'OR' },
    { id: 'then', label: 'THEN', template: 'THEN' },
    { id: 'else', label: 'ELSE', template: 'ELSE' }
  ]
};

const DEFAULT_VARIABLES = {
  rsi_threshold: 70,
  volatility_threshold: 3,
  price_change: 2,
  timeframe: 15,
  scale_percent: 50,
  target_profit: 10,
  stop_loss: 5
};

export default function PromptBuilder({ initialPrompt = '', onSave, onTest }) {
  const [components, setComponents] = useState([]);
  const [variables, setVariables] = useState(DEFAULT_VARIABLES);
  const [promptText, setPromptText] = useState(initialPrompt);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');

  const addComponent = (type, component) => {
    setComponents([...components, { type, ...component }]);
    updatePromptText([...components, { type, ...component }]);
  };

  const removeComponent = (index) => {
    const newComponents = components.filter((_, i) => i !== index);
    setComponents(newComponents);
    updatePromptText(newComponents);
  };

  const updatePromptText = (comps) => {
    let text = `You are an AI trading strategy advisor. Analyze the market and decide the best action.\n\n`;
    text += `Rules:\n`;
    
    comps.forEach((comp, i) => {
      let line = comp.template;
      Object.keys(variables).forEach(key => {
        line = line.replace(`{{${key}}}`, variables[key]);
      });
      text += `${i + 1}. ${line}\n`;
    });
    
    text += `\nCurrent Symbol: {symbol}\nRecent Performance: {performance}\n\nDecision (BUY/SELL/HOLD):`;
    setPromptText(text);
  };

  const updateVariable = (key, value) => {
    const newVars = { ...variables, [key]: value };
    setVariables(newVars);
    updatePromptText(components);
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        name,
        description,
        prompt_text: promptText,
        category,
        components,
        variables
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt Info */}
      <Card className="p-6 bg-slate-900/50 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Prompt Details</h3>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Strategy"
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your strategy..."
              className="bg-slate-800 border-slate-700"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
                <SelectItem value="volatility">Volatility-Based</SelectItem>
                <SelectItem value="trend_following">Trend Following</SelectItem>
                <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Component Builder */}
      <Card className="p-6 bg-slate-900/50 border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Build Your Strategy</h3>
        
        {/* Add Components */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <Label className="mb-2 block">Conditions</Label>
            <div className="space-y-2">
              {PROMPT_COMPONENTS.conditions.slice(0, 4).map(comp => (
                <Button
                  key={comp.id}
                  onClick={() => addComponent('condition', comp)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs border-blue-500/30 hover:bg-blue-500/10"
                >
                  <Plus className="w-3 h-3 mr-2" />
                  {comp.label}
                </Button>
              ))}
            </div>
          </div>
          
          <div>
            <Label className="mb-2 block">Actions</Label>
            <div className="space-y-2">
              {PROMPT_COMPONENTS.actions.map(comp => (
                <Button
                  key={comp.id}
                  onClick={() => addComponent('action', comp)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs border-green-500/30 hover:bg-green-500/10"
                >
                  <Plus className="w-3 h-3 mr-2" />
                  {comp.label}
                </Button>
              ))}
            </div>
          </div>
          
          <div>
            <Label className="mb-2 block">Logic</Label>
            <div className="space-y-2">
              {PROMPT_COMPONENTS.logic.map(comp => (
                <Button
                  key={comp.id}
                  onClick={() => addComponent('logic', comp)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs border-purple-500/30 hover:bg-purple-500/10"
                >
                  <Plus className="w-3 h-3 mr-2" />
                  {comp.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Components */}
        {components.length > 0 && (
          <div className="mb-6">
            <Label className="mb-2 block">Your Strategy Rules:</Label>
            <div className="space-y-2">
              {components.map((comp, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800 p-3 rounded-lg">
                  <Badge className={
                    comp.type === 'condition' ? 'bg-blue-500' :
                    comp.type === 'action' ? 'bg-green-500' :
                    'bg-purple-500'
                  }>
                    {comp.type}
                  </Badge>
                  <span className="flex-1 text-sm">{comp.label}</span>
                  <Button
                    onClick={() => removeComponent(i)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variables */}
        <div>
          <Label className="mb-2 block">Variables (Customize Thresholds)</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(variables).map(([key, value]) => (
              <div key={key}>
                <Label className="text-xs text-slate-400">{key.replace(/_/g, ' ')}</Label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => updateVariable(key, parseFloat(e.target.value))}
                  className="bg-slate-800 border-slate-700 h-9"
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Generated Prompt Preview */}
      <Card className="p-6 bg-slate-900/50 border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold">Generated Prompt</h3>
          </div>
          <div className="flex gap-2">
            <Button onClick={onTest} variant="outline" size="sm" className="border-purple-500 text-purple-400">
              <Play className="w-4 h-4 mr-2" />
              Test in Playground
            </Button>
            <Button onClick={handleSave} size="sm" className="bg-blue-600 hover:bg-blue-500">
              <Save className="w-4 h-4 mr-2" />
              Save Prompt
            </Button>
          </div>
        </div>
        <Textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          className="bg-slate-800 border-slate-700 font-mono text-sm min-h-[300px]"
          placeholder="Your prompt will appear here..."
        />
      </Card>
    </div>
  );
}