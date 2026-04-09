import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

export default function BinanceBalanceCard({ balanceUsdt = 0, balances = [] }) {
  return (
    <Card className="bg-slate-900/50 border-slate-800 mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Wallet className="w-5 h-5 text-yellow-400" />
          Binance Баланс
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-white mb-4">
          {balanceUsdt?.toFixed(2) || '0.00'} <span className="text-lg text-slate-400">USDT</span>
        </div>
        {balances?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {balances.filter(b => (b.free || 0) + (b.locked || 0) > 0).slice(0, 9).map(b => (
              <div key={b.asset} className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500">{b.asset}</div>
                <div className="text-sm font-semibold text-white">{(b.free || 0).toFixed(b.free > 1 ? 2 : 6)}</div>
                {b.locked > 0 && <div className="text-xs text-amber-400">Locked: {b.locked.toFixed(b.locked > 1 ? 2 : 6)}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}