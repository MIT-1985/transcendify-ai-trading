import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, TrendingUp, AlertTriangle, BookOpen } from 'lucide-react';

// ── Chart Guide — practical checklist reference for live trading ──────────────
export default function ChartGuide() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-black text-white">Chart Guide</h1>
            <p className="text-slate-400 text-xs">Практически чеклист за анализ на графики · BTC-USDT</p>
          </div>
        </div>

        {/* Indicator Settings */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Индикатори — настройки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="text-left py-2 px-3 font-semibold">Индикатор</th>
                    <th className="text-left py-2 px-3 font-semibold">Период</th>
                    <th className="text-left py-2 px-3 font-semibold">Сигнал</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {[
                    ['EMA', '20 / 50 / 200', 'Тренд: бичи stack (20>50>200)'],
                    ['RSI', '14', '>70 overbought, <30 oversold'],
                    ['MACD', '12 / 26 / 9', 'Crossover: линия над/под сигнала'],
                    ['ATR', '14', 'Волатилност — размер на стоп'],
                    ['Volume', '—', 'Конфирмация: растящ обем = силен ход'],
                    ['Bollinger', '20, 2σ', 'Скатаване = ниска волатилност'],
                  ].map(([ind, period, signal]) => (
                    <tr key={ind} className="hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-bold text-white">{ind}</td>
                      <td className="py-2 px-3 text-slate-300 font-mono">{period}</td>
                      <td className="py-2 px-3 text-slate-400">{signal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Multi-timeframe Approach */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Мулти-таймфрейм подход
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['1D (дневен)', 'Голям тренд — посока на пазара', 'text-blue-400'],
              ['4H', 'Междинен тренд — структурата', 'text-purple-400'],
              ['15m', 'Тренд за вход — momentum', 'text-emerald-400'],
              ['1m', 'Прецизен вход — скалпинг', 'text-amber-400'],
            ].map(([tf, desc, color]) => (
              <div key={tf} className="flex items-start gap-3 bg-slate-800/50 rounded-lg p-3">
                <span className={`font-mono font-bold ${color} w-16 flex-shrink-0`}>{tf}</span>
                <span className="text-slate-300">{desc}</span>
              </div>
            ))}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-300 text-xs">
              ⚠️ Правило: търгувай САМО в посока на по-високия таймфрейм. 1m вход → 15m тренд → 4H/1D посока.
            </div>
          </CardContent>
        </Card>

        {/* 5-min Chart Opening Checklist */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Чеклист при отваряне на графиката (5 мин)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                'EMA 20 > EMA 50 > EMA 200? → бичи тренд (за BUY)',
                'EMA 20 < EMA 50 < EMA 200? → мечи тренд (за SELL)',
                'RSI между 40-60? → неутрална зона, изчакай breakout',
                'RSI > 70? → overbought, НЕ купувай',
                'RSI < 30? → oversold, НЕ продавай',
                'MACD хистограма расте? → momentum се засилва',
                'Обемът расте спрямо последните 5 свещи? → потвърждение',
                'Spread < 0.05%? → ниска тромавост, добре за скалп',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Daily Routine */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Дневна рутина
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="font-bold text-white mb-1">1. Проверка на макро (5 мин)</div>
              <div className="text-slate-400 text-xs">BTC доминация, Fear &amp; Greed индекс, новини. Определи общата посока.</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="font-bold text-white mb-1">2. Дневен график (3 мин)</div>
              <div className="text-slate-400 text-xs">EMA stack, RSI, ключови нива (support/resistance). Идентифицирай по-големия тренд.</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="font-bold text-white mb-1">3. 15m / 1m Скалп (постоянно)</div>
              <div className="text-slate-400 text-xs">Чакай сигнал: EMA crossover + RSI в зоната + volume confirmation. Изпълни.</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="font-bold text-white mb-1">4. Затваряне на деня (2 мин)</div>
              <div className="text-slate-400 text-xs">Преглед на сделките, P&amp;L, корекция на константи (TROK цикъл).</div>
            </div>
          </CardContent>
        </Card>

        {/* BTC Reference Points */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              BTC референтни точки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="text-left py-2 px-3 font-semibold">Ниво</th>
                    <th className="text-left py-2 px-3 font-semibold">Значение</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {[
                    ['$100K+', 'Психологическа бариера — силно съпротивление'],
                    ['$70-80K', 'Среден диапазон — боков пазар'],
                    ['$50-60K', 'Подкрепа при корекция'],
                    ['<$40K', 'Дълбока корекция — страх на пазара'],
                  ].map(([level, meaning]) => (
                    <tr key={level} className="hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono font-bold text-amber-400">{level}</td>
                      <td className="py-2 px-3 text-slate-300">{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pre-trade Checklist */}
        <Card className="bg-slate-900 border-emerald-800/50 border-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              Чеклист ПРЕДИ всяка сделка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                'Трендът на по-високия таймфрейм съвпада с посоката ми',
                'EMA stack потвърждава (20 > 50 за BUY)',
                'RSI не е в overbought/oversold зоната',
                'MACD показва momentum в моята посока',
                'Обемът расте (потвърждение на хода)',
                'Spread е под 0.08% (fee-aware)',
                'Stop-loss е на логично ниво (под EMA или ATR-based)',
                'Take-profit ≥ 2× stop-loss (R:R ≥ 2:1)',
                'Позицията е ≤ 100% от баланса (агресивно, но контролирано)',
                'Net profit след такси ≥ 0.05% от позицията',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Common Mistakes */}
        <Card className="bg-slate-900 border-red-800/50 border-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              Чести грешки — избягвай!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                'Търговия срещу по-високия таймфрейм (контра-тренд)',
                'Покупка при RSI > 70 (overbought)',
                'Игнориране на обема (фалшив breakout)',
                'Без stop-loss (надежда вместо логика)',
                'Прекалено голяма позиция при ниска увереност',
                'Мести stop-loss наназад (усредняване)',
                'Търговия при висок spread (> 0.1%)',
                'FOMO — влизане без пълен чеклист',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Golden Rule */}
        <Card className="bg-gradient-to-br from-amber-950/40 to-slate-950 border-2 border-amber-600">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 flex-shrink-0" />
              <div>
                <div className="font-black text-amber-400 text-lg mb-1">ЗЛАТНО ПРАВИЛО</div>
                <div className="text-slate-200 text-sm leading-relaxed">
                  По-добре да пропуснеш сделка, отколкото да влезеш без пълен чеклист.
                  Пазарът винаги дава нови възможности — капиталът е само един.
                  <span className="block mt-2 font-bold text-amber-300">
                    {'Дисциплината > Стратегията > Удачният момент.'}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}