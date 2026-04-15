import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, CheckCircle2, Loader2, Eye, EyeOff, 
  RefreshCw, Unplug, ArrowLeft, AlertTriangle, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import BinanceBalanceCard from '@/components/binance/BinanceBalanceCard';
import BinanceInstructions from '@/components/binance/BinanceInstructions';

export default function ConnectBinance() {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [label, setLabel] = useState('Binance Main');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: connectionStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['binance-connection'],
    queryFn: async () => {
      // 'test' fetches fresh balance from Binance API and updates DB, falls back to 'status' if not connected
      try {
        const testRes = await base44.functions.invoke('binanceConnect', { action: 'test' });
        if (testRes.data?.success) return { connected: true, ...testRes.data };
      } catch {}
      const res = await base44.functions.invoke('binanceConnect', { action: 'status' });
      return res.data;
    }
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('binanceConnect', {
        action: 'connect',
        api_key: apiKey,
        api_secret: apiSecret,
        label
      });
      if (res.data.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.geo_blocked) {
        toast.warning('Binance EU ограничение - ключовете са запазени, но live баланс не е достъпен от EU сървъри.');
      } else {
        toast.success('Binance свързан успешно!');
      }
      setApiKey('');
      setApiSecret('');
      queryClient.invalidateQueries({ queryKey: ['binance-connection'] });
    },
    onError: (err) => toast.error(err.message || 'Грешка при свързване')
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('binanceConnect', { action: 'test' });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Връзката е OK! Баланс: ${data.balance_usdt?.toFixed(2)} USDC`);
        queryClient.invalidateQueries({ queryKey: ['binance-connection'] });
      } else {
        toast.error(data.error || 'Тестът неуспешен');
      }
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('binanceConnect', { action: 'disconnect' });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Binance изключен');
      queryClient.invalidateQueries({ queryKey: ['binance-connection'] });
    }
  });

  const isConnected = connectionStatus?.connected;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('Dashboard'))} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold text-lg">B</div>
              Connect Binance
            </h1>
            <p className="text-slate-400 text-sm">Свържете Binance акаунта за реална търговия</p>
          </div>
        </div>

        {/* Status */}
        {statusLoading ? (
          <Card className="bg-slate-900/50 border-slate-800 mb-6">
            <CardContent className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </CardContent>
          </Card>
        ) : isConnected ? (
          <>
            <Card className="bg-emerald-900/20 border-emerald-500/30 mb-6">
              <CardContent className="py-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-emerald-400 text-lg">Свързан</div>
                      <div className="text-sm text-slate-400">
                        {connectionStatus.label} • Синхронизиран {connectionStatus.last_sync ? new Date(connectionStatus.last_sync).toLocaleString('bg-BG') : 'никога'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="border-slate-700">
                      {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      <span className="ml-1 hidden sm:inline">Тест</span>
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                      <Unplug className="w-4 h-4" />
                      <span className="ml-1 hidden sm:inline">Изключи</span>
                    </Button>
                  </div>
                </div>
                {connectionStatus.permissions?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {connectionStatus.permissions.map(p => (
                      <Badge key={p} variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">{p}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <BinanceBalanceCard
              balanceUsdt={connectionStatus.balance_usdt}
              balances={connectionStatus.balances}
              onRefresh={() => testMutation.mutate()}
              isRefreshing={testMutation.isPending}
            />
          </>
        ) : null}

        {/* Connect Form */}
        {!isConnected && !statusLoading && (
          <Card className="bg-slate-900/50 border-slate-800 mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                API Credentials
              </CardTitle>
              <CardDescription className="text-slate-400">
                Ключовете се криптират с AES-256-GCM преди съхранение
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-slate-300">Етикет</Label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="напр. Binance Main" className="bg-slate-800 border-slate-700 mt-1" />
              </div>
              <div>
                <Label className="text-slate-300">API Key</Label>
                <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Поставете Binance API key" className="bg-slate-800 border-slate-700 mt-1 font-mono text-sm" />
              </div>
              <div>
                <Label className="text-slate-300">API Secret</Label>
                <div className="relative mt-1">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={e => setApiSecret(e.target.value)}
                    placeholder="Поставете Binance API secret"
                    className="bg-slate-800 border-slate-700 font-mono text-sm pr-10"
                  />
                  <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!apiKey || !apiSecret || connectMutation.isPending}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
              >
                {connectMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Валидиране...</>
                ) : (
                  <><Shield className="w-4 h-4 mr-2" /> Свържи и Валидирай</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <BinanceInstructions />

        {/* Security Notice */}
        <Card className="bg-amber-900/10 border-amber-500/20 mt-6">
          <CardContent className="py-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400">
              <strong className="text-amber-400">Сигурност:</strong> Никога не активирайте разрешение за теглене. Нужен е само Spot Trading достъп. Ключовете ви се криптират и никога не се пазят в чист текст.
            </div>
          </CardContent>
        </Card>

        {/* EU Geo-block Notice */}
        <Card className="bg-red-900/10 border-red-500/20 mt-4">
          <CardContent className="py-4 flex gap-3">
            <Info className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400">
              <strong className="text-red-400">Важно за EU потребители:</strong> Binance.com блокира API заявки от EU сървъри (geo-restriction). Ако сте регистрирани на <strong className="text-white">binance.com</strong>, балансът не може да се извлича автоматично. 
              <br /><br />
              <strong className="text-white">Алтернативи:</strong>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>Използвайте <strong className="text-blue-400">OKX</strong> - напълно работещо без ограничения</li>
                <li>Регистрирайте се на <strong className="text-yellow-400">binance.us</strong> ако сте от САЩ</li>
                <li>Ключовете ще бъдат запазени и ботовете ще работят при достъпност</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}