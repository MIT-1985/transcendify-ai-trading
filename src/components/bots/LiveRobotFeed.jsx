/**
 * Какво прави роботът в момента.
 *
 * Това е витрината: клиентът купува робот, който решава сам, и единственият
 * начин да му вярва е да вижда решенията, докато се вземат - включително
 * когато роботът ОТКАЗВА да търгува. Празен екран между сделките изглежда
 * като счупен продукт, а всъщност е най-честата и най-правилна работа.
 */
import React from 'react';
import { useLiveEvents } from '@/hooks/useLiveEvents';

const STYLE = {
  cycle:  { dot: 'bg-slate-400',   label: 'оглед' },
  signal: { dot: 'bg-blue-400',    label: 'сигнал' },
  trok:   { dot: 'bg-violet-400',  label: 'TROK' },
  risk:   { dot: 'bg-amber-400',   label: 'риск' },
  order:  { dot: 'bg-emerald-400', label: 'поръчка' },
  fill:   { dot: 'bg-emerald-500', label: 'изпълнение' },
  close:  { dot: 'bg-slate-300',   label: 'затваряне' },
  error:  { dot: 'bg-red-500',     label: 'грешка' },
};

function timeOf(ts) {
  try {
    return new Date(ts).toLocaleTimeString('bg-BG', { hour12: false });
  } catch {
    return '';
  }
}

export default function LiveRobotFeed({ limit = 40 }) {
  const { events, connected } = useLiveEvents({ keep: limit });
  // Най-новото отгоре - човек гледа последното, не първото.
  const shown = [...events].reverse();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">Роботът в момента</h3>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}
          />
          {connected ? 'на линия' : 'без връзка'}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          Изчаква се първото решение. Тишината между сделките е нормална -
          роботът отказва повече пъти, отколкото влиза.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto">
          {shown.map((ev) => {
            const s = STYLE[ev.kind] ?? STYLE.cycle;
            return (
              <li key={ev.seq} className="flex items-start gap-2.5 text-xs">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-slate-500 tabular-nums shrink-0">{timeOf(ev.ts)}</span>
                <span className="text-slate-500 shrink-0 w-16">{s.label}</span>
                <span className="text-slate-200 flex-1">{ev.message}</span>
                {ev.instId && <span className="text-slate-500 shrink-0">{ev.instId}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
