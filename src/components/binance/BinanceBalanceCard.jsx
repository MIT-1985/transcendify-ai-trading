import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, RefreshCw, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#EC4899'];

export default function BinanceBalanceCard({ balanceUsdt = 0, balances = [], onRefresh, isRefreshing = false }) {
  const [view, setView] = useState('table'); // 'table' | 'chart'

  const validBalances = (balances || []).filter(b => (b.free || 0) + (b.locked || 0) > 0.000001);

  const chartData = validBalances.slice(0, 8).map(b => ({
    name: b.asset,
    value: parseFloat(((b.free || 0) + (b.locked || 0)).toFixed(8))
  }));

  return (
    <Card className="bg-slate-900/50 border-slate-800 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-400" />
            Binance Баланс
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
              <button
                onClick={() => setView('table')}
                className={`px-3 py-1.5 transition-colors ${view === 'table' ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Таблица
              </button>
              <button
                onClick={() => setView('chart')}
                className={`px-3 py-1.5 transition-colors ${view === 'chart' ? 'bg-yellow-500 text-black font-semibold' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Диаграма
              </button>
            </div>
            {onRefresh && (
              <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing} className="border-slate-700 h-7 px-2">
                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Total balance */}
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg inline-block">
          <div className="text-xs text-slate-400 mb-0.5">Общо USDT/USDC</div>
          <div className="text-2xl font-bold text-yellow-400">
            ${balanceUsdt?.toFixed(2) || '0.00'}
          </div>
        </div>

        {validBalances.length === 0 ? (
          <div className="text-slate-500 text-sm">Няма активи с баланс</div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-slate-500 font-medium pb-2 pr-4">Актив</th>
                  <th className="text-right text-slate-500 font-medium pb-2 pr-4">Свободно</th>
                  <th className="text-right text-slate-500 font-medium pb-2 pr-4">Заключено</th>
                  <th className="text-right text-slate-500 font-medium pb-2">Общо</th>
                </tr>
              </thead>
              <tbody>
                {validBalances.map((b, i) => {
                  const total = (b.free || 0) + (b.locked || 0);
                  const decimals = total < 1 ? 6 : 4;
                  return (
                    <tr key={b.asset} className={`border-b border-slate-800/50 ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                      <td className="py-2 pr-4 font-semibold text-white">{b.asset}</td>
                      <td className="py-2 pr-4 text-right text-emerald-400">{(b.free || 0).toFixed(decimals)}</td>
                      <td className="py-2 pr-4 text-right text-amber-400">
                        {b.locked > 0 ? (b.locked || 0).toFixed(decimals) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2 text-right text-white font-medium">{total.toFixed(decimals)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                  formatter={(value, name) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 min-w-[120px]">
              {chartData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-300">{item.name}</span>
                  <span className="text-slate-500 ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}