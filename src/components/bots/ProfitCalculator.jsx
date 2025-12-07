import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator } from 'lucide-react';

export default function ProfitCalculator({ bot }) {
  const [capital, setCapital] = useState(1000);
  const [days, setDays] = useState(30);

  const expectedRoiRange = bot?.expected_roi || '5-15%';
  const minRoi = parseFloat(expectedRoiRange.split('-')[0]) / 100;
  const maxRoi = parseFloat(expectedRoiRange.split('-')[1]?.replace('%', '') || expectedRoiRange.replace('%', '')) / 100;

  const minProfit = capital * minRoi * (days / 30);
  const maxProfit = capital * maxRoi * (days / 30);
  const avgProfit = (minProfit + maxProfit) / 2;

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Profit Calculator</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-slate-400 text-sm">Initial Capital ($)</Label>
          <Input
            type="number"
            value={capital}
            onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
            className="bg-slate-800 border-slate-700 text-white mt-1"
          />
        </div>

        <div>
          <Label className="text-slate-400 text-sm">Trading Period (days)</Label>
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(parseFloat(e.target.value) || 0)}
            className="bg-slate-800 border-slate-700 text-white mt-1"
          />
        </div>

        <div className="pt-4 border-t border-slate-700 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Expected ROI</span>
            <span className="text-white font-semibold">{expectedRoiRange} / month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Estimated Profit</span>
            <div className="text-right">
              <div className="text-xl font-bold text-emerald-400">
                ${avgProfit.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">
                ${minProfit.toFixed(2)} - ${maxProfit.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Final Balance</span>
            <span className="text-white font-semibold">${(capital + avgProfit).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500 italic">
        * Estimates based on historical performance. Actual results may vary.
      </div>
    </Card>
  );
}