import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Shield, Link2, CheckCircle, AlertCircle, Eye, EyeOff, Loader2, ExternalLink, Wallet, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ConnectOKX() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [label, setLabel] = useState('My OKX Account');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const { data: connections = [], refetch } = useQuery({
    queryKey: ['okx-connections', user?.email],
    queryFn: () => base44.entities.ExchangeConnection.filter({ created_by: user?.email, exchange: 'okx' }),
    enabled: !!user,
    staleTime: 30000,
    retry: false
  });

  const connected = connections.find(c => c.status === 'connected');

  const handleConnect = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('okxConnect', { action: 'connect', api_key: apiKey, api_secret: apiSecret, passphrase, label });
      if (res.data?.success) {
        setResult({ type: 'success', message: 'OKX акаунтът е свързан успешно!' });
        refetch();
        setApiKey(''); setApiSecret(''); setPassphrase('');
      } else {
        setResult({ type: 'error', message: res.data?.error || 'Неуспешно свързване' });
      }
    } catch (err) {
      setResult({ type: 'error', message: err?.message || 'Грешка при свързване с OKX' });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await base44.functions.invoke('okxConnect', { action: 'balance' });
    await refetch();
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await base44.functions.invoke('okxConnect', { action: 'disconnect' });
    await refetch();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Link2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Свързване с OKX</h1>
            <p className="text-slate-400">Свържете вашия OKX акаунт за автоматична търговия</p>
          </div>
        </div>

        {/* Connected Status */}
        {connected ? (
          <div className="bg-slate-900/50 border border-emerald-500/30 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-5">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
              <div>
                <h3 className="font-bold text-emerald-400 text-lg">Акаунтът е свързан</h3>
                <p className="text-slate-400 text-sm">{connected.label}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <Button onClick={handleRefresh} disabled={loading} variant="outline" size="sm" className="border-slate-700 text-slate-300">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
                <Button onClick={handleDisconnect} disabled={loading} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Unlink className="w-4 h-4 mr-1" /> Изключи
                </Button>
              </div>
            </div>

            {/* Total Balance */}
            <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
              <div className="text-slate-400 text-sm mb-1">Общ баланс (USDT)</div>
              <div className="text-3xl font-bold text-yellow-400">${(connected.balance_usdt || 0).toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">Последно обновяване: {connected.last_sync ? new Date(connected.last_sync).toLocaleTimeString('bg-BG') : '-'}</div>
            </div>

            {/* Asset Balances */}
            {connected.balances?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {connected.balances.map(b => (
                  <div key={b.asset} className="bg-slate-800/60 rounded-lg px-4 py-3 flex justify-between">
                    <span className="font-semibold">{b.asset}</span>
                    <div className="text-right">
                      <div className="text-sm text-slate-200">{parseFloat(b.free).toFixed(6)}</div>
                      {b.locked > 0 && <div className="text-xs text-slate-500">🔒 {parseFloat(b.locked).toFixed(6)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Connect Form */
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-lg mb-5">Въведете API Ключовете</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Етикет (по желание)</label>
                <Input value={label} onChange={e => setLabel(e.target.value)} className="bg-slate-800 border-slate-700 text-white" placeholder="My OKX Account" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">API Key</label>
                <Input value={apiKey} onChange={e => setApiKey(e.target.value)} className="bg-slate-800 border-slate-700 text-white font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">API Secret</label>
                <div className="relative">
                  <Input type={showSecret ? 'text' : 'password'} value={apiSecret} onChange={e => setApiSecret(e.target.value)} className="bg-slate-800 border-slate-700 text-white font-mono pr-10" placeholder="Вашият API Secret" />
                  <button onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Passphrase</label>
                <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} className="bg-slate-800 border-slate-700 text-white" placeholder="Паролата на API ключа" />
              </div>
            </div>

            {result && (
              <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg ${result.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {result.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="text-sm">{result.message}</span>
              </div>
            )}

            <Button onClick={handleConnect} disabled={loading || !apiKey || !apiSecret || !passphrase} className="w-full mt-5 bg-blue-600 hover:bg-blue-500 h-12 text-base font-semibold">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Свързване...</> : <><Link2 className="w-4 h-4 mr-2" />Свържи OKX Акаунт</>}
            </Button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" /> Как да създадете API ключ в OKX
          </h3>
          <ol className="space-y-3 text-sm text-slate-400">
            <li className="flex gap-3"><span className="text-blue-400 font-bold">1.</span> Влезте в OKX акаунта си</li>
            <li className="flex gap-3"><span className="text-blue-400 font-bold">2.</span> Отидете на <strong className="text-white">Профил → API Management</strong></li>
            <li className="flex gap-3"><span className="text-blue-400 font-bold">3.</span> Кликнете <strong className="text-white">Create API Key</strong></li>
            <li className="flex gap-3"><span className="text-blue-400 font-bold">4.</span> Изберете <strong className="text-white">Trade</strong> разрешения (НЕ включвайте Withdraw)</li>
            <li className="flex gap-3"><span className="text-blue-400 font-bold">5.</span> Копирайте API Key, Secret и Passphrase</li>
          </ol>
          <a href="https://www.okx.com/account/my-api" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm">
            <ExternalLink className="w-4 h-4" /> Отвори OKX API Management
          </a>
        </div>
      </div>
    </div>
  );
}