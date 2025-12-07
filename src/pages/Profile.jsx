import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Settings, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Key,
  Database,
  LineChart,
  Loader2
} from 'lucide-react';

export default function Profile() {
  const [testing, setTesting] = useState({ api: null, loading: false });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const wallets = await base44.entities.Wallet.filter({ created_by: (await base44.auth.me()).email });
      return wallets[0];
    }
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => base44.entities.UserSubscription.list()
  });

  const testPolygonAPI = async () => {
    setTesting({ api: 'polygon', loading: true });
    try {
      const response = await fetch('https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2023-01-09/2023-01-09?apiKey=demo');
      if (response.ok) {
        setTesting({ api: 'polygon', loading: false, message: 'Polygon API OK ✅' });
      } else {
        setTesting({ api: 'polygon', loading: false, message: 'Polygon API Failed ❌' });
      }
    } catch (error) {
      setTesting({ api: 'polygon', loading: false, message: 'Polygon API Error ❌' });
    }
  };

  const configItems = [
    {
      name: 'User Account',
      icon: User,
      configured: !!user,
      details: user?.email || 'Not logged in'
    },
    {
      name: 'Wallet System',
      icon: Database,
      configured: !!wallet,
      details: wallet ? `Balance: $${wallet.balance_usd?.toFixed(2)}` : 'Not initialized'
    },
    {
      name: 'Trading Bots',
      icon: LineChart,
      configured: subscriptions.length > 0,
      details: `${subscriptions.length} active subscriptions`
    },
    {
      name: 'API Integrations',
      icon: Key,
      configured: true,
      details: 'Base44 SDK configured',
      testable: true,
      onTest: testPolygonAPI
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Profile & Settings</h1>
          <p className="text-slate-400">Manage your account and system configuration</p>
        </div>

        {/* User Info Card */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-white">{user?.full_name || 'Loading...'}</CardTitle>
                <p className="text-slate-400 text-sm">{user?.email}</p>
                <Badge className="mt-2 bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {user?.role || 'user'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">VIP Level</div>
                <div className="text-white font-semibold">{wallet?.vip_level || 'none'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">TFI Balance</div>
                <div className="text-white font-semibold">{wallet?.balance_tfi?.toFixed(2) || '0.00'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">USD Balance</div>
                <div className="text-white font-semibold">${wallet?.balance_usd?.toFixed(2) || '0.00'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Fuel Tokens</div>
                <div className="text-white font-semibold">{wallet?.fuel_tokens?.toFixed(0) || '0'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Configuration */}
        <Card className="bg-slate-900/50 border-slate-800 mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-400" />
              <CardTitle className="text-white">System Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {configItems.map((item) => (
              <div 
                key={item.name}
                className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    item.configured ? 'bg-emerald-500/20' : 'bg-slate-700'
                  }`}>
                    <item.icon className={`w-5 h-5 ${
                      item.configured ? 'text-emerald-400' : 'text-slate-500'
                    }`} />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.details}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.configured ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-500" />
                  )}
                  {item.testable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={item.onTest}
                      disabled={testing.loading}
                      className="border-slate-700"
                    >
                      {testing.loading && testing.api === 'polygon' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            {testing.message && (
              <div className={`p-3 rounded-lg text-sm ${
                testing.message.includes('✅') 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {testing.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* App Version */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">App Version</div>
                <div className="text-white font-semibold">1.0.0 (Web)</div>
              </div>
              <Shield className="w-8 h-8 text-slate-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}