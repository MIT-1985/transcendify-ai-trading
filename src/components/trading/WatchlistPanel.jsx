import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Star, Plus, Trash2, Bell, TrendingUp, TrendingDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const AVAILABLE_SYMBOLS = [
  { symbol: 'X:BTCUSD', name: 'Bitcoin' },
  { symbol: 'X:ETHUSD', name: 'Ethereum' },
  { symbol: 'X:SOLUSD', name: 'Solana' },
  { symbol: 'X:XRPUSD', name: 'Ripple' },
  { symbol: 'X:ADAUSD', name: 'Cardano' },
  { symbol: 'X:DOGEUSD', name: 'Dogecoin' },
  { symbol: 'X:MATICUSD', name: 'Polygon' },
  { symbol: 'X:AVAXUSD', name: 'Avalanche' },
];

export default function WatchlistPanel({ onSymbolSelect }) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState('above');
  const queryClient = useQueryClient();

  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => base44.entities.Watchlist.list('-created_date'),
    refetchInterval: 10000
  });

  const { data: prices = {} } = useQuery({
    queryKey: ['watchlist-prices', watchlist],
    queryFn: async () => {
      const pricePromises = watchlist.map(async (item) => {
        try {
          const response = await base44.functions.invoke('polygonMarketData', {
            action: 'ticker',
            symbol: item.symbol
          });
          if (response.data?.success && response.data.data?.results?.[0]) {
            const result = response.data.data.results[0];
            return {
              symbol: item.symbol,
              price: result.c,
              change: ((result.c - result.o) / result.o) * 100
            };
          }
        } catch (error) {
          return null;
        }
      });
      const results = await Promise.all(pricePromises);
      return results.reduce((acc, item) => {
        if (item) acc[item.symbol] = item;
        return acc;
      }, {});
    },
    enabled: watchlist.length > 0,
    refetchInterval: 5000
  });

  const addMutation = useMutation({
    mutationFn: (symbol) => {
      const symbolData = AVAILABLE_SYMBOLS.find(s => s.symbol === symbol);
      return base44.entities.Watchlist.create({
        symbol: symbol,
        name: symbolData?.name || symbol
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      setAddDialogOpen(false);
      setSelectedSymbol('');
      toast.success('Added to watchlist');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Watchlist.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Removed from watchlist');
    }
  });

  const createAlertMutation = useMutation({
    mutationFn: () => base44.entities.PriceAlert.create({
      symbol: selectedSymbol,
      target_price: parseFloat(alertPrice),
      condition: alertCondition,
      is_active: true
    }),
    onSuccess: () => {
      setAlertDialogOpen(false);
      setSelectedSymbol('');
      setAlertPrice('');
      toast.success('Price alert created');
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            My Watchlist
          </CardTitle>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs">
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle>Add to Watchlist</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Select cryptocurrency" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {AVAILABLE_SYMBOLS.filter(s => !watchlist.find(w => w.symbol === s.symbol)).map(s => (
                      <SelectItem key={s.symbol} value={s.symbol}>
                        {s.name} ({s.symbol.replace('X:', '').replace('USD', '/USD')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => addMutation.mutate(selectedSymbol)}
                  disabled={!selectedSymbol || addMutation.isPending}
                  className="w-full"
                >
                  Add to Watchlist
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-slate-400 py-8">Loading...</div>
        ) : watchlist.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            <Star className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No cryptocurrencies in watchlist</p>
          </div>
        ) : (
          <div className="space-y-2">
            {watchlist.map((item) => {
              const priceData = prices[item.symbol];
              return (
                <div
                  key={item.id}
                  className="bg-slate-800/50 rounded-lg p-3 hover:bg-slate-800 transition-all cursor-pointer group"
                  onClick={() => onSymbolSelect && onSymbolSelect(item.symbol)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{item.name}</span>
                        <span className="text-xs text-slate-500">
                          {item.symbol.replace('X:', '').replace('USD', '/USD')}
                        </span>
                      </div>
                      {priceData && (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-lg font-bold text-white">
                            ${priceData.price.toFixed(2)}
                          </span>
                          <span className={`text-sm flex items-center gap-1 ${
                            priceData.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {priceData.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {priceData.change >= 0 ? '+' : ''}{priceData.change.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSymbol(item.symbol);
                          setAlertDialogOpen(true);
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <Bell className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(item.id);
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle>Set Price Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Target Price</label>
                <Input
                  type="number"
                  placeholder="Enter price"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Condition</label>
                <Select value={alertCondition} onValueChange={setAlertCondition}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="above">Price goes above</SelectItem>
                    <SelectItem value="below">Price goes below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={() => createAlertMutation.mutate()}
                disabled={!alertPrice || createAlertMutation.isPending}
                className="w-full"
              >
                Create Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}