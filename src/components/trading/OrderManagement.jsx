import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { toast } from 'sonner';

export default function OrderManagement({ symbol = 'X:BTCUSD' }) {
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const queryClient = useQueryClient();

  // Fetch current price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: symbol
        });
        if (response.data?.success && response.data.data?.results?.[0]) {
          setCurrentPrice(response.data.data.results[0].c);
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, [symbol]);

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const user = await base44.auth.me();
      const wallets = await base44.entities.Wallet.filter({ created_by: user.email });
      return wallets[0] || { balance_usd: 0 };
    }
  });

  const placeOrderMutation = useMutation({
    mutationFn: async (orderData) => {
      // Simulate order execution
      const price = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice);
      const qty = parseFloat(quantity);
      const totalValue = price * qty;
      const fee = totalValue * 0.001; // 0.1% fee

      // Check balance for buy orders
      if (orderSide === 'BUY' && totalValue + fee > (wallet?.balance_usd || 0)) {
        throw new Error('Insufficient balance');
      }

      const order = await base44.entities.Order.create({
        symbol: symbol,
        side: orderSide,
        type: orderType,
        quantity: qty,
        price: price,
        status: orderType === 'MARKET' ? 'FILLED' : 'PENDING',
        filled_quantity: orderType === 'MARKET' ? qty : 0,
        average_price: orderType === 'MARKET' ? price : null,
        total_value: totalValue,
        fee: fee,
        execution_mode: 'SIM',
        filled_at: orderType === 'MARKET' ? new Date().toISOString() : null
      });

      // Update wallet balance for market orders
      if (orderType === 'MARKET') {
        const newBalance = orderSide === 'BUY' 
          ? (wallet?.balance_usd || 0) - totalValue - fee
          : (wallet?.balance_usd || 0) + totalValue - fee;
        
        await base44.entities.Wallet.update(wallet.id, {
          balance_usd: newBalance
        });
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setQuantity('');
      setLimitPrice('');
      toast.success('Order placed successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to place order');
    }
  });

  const calculateTotal = () => {
    const price = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice) || 0;
    const qty = parseFloat(quantity) || 0;
    return price * qty;
  };

  const calculateFee = () => {
    return calculateTotal() * 0.001;
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-400" />
          Place Order
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={orderSide} onValueChange={setOrderSide}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="BUY" className="data-[state=active]:bg-emerald-600">
              <TrendingUp className="w-4 h-4 mr-2" />
              Buy
            </TabsTrigger>
            <TabsTrigger value="SELL" className="data-[state=active]:bg-red-600">
              <TrendingDown className="w-4 h-4 mr-2" />
              Sell
            </TabsTrigger>
          </TabsList>

          <TabsContent value={orderSide} className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Order Type</label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="MARKET">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Market Order
                    </div>
                  </SelectItem>
                  <SelectItem value="LIMIT">Limit Order</SelectItem>
                  <SelectItem value="STOP_LOSS">Stop Loss</SelectItem>
                  <SelectItem value="TAKE_PROFIT">Take Profit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-2 block">Quantity</label>
              <Input
                type="number"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            {orderType !== 'MARKET' && (
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Price</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            )}

            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Current Price:</span>
                <span className="text-white font-semibold">${currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total:</span>
                <span className="text-white font-semibold">${calculateTotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Fee (0.1%):</span>
                <span className="text-white">${calculateFee().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                <span className="text-slate-400">Available Balance:</span>
                <span className="text-emerald-400 font-semibold">${(wallet?.balance_usd || 0).toFixed(2)}</span>
              </div>
            </div>

            <Button
              onClick={() => placeOrderMutation.mutate()}
              disabled={!quantity || placeOrderMutation.isPending || (orderType !== 'MARKET' && !limitPrice)}
              className={`w-full ${orderSide === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
            >
              {placeOrderMutation.isPending ? 'Placing...' : `${orderSide} ${symbol.replace('X:', '').replace('USD', '')}`}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}