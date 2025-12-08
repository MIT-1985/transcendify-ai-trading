import React, { useState } from 'react';
import BacktestEngine from '@/components/backtesting/BacktestEngine';
import BacktestResults from '@/components/backtesting/BacktestResults';
import { Activity } from 'lucide-react';

export default function Backtesting() {
  const [results, setResults] = useState(null);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8 text-purple-400" />
            Strategy Backtesting
          </h1>
          <p className="text-slate-400 mt-2">
            Test trading strategies against historical data to evaluate performance
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <BacktestEngine onResultsReady={setResults} />
          </div>
          <div className="lg:col-span-2">
            <BacktestResults results={results} />
          </div>
        </div>
      </div>
    </div>
  );
}