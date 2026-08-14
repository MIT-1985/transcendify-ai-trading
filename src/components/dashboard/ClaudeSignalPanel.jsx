import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Activity, Brain, Cpu, AlertTriangle, Loader2 } from 'lucide-react';

// ── Claude Signal Indicator — pulsing circle with confidence ─────────────────
function ClaudeSignalIndicator({ signal, loading, onExecute, autoMode, executing }) {
  if (loading && !signal) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const action = signal?.claudeAction || 'WAIT';
  const confidence = signal?.claudeConfidence || 0;
  const positionUSDT = signal?.claudePositionUSDT || 0;
  const tp = signal?.claudeTpPercent || 0;
  const sl = signal?.claudeSlPercent || 0;
  const checklistPass = signal?.checklistPass || [];
  const checklistFail = signal?.failedBarriers || [];

  const color = action === 'BUY' ? 'emerald' : action === 'SELL' ? 'red' : 'slate';
  const ringColor = action === 'BUY' ? 'border-emerald-500' : action === 'SELL' ? 'border-red-500' : 'border-slate-600';
  const bgColor = action === 'BUY' ? 'bg-emerald-500' : action === 'SELL' ? 'bg-red-500' : 'bg-slate-600';
  const textColor = action === 'BUY' ? 'text-emerald-400' : action === 'SELL' ? 'text-red-400' : 'text-slate-400';

  const canExecute = autoMode && action === 'BUY' && confidence >= 75 && !executing;

  return (
    <Card className={`bg-slate-900 border-2 ${ringColor}`}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          Claude Signal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pulsing circle */}
        <div className="flex flex-col items-center py-4">
          <div className={`relative w-32 h-32 rounded-full ${bgColor} ${action !== 'WAIT' ? 'animate-pulse' : ''} flex items-center justify-center border-4 ${ringColor} bg-opacity-20`}>
            <div className="text-center">
              <div className={`text-4xl font-black ${textColor}`}>{action}</div>
              <div className={`text-2xl font-bold ${textColor}`}>{confidence.toFixed(0)}%</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            {signal ? `Обновен: ${new Date(signal.timestamp).toLocaleTimeString('de-DE')}` : 'Няма сигнал'}
          </div>
        </div>

        {/* Signal details */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">Позиция</div>
            <div className="font-bold text-white">{positionUSDT > 0 ? `$${positionUSDT.toFixed(2)}` : '—'}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">TP</div>
            <div className="font-bold text-emerald-400">{tp > 0 ? `+${tp}%` : '—'}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2 text-center">
            <div className="text-xs text-slate-400">SL</div>
            <div className="font-bold text-red-400">{sl > 0 ? `-${sl}%` : '—'}</div>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-400 uppercase">Чеклист</div>
          {checklistPass.length === 0 && checklistFail.length === 0 ? (
            <div className="text-xs text-slate-500">Няма данни</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {checklistPass.map((c, i) => (
                <span key={`p${i}`} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                  ✓ {c}
                </span>
              ))}
              {checklistFail.map((c, i) => (
                <span key={`f${i}`} className="text-xs bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded">
                  ✗ {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reasoning */}
        {signal?.claudeReasoning && (
          <div className="bg-slate-800/30 rounded-lg p-3 text-xs text-slate-300 max-h-32 overflow-y-auto">
            {signal.claudeReasoning}
          </div>
        )}

        {/* Execute button */}
        {canExecute && (
          <Button
            onClick={onExecute}
            disabled={executing}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
          >
            {executing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
            Изпълни Авто (BUY ≥75%)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Auto/Manual Toggle ────────────────────────────────────────────────────────
function AutoManualToggle({ autoMode, onToggle, disabled }) {
  return (
    <Card className={`bg-slate-900 border-2 ${autoMode ? 'border-amber-500' : 'border-slate-700'}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className={`w-6 h-6 ${autoMode ? 'text-amber-400' : 'text-slate-400'}`} />
            <div>
              <div className="font-bold text-white text-sm">
                {autoMode ? 'AUTO РЕЖИМ' : 'MANUAL РЕЖИМ'}
              </div>
              <div className="text-xs text-slate-400">
                {autoMode ? 'Авто-изпълнение при BUY ≥75%' : 'Ръчно потвърждение за всяка сделка'}
              </div>
            </div>
          </div>
          <button
            onClick={onToggle}
            disabled={disabled}
            className={`relative w-14 h-7 rounded-full transition-colors ${autoMode ? 'bg-amber-500' : 'bg-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${autoMode ? 'translate-x-7' : ''}`} />
          </button>
        </div>
        {autoMode && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>ВНИМАНИЕ: Авто режимът ще изпълнява реални сделки при BUY сигнал ≥75% увереност.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── TROK Epoch Panel ───────────────────────────────────────────────────────────
function TrokEpochPanel({ constants, onOptimize, optimizing }) {
  if (!constants) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            TROK Константи
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-slate-500 text-sm">Няма инициализирани константи</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            TROK Константи
          </CardTitle>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
            epoch {constants.epoch || 1}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
          {[
            ['K_TP', constants.K_TP, 'text-emerald-400'],
            ['K_SL', constants.K_SL, 'text-red-400'],
            ['K_SIZE', constants.K_SIZE, 'text-blue-400'],
            ['K_COOLDOWN', `${constants.K_COOLDOWN}s`, 'text-amber-400'],
            ['K_QUALITY', constants.K_QUALITY, 'text-purple-400'],
            ['K_HOLD', `${constants.K_HOLD}m`, 'text-slate-300'],
          ].map(([label, val, color]) => (
            <div key={label} className="bg-slate-800/50 rounded-lg p-2 flex justify-between">
              <span className="text-slate-400">{label}</span>
              <span className={`font-bold ${color}`}>{val}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          Обновен: {constants.created_date ? new Date(constants.created_date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
        </div>
        <Button
          onClick={onOptimize}
          disabled={optimizing}
          variant="outline"
          className="w-full border-cyan-600 text-cyan-400 hover:bg-cyan-500/10"
        >
          {optimizing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
          TROK Оптимизация (Claude)
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Fee Breakdown Row ──────────────────────────────────────────────────────────
function FeeBreakdownRow({ signal, available }) {
  if (!signal || signal.claudeAction !== 'BUY') return null;

  const position = Math.min(signal.claudePositionUSDT || 0, available);
  if (position <= 0) return null;

  const tp = signal.claudeTpPercent || 1.2;
  const grossProfit = position * (tp / 100);
  const fees = position * 0.001 * 2;
  const spreadCost = position * 0.0002;
  const net = grossProfit - fees - spreadCost;
  const netPct = (net / position) * 100;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-6">
        <div className="text-xs font-bold text-slate-400 uppercase mb-3">Fee анализ (предложена позиция)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Брутна печалба</div>
            <div className="font-bold text-emerald-400">+{grossProfit.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Такси (0.1%×2)</div>
            <div className="font-bold text-red-400">-{fees.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Спред</div>
            <div className="font-bold text-amber-400">-{spreadCost.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <div className="text-xs text-slate-400">Нетна печалба</div>
            <div className={`font-bold ${net > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {net >= 0 ? '+' : ''}{net.toFixed(4)} ({netPct.toFixed(3)}%)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export {
  ClaudeSignalIndicator,
  AutoManualToggle,
  TrokEpochPanel,
  FeeBreakdownRow,
};