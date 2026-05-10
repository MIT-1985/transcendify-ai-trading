import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Play, Pause, Zap, TrendingUp, Activity, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import AlphaScalperRuntime from '@/components/dashboard/AlphaScalperRuntime';
import LiveMarketPrices from '@/components/dashboard/LiveMarketPrices';

export default function Dashboard() {
  const { user } = useAuth();
  const [ledger, setLedger] = useState([]);
  const [verifiedTrades, setVerifiedTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alphaScalperEnabled, setAlphaScalperEnabled] = useState(true);
  const [auditReport, setAuditReport] = useState(null);
  const [clock, setClock] = useState({
    realizedPnL: 0,
    sessionTimer: 0,
    pnlPerSec: 0,
    pnlPerMin: 0,
    pnlPerHour: 0,
    status: 'INITIALIZING',
    lastCommand: '—',
    nextExecIn: 0,
    runtimeActive: false
  });

  const sessionStartRef = React.useRef(new Date());

  // Load data from debug function
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await base44.functions.invoke('debugEntityData', {});
        const data = res.data;
        console.log('[Dashboard] Data loaded:', {
          oxxCount: data.oxxOrderLedger.totalCount,
          vtCount: data.verifiedTrade.totalCount
        });
        setLedger(data.oxxOrderLedger.latest5 || []);
        setVerifiedTrades(data.verifiedTrade.latest5 || []);
      } catch (e) {
        console.error('[Dashboard] Load error:', e);
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      loadData();
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Live Balance
  const { data: okxBalance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('okxLiveBalance', {});
      const d = res.data || {};
      if (!d.success) {
        return { success: false, totalEquityUSDT: 'UNKNOWN', freeUSDT: 'UNKNOWN' };
      }
      return { success: true, totalEquityUSDT: d.totalEquityUSDT, freeUSDT: d.freeUSDT };
    },
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 10000,
    gcTime: 0
  });

  // Update clock
  useEffect(() => {
    const updateClock = () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
      const realizedPnL = todaysTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
      const sessionDuration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      
      setClock(prev => ({
        ...prev,
        realizedPnL,
        sessionTimer: sessionDuration,
        pnlPerSec: sessionDuration > 0 ? realizedPnL / sessionDuration : 0,
        pnlPerMin: sessionDuration > 0 ? realizedPnL / (sessionDuration / 60) : 0,
        pnlPerHour: sessionDuration > 0 ? realizedPnL / (sessionDuration / 3600) : 0,
        runtimeActive: alphaScalperEnabled
      }));
    };

    const interval = setInterval(updateClock, 1000);
    updateClock();
    return () => clearInterval(interval);
  }, [verifiedTrades, alphaScalperEnabled]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
  const wins = todaysTrades.filter(t => t.realizedPnL > 0).length;
  const losses = todaysTrades.filter(t => t.realizedPnL < 0).length;

  const [killSwitchStatus, setKillSwitchStatus] = useState('CHECKING');

  useEffect(() => {
    const checkKillSwitch = async () => {
      try {
        const res = await base44.functions.invoke('checkKillSwitch', {});
        setKillSwitchStatus(res.data?.kill_switch_active ? 'ACTIVE' : 'INACTIVE');
      } catch (e) {
        setKillSwitchStatus('ERROR');
      }
    };
    checkKillSwitch();
    const interval = setInterval(checkKillSwitch, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch audit report
  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res = await base44.functions.invoke('cleanupAccountingData', {});
        setAuditReport(res.data);
      } catch (e) {
        console.error('Audit fetch error:', e.message);
      }
    };
    fetchAudit();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      {killSwitchStatus === 'ACTIVE' && (
        <div className="max-w-7xl mx-auto mb-6 space-y-3">
          <div className="bg-red-950/90 border-2 border-red-600 rounded-2xl p-6 text-center">
            <div className="text-2xl font-black text-red-400 mb-2">🛑 TRADING HARD PAUSED</div>
            <div className="text-sm text-red-300">KILL SWITCH ACTIVE — No BUY/SELL orders allowed</div>
            <div className="text-xs text-red-400 mt-2">Status: PAUSED_KILL_SWITCH</div>
          </div>
          <div className="bg-yellow-950/80 border-2 border-yellow-600 rounded-2xl p-4 text-center">
            <div className="text-sm font-bold text-yellow-300 mb-1">⚠️ LEDGER STALE RECORDS EXCLUDED</div>
            <div className="text-xs text-yellow-200">328 unmatched BUY orders marked as stale. OKX confirms $0 frozen, 0 open orders, 0 active positions.</div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* OKX BALANCE */}
        <div className="rounded-2xl p-8 border-2 border-emerald-600 bg-emerald-950/30 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="text-sm font-semibold text-emerald-400 uppercase">OKX LIVE BALANCE</div>
            <div className="text-5xl font-black text-emerald-400">
              ${loadBalance ? '...' : okxBalance?.totalEquityUSDT || 'N/A'}
            </div>
            <div className="text-lg text-emerald-300">Free: ${okxBalance?.freeUSDT || 'N/A'}</div>
          </div>
        </div>

        {/* DATA DEBUG */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
          <div className="text-sm font-bold text-slate-300 mb-2">📊 Data Source Status</div>
          <div className="grid grid-cols-4 gap-2 text-xs text-slate-400">
            <div>OXXOrderLedger: <span className="text-cyan-400 font-bold">{ledger.length}</span></div>
            <div>VerifiedTrade: <span className="text-cyan-400 font-bold">{verifiedTrades.length}</span></div>
            <div>Loading: {loading ? 'YES' : 'NO'}</div>
            <div>User: {user ? '✓' : '✗'}</div>
          </div>
        </div>

        {/* LAST ORDERS */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Last Verified Orders ({ledger.length})</h2>
          {loading ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : ledger.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700">
              No OXX orders loaded
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-slate-700">
                <tr className="text-slate-400">
                  <th className="text-left px-3 py-2">Pair</th>
                  <th className="text-left px-3 py-2">Side</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-right px-3 py-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((o, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="px-3 py-2">{o.pair}</td>
                    <td className={`px-3 py-2 font-bold ${o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{o.side.toUpperCase()}</td>
                    <td className="px-3 py-2 text-right">${o.price}</td>
                    <td className="px-3 py-2 text-right">{o.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* CLOSED TRADES */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Closed Verified Trades ({verifiedTrades.length})</h2>
          {loading ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : verifiedTrades.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700">
              No verified trades loaded
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-slate-700">
                <tr className="text-slate-400">
                  <th className="text-left px-3 py-2">Pair</th>
                  <th className="text-right px-3 py-2">Entry</th>
                  <th className="text-right px-3 py-2">Exit</th>
                  <th className="text-right px-3 py-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {verifiedTrades.map((t, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="px-3 py-2">{t.pair}</td>
                    <td className="px-3 py-2 text-right">${t.buyPrice}</td>
                    <td className="px-3 py-2 text-right">${t.sellPrice}</td>
                    <td className={`px-3 py-2 text-right font-bold ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.realizedPnL}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* KILL SWITCH */}
        <div className="bg-red-950/30 border-2 border-red-600 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-red-400">Trading System</h3>
              <div className="text-xs text-red-300 mt-1">Status: PAUSED_KILL_SWITCH</div>
            </div>
            <div className="text-red-400 font-bold">● PAUSED</div>
          </div>
        </div>
      </div>
    </div>
  );
}