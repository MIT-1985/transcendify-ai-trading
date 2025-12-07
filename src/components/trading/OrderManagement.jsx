import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, TrendingDown, Shield, Target } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function OrderManagement({ subscription, currentPrice = 0 }) {
  const [orderType, setOrderType] = useState('market');
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateTotal = () => {
    const qty = parseFloat(quantity) || 0;
    const prc = orderType === 'market' ? currentPrice : (parseFloat(price) || 0);
    return qty * prc;
  };

  const calculateRisk = () => {
    if (!stopLoss || !quantity) return 0;
    const qty = parseFloat(quantity);
    const entryPrice = orderType === 'market' ? currentPrice : parseFloat(price);
    const slPrice = parseFloat(stopLoss);
    return Math.abs((entryPrice - slPrice) * qty);
  };

  const calculateReward = () => {
    if (!takeProfit || !quantity) return 0;
    const qty = parseFloat(quantity);
    const entryPrice = orderType === 'market' ? currentPrice : parseFloat(price);
    const tpPrice = parseFloat(takeProfit);
    return Math.abs((tpPrice - entryPrice) * qty);
  };

  const handlePlaceOrder = async () => {
    if (!quantity || (orderType === 'limit' && !price)) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const entryPrice = orderType === 'market' ? currentPrice : parseFloat(price);
      const qty = parseFloat(quantity);
      const total = qty * entryPrice;

      // Create trade record
      await base44.entities.Trade.create({
        subscription_id: subscription.id,
        symbol: subscription.trading_pairs?.[0] || 'BTC/USD',
        side: side,
        quantity: qty,
        price: entryPrice,
        total_value: total,
        fee: total * 0.001,
        profit_loss: 0,
        entry_price: entryPrice,
        exit_price: entryPrice,
        execution_mode: 'MANUAL',
        strategy_used: 'manual',
        timestamp: new Date().toISOString()
      });

      toast.success(`${side} order placed successfully!`);
      
      // Reset form
      setQuantity('');
      setPrice('');
      setStopLoss('');
      setTakeProfit('');
    } catch (error) {
      toast.error('Failed to place order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const riskRewardRatio = calculateReward() / (calculateRisk() || 1);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-400" />
          Place Order
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="buy" className="w-full" onValueChange={(v) => setSide(v === 'buy' ? 'BUY' : 'SELL')}>
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="buy" className="data-[state=active]:bg-green-600">
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className="data-[state=active]:bg-red-600">
              Sell
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4 mt-4">
            <OrderForm />
          </TabsContent>

          <TabsContent value="sell" className="space-y-4 mt-4">
            <OrderForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );

  function OrderForm() {
    return (
      <>
        {/* Order Type */}
        <div>
          <Label className="text-slate-300 mb-2">Order Type</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={orderType === 'market' ? 'default' : 'outline'}
              onClick={() => setOrderType('market')}
              className={orderType === 'market' ? 'bg-blue-600' : ''}
            >
              Market
            </Button>
            <Button
              variant={orderType === 'limit' ? 'default' : 'outline'}
              onClick={() => setOrderType('limit')}
              className={orderType === 'limit' ? 'bg-blue-600' : ''}
            >
              Limit
            </Button>
          </div>
        </div>

        {/* Current Price */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Current Market Price</div>
          <div className="text-2xl font-bold text-white">${currentPrice.toFixed(2)}</div>
        </div>

        {/* Quantity */}
        <div>
          <Label className="text-slate-300 mb-2">Quantity</Label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0.00"
            className="bg-slate-700 border-slate-600 text-white"
            step="0.0001"
          />
        </div>

        {/* Limit Price */}
        {orderType === 'limit' && (
          <div>
            <Label className="text-slate-300 mb-2">Limit Price</Label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
        )}

        {/* Stop Loss & Take Profit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-slate-300 mb-2 flex items-center gap-1">
              <Shield className="w-3 h-3 text-red-400" />
              Stop Loss
            </Label>
            <Input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="Optional"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300 mb-2 flex items-center gap-1">
              <Target className="w-3 h-3 text-green-400" />
              Take Profit
            </Label>
            <Input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="Optional"
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total</span>
            <span className="text-white font-semibold">${calculateTotal().toFixed(2)}</span>
          </div>
          {stopLoss && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Max Risk</span>
              <span className="text-red-400 font-semibold">${calculateRisk().toFixed(2)}</span>
            </div>
          )}
          {takeProfit && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Potential Reward</span>
              <span className="text-green-400 font-semibold">${calculateReward().toFixed(2)}</span>
            </div>
          )}
          {stopLoss && takeProfit && (
            <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
              <span className="text-slate-400">Risk/Reward Ratio</span>
              <span className={`font-semibold ${riskRewardRatio >= 2 ? 'text-green-400' : 'text-amber-400'}`}>
                1:{riskRewardRatio.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Place Order Button */}
        <Button
          onClick={handlePlaceOrder}
          disabled={loading || !quantity}
          className={`w-full ${side === 'BUY' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}
        >
          {loading ? 'Placing Order...' : `${side} ${subscription.trading_pairs?.[0] || 'BTC'}`}
        </Button>

        <div className="text-xs text-slate-500 text-center">
          Orders are executed in simulation mode for testing
        </div>
      </>
    );
  }
}