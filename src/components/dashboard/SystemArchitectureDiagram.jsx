import React from 'react';

const LAYERS = [
  {
    id: 'polygon',
    icon: '🧠',
    label: 'Polygon.io',
    role: 'МОЗЪК / СИГНАЛ',
    color: 'blue',
    border: 'border-blue-500',
    bg: 'bg-blue-950/40',
    badge: 'bg-blue-900 text-blue-200',
    glow: 'shadow-blue-900/50',
    items: ['30-дневни свещи (daily bars)', 'Тренд: BULLISH / BEARISH', 'Моментум % промяна', 'Обем делта', 'Волатилност', 'Composite Signal Score'],
  },
  {
    id: 'constants',
    icon: '⚙️',
    label: 'Optimizing Constants',
    role: 'ФИЛТЪР / РИСК / АДАПТАЦИЯ',
    color: 'purple',
    border: 'border-purple-500',
    bg: 'bg-purple-950/40',
    badge: 'bg-purple-900 text-purple-200',
    glow: 'shadow-purple-900/50',
    items: ['K_TP = 0.45% (Take Profit)', 'K_SL = -0.25% (Stop Loss)', 'K_SPREAD = 0.03% (макс. спред)', 'K_SCORE = 70 (мин. оценка)', 'K_FEE_MIN_NET = 0.03$ (мин. чиста печалба)', 'OKX_TAKER_FEE = 0.1%'],
  },
  {
    id: 'okx',
    icon: '⚡',
    label: 'OKX Exchange',
    role: 'РЕАЛНО ИЗПЪЛНЕНИЕ',
    color: 'emerald',
    border: 'border-emerald-500',
    bg: 'bg-emerald-950/40',
    badge: 'bg-emerald-900 text-emerald-200',
    glow: 'shadow-emerald-900/50',
    items: ['Реален bid/ask в реално време', 'Spread изчисление', 'Ликвидност на order book', 'BUY / SELL изпълнение', 'Fee верификация (0.1% taker)', 'Order потвърждение'],
  },
  {
    id: 'dashboard',
    icon: '📊',
    label: 'Dashboard',
    role: 'ДОКАЗАТЕЛСТВО',
    color: 'yellow',
    border: 'border-yellow-500',
    bg: 'bg-yellow-950/40',
    badge: 'bg-yellow-900 text-yellow-200',
    glow: 'shadow-yellow-900/50',
    items: ['Clean PnL (дедупликиран)', 'Верифицирани trades с ordId', 'Win rate & комисиони', 'Equity в реално време', 'Audit trail на всяка сделка', 'Kill Switch статус'],
  },
];

const COLOR_ARROW = {
  blue: 'text-blue-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
  yellow: 'text-yellow-400',
};

export default function SystemArchitectureDiagram() {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
      {/* Title */}
      <div className="text-center mb-6">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Системна Архитектура</div>
        <h2 className="text-xl font-black text-white">Как Работи Роботът</h2>
      </div>

      {/* Pipeline */}
      <div className="flex flex-col lg:flex-row items-stretch gap-0">
        {LAYERS.map((layer, i) => (
          <React.Fragment key={layer.id}>
            {/* Card */}
            <div className={`flex-1 rounded-xl border-2 ${layer.border} ${layer.bg} p-4 shadow-lg ${layer.glow} flex flex-col`}>
              {/* Header */}
              <div className="text-center mb-3">
                <div className="text-3xl mb-1">{layer.icon}</div>
                <div className="font-black text-white text-sm">{layer.label}</div>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${layer.badge}`}>
                  {layer.role}
                </span>
              </div>

              {/* Items */}
              <ul className="space-y-1.5 mt-2">
                {layer.items.map((item, j) => (
                  <li key={j} className={`text-xs text-slate-300 flex items-start gap-1.5`}>
                    <span className={`mt-0.5 shrink-0 ${COLOR_ARROW[layer.color]}`}>›</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Arrow between cards */}
            {i < LAYERS.length - 1 && (
              <div className="flex items-center justify-center px-1 py-4 lg:py-0 lg:px-0">
                {/* Desktop: right arrow */}
                <div className="hidden lg:flex flex-col items-center px-2">
                  <div className="text-slate-500 text-xl">→</div>
                  <div className="text-xs text-slate-600 mt-1 text-center" style={{ maxWidth: 60 }}>
                    {i === 0 ? 'сигнал' : i === 1 ? 'филтър' : 'резултат'}
                  </div>
                </div>
                {/* Mobile: down arrow */}
                <div className="lg:hidden flex flex-col items-center py-1">
                  <div className="text-slate-500 text-xl">↓</div>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Flow description */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
        <FlowStep num="1" color="blue" title="Сигнал от Polygon" desc="Polygon анализира 30-дневни свещи и дава trend, momentum, volume delta и volatility score за всяка крипто двойка." />
        <FlowStep num="2" color="purple" title="Филтриране с Constants" desc="Optimizing Constants дефинират минималния score, минималната чиста печалба след такси и максималния риск. Само сигнали над прага преминават напред." />
        <FlowStep num="3" color="emerald" title="Изпълнение на OKX" desc="OKX дава реален bid/ask, пресмята spread и ликвидност. Ако сигналът е BUY_READY, роботът изпълнява market order и верифицира fill-а." />
      </div>

      {/* Bottom note */}
      <div className="mt-4 text-center text-xs text-slate-500 border-t border-slate-800 pt-4">
        Всяка сделка се записва в Dashboard-а с пълен ordId, реален PnL и комисиони — <span className="text-yellow-400 font-bold">доказателство за всяко действие</span>.
      </div>
    </div>
  );
}

function FlowStep({ num, color, title, desc }) {
  const colorMap = {
    blue: 'bg-blue-900 text-blue-300 border-blue-700',
    purple: 'bg-purple-900 text-purple-300 border-purple-700',
    emerald: 'bg-emerald-900 text-emerald-300 border-emerald-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="font-black text-sm mb-1">Стъпка {num}: {title}</div>
      <div className="text-xs opacity-80">{desc}</div>
    </div>
  );
}