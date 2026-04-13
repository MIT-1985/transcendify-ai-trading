import React, { useState, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend
} from 'recharts';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

const SENTIMENT_COLORS = { Bullish: '#10b981', Neutral: '#f59e0b', Bearish: '#ef4444' };

const MeterGauge = ({ value, label }) => {
  // value 0-100, 50 = neutral
  const angle = -90 + (value / 100) * 180;
  const color = value > 65 ? '#10b981' : value < 35 ? '#ef4444' : '#f59e0b';
  const sentiment = value > 65 ? 'Greed' : value < 35 ? 'Fear' : 'Neutral';
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-32 h-20">
        {/* Background arc */}
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        {/* Value arc */}
        <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${(value / 100) * 157} 157`} strokeLinecap="round" />
        {/* Needle */}
        <line
          x1="60" y1="60"
          x2={60 + 35 * Math.cos((angle * Math.PI) / 180)}
          y2={60 + 35 * Math.sin((angle * Math.PI) / 180)}
          stroke="white" strokeWidth="2" strokeLinecap="round"
        />
        <circle cx="60" cy="60" r="4" fill="white" />
        <text x="60" y="52" textAnchor="middle" fill={color} fontSize="12" fontWeight="bold">{value}</text>
      </svg>
      <div style={{ color }} className="text-sm font-bold -mt-2">{sentiment}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
};

const PortfolioDonut = ({ data }) => {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + r * Math.sin(-midAngle * Math.PI / 180);
    return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="10">{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" labelLine={false} label={<CustomLabel />}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          formatter={(val, name) => [`${val.toFixed(2)}%`, name]}
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
        />
        <Legend iconSize={8} formatter={val => <span className="text-xs text-slate-300">{val}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
};

const VolumeMetric = ({ prices }) => {
  const maxVol = Math.max(...prices.map(p => p.volume || 0));
  return (
    <div className="space-y-2">
      {prices.map((p, i) => {
        const pct = maxVol > 0 ? ((p.volume || 0) / maxVol) * 100 : 0;
        const isPos = p.change >= 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-16 flex-shrink-0">{p.symbol?.split('/')[0]}</span>
            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: isPos ? '#10b981' : '#ef4444' }}
              />
            </div>
            <span className={`text-xs font-mono w-12 text-right ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '+' : ''}{p.change?.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function MarketMetrics({ prices = [] }) {
  const [fearGreed, setFearGreed] = useState(62);
  const [portfolio, setPortfolio] = useState([]);

  useEffect(() => {
    // Simulate fear & greed based on price changes
    if (prices.length > 0) {
      const avgChange = prices.reduce((s, p) => s + (p.change || 0), 0) / prices.length;
      const normalized = Math.min(100, Math.max(0, 50 + avgChange * 5));
      setFearGreed(Math.round(normalized));
    }
  }, [prices]);

  useEffect(() => {
    if (prices.length > 0) {
      const totalVol = prices.reduce((s, p) => s + (p.volume || 1), 0);
      setPortfolio(prices.map(p => ({
        name: p.symbol?.split('/')[0] || p.symbol,
        value: totalVol > 0 ? ((p.volume || 0) / totalVol) * 100 : 100 / prices.length
      })));
    }
  }, [prices]);

  const radarData = [
    { metric: 'Momentum', value: Math.min(100, 50 + (prices[0]?.change || 0) * 3) },
    { metric: 'Volume', value: 65 },
    { metric: 'Volatility', value: 45 },
    { metric: 'Sentiment', value: fearGreed },
    { metric: 'Trend', value: 70 },
    { metric: 'RSI', value: 55 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Fear & Greed */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Market Sentiment</h3>
        </div>
        <div className="flex flex-col items-center py-2">
          <MeterGauge value={fearGreed} label="Fear & Greed Index" />
          <div className="flex gap-3 mt-3 text-xs">
            <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400" />Fear</span>
            <span className="flex items-center gap-1 text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400" />Neutral</span>
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400" />Greed</span>
          </div>
        </div>
      </div>

      {/* Portfolio Allocation by Volume */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Volume Allocation</h3>
        </div>
        {portfolio.length > 0 ? <PortfolioDonut data={portfolio} /> : (
          <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
        )}
      </div>

      {/* Volume + Price Change */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">24h Performance</h3>
        </div>
        {prices.length > 0 ? (
          <VolumeMetric prices={prices} />
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-500 text-sm">Loading...</div>
        )}
        <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-400">Bullish Assets</div>
            <div className="text-emerald-400 font-bold text-lg">{prices.filter(p => p.change > 0).length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Bearish Assets</div>
            <div className="text-red-400 font-bold text-lg">{prices.filter(p => p.change <= 0).length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}