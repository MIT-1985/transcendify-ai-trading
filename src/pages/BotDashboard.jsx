import React, { useEffect, useState, useCallback } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/**
 * Целият продукт на един екран.
 *
 * Досега имаше трийсет и пет страници и нито една не показваше четирите неща,
 * заради които човек идва: какви са роботите, колко струват, какво вижда
 * роботът в момента и какво е направил. Тук няма нищо друго.
 *
 * Данните идват от три адреса - /api/robots, /api/robots/:id/buy,
 * /api/robots/:id/market. Ако двигателят не отговаря, екранът го казва вместо
 * да показва нули, които изглеждат като истински числа.
 */

const API = import.meta.env?.VITE_ENGINE_URL ?? 'http://127.0.0.1:8787';

const VERDICT = {
  BUY:   { text: 'ВХОД',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  WAIT:  { text: 'ЧАКА',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  AVOID: { text: 'ИЗБЯГВА', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

function money(n) {
  return n >= 1000 ? n.toLocaleString('bg-BG', { maximumFractionDigits: 0 })
                   : n.toFixed(n >= 1 ? 2 : 4);
}

export default function BotDashboard() {
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [pair, setPair] = useState(null);
  const [market, setMarket] = useState(null);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [buying, setBuying] = useState(null);

  const loadCatalogue = useCallback(() => {
    fetch(`${API}/api/robots`)
      .then(r => r.json())
      .then(setCat)
      .catch(e => setErr(`двигателят не отговаря на ${API} — ${e.message}`));
  }, []);

  useEffect(loadCatalogue, [loadCatalogue]);

  // Пазарът се пита при отваряне и после на всеки 15 секунди. Не по-често:
  // OKX ограничава, а свещ от една минута не се променя десет пъти в минутата.
  useEffect(() => {
    if (!openId) return;
    let alive = true;
    const pull = () => {
      setLoadingMarket(true);
      fetch(`${API}/api/robots/${openId}/market${pair ? `?pair=${pair}` : ''}`)
        .then(r => r.json())
        .then(d => { if (alive) setMarket(d); })
        .catch(e => { if (alive) setMarket({ error: e.message }); })
        .finally(() => { if (alive) setLoadingMarket(false); });
    };
    pull();
    const t = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [openId, pair]);

  /**
   * Купуването - единственото място, което трябва да се смени за Stripe.
   *
   * Сега записва лиценз направо, защото плащане още няма. Когато влезе
   * Stripe, тук се създава checkout сесия и лицензът се пише чак от
   * webhook-а - не оттук: браузърът може да излъже, че е платено, а
   * webhook-ът идва от Stripe и се подписва.
   */
  const buy = async (id) => {
    setBuying(id);
    try {
      await fetch(`${API}/api/robots/${id}/buy`, { method: 'POST' });
      loadCatalogue();
      setOpenId(id);
      setPair(null);
    } finally {
      setBuying(null);
    }
  };

  if (err) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-slate-200 flex items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <div className="text-rose-400 text-lg mb-2">Няма връзка с двигателя</div>
          <div className="text-slate-400 text-sm">{err}</div>
          <div className="text-slate-500 text-xs mt-4">Пусни го с <code className="text-slate-300">npm start</code> в папка engine.</div>
        </div>
      </div>
    );
  }

  if (!cat) {
    return <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center text-slate-500">зарежда…</div>;
  }

  const open = cat.robots.find(r => r.id === openId);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-10">

        <header className="mb-8">
          <h1 className="text-3xl font-semibold text-white">Роботи</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Шест стратегии. Купуваш веднъж, ползваш завинаги. Ключовете за борсата остават твои.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge ok={cat.mode === 'paper'} label={cat.mode === 'paper' ? 'Режим: хартия — нищо не отива към борсата' : 'Режим: ИСТИНСКИ'} />
            <Badge ok={!cat.realOrdersAllowed} label={cat.realOrdersAllowed ? 'Истински поръчки: РАЗРЕШЕНИ' : 'Истински поръчки: спрени'} />
            <span className="px-2 py-1 rounded border border-slate-700 text-slate-400">
              Купени: {cat.ownedCount} от {cat.robots.length}
            </span>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {cat.robots.map(r => (
            <button
              key={r.id}
              onClick={() => { setOpenId(r.id); setPair(null); setMarket(null); }}
              className={`text-left rounded-xl border p-5 transition flex flex-col h-full
                ${openId === r.id ? 'border-sky-500/60 bg-sky-500/5' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-white font-medium">{r.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{r.strategy}</div>
                </div>
                {r.owned
                  ? <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">купен</span>
                  : <span className="text-white font-semibold">${r.priceUsd}</span>}
              </div>

              <p className="text-sm text-slate-400 mt-3 leading-relaxed flex-1">{r.summary}</p>

              <dl className="grid grid-cols-3 gap-2 mt-4 text-xs">
                <Stat k="стоп" v={`${r.stopPct}%`} />
                <Stat k="цел" v={`1:${r.rewardRisk}`} />
                <Stat k="нула при" v={`${r.breakevenWinRatePct}%`} />
              </dl>
              <div className="text-[11px] text-slate-500 mt-2">
                {r.pairs.join(' · ')} · вход {r.entry === 'limit' ? 'лимитен' : 'пазарен'}
              </div>

              {!r.owned && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); buy(r.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); buy(r.id); } }}
                  className="mt-4 w-full text-center text-sm py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white"
                >
                  {buying === r.id ? 'купува…' : `Купи за $${r.priceUsd} — доживотно`}
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Всичките шест: <span className="text-slate-300">${cat.bundlePriceUsd}</span> доживотно.
          Процентът „нула при“ е сметнат с таксите на OKX — под него роботът губи пари, колкото и добре да изглежда.
        </div>

        {open && <MarketPanel robot={open} market={market} loading={loadingMarket} pair={pair} onPair={setPair} />}
      </div>
    </div>
  );
}

function Badge({ ok, label }) {
  return (
    <span className={`px-2 py-1 rounded border ${ok
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>{label}</span>
  );
}

function Stat({ k, v }) {
  return (
    <div>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-200 font-medium">{v}</dd>
    </div>
  );
}

/** Данните, графиката и сделките — точно в този ред, защото така се гледа. */
function MarketPanel({ robot, market, loading, pair, onPair }) {
  if (!market) {
    return <div className="mt-8 text-slate-500 text-sm">зарежда пазара за {robot.name}…</div>;
  }
  if (market.error) {
    return <div className="mt-8 text-rose-400 text-sm">{market.error}</div>;
  }

  const v = VERDICT[market.verdict.action] ?? VERDICT.WAIT;
  // Оста се форматира според свещта, не винаги като час: при дневни свещи
  // "18:00" се повтаряше двайсет пъти и графиката изглеждаше счупена.
  const daily = /D|W|H$/.test(market.bar ?? '') && !/m$/.test(market.bar ?? '');
  const label = (ms) => {
    const d = new Date(ms);
    if (/D|W/.test(market.bar ?? '')) return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
    if (daily) return d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit' });
    return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  };
  const data = market.candles.map(c => ({ t: label(c.t), c: c.c, h: c.h, l: c.l }));
  const lows = market.candles.map(c => c.l);
  const highs = market.candles.map(c => c.h);

  return (
    <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl text-white font-medium">{robot.name} · {market.pair}</h2>
          <div className="text-sm text-slate-400">
            <span className="text-white text-lg font-semibold">{money(market.price)}</span>
            <span className={market.change24hPct >= 0 ? 'text-emerald-400 ml-2' : 'text-rose-400 ml-2'}>
              {market.change24hPct >= 0 ? '+' : ''}{market.change24hPct}% за 24ч
            </span>
            <span className="text-slate-500 ml-3">спред {market.spreadPct}%</span>
            {loading && <span className="text-slate-600 ml-3">обновява…</span>}
          </div>
        </div>

        <div className="flex gap-1">
          {robot.pairs.map(p => (
            <button
              key={p}
              onClick={() => onPair(p)}
              className={`text-xs px-3 py-1.5 rounded border ${
                (pair ?? market.pair) === p
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-300'
                  : 'border-slate-800 text-slate-400 hover:border-slate-700'}`}
            >{p.replace('-USDT', '')}</button>
          ))}
        </div>
      </div>

      <div className={`mt-4 inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${v.cls}`}>
        <span className="font-semibold text-sm">{v.text}</span>
        <span className="text-sm opacity-90">{market.verdict.reason}</span>
      </div>

      <div className="h-72 mt-6">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={48} axisLine={false} tickLine={false} />
            <YAxis
              domain={[Math.min(...lows), Math.max(...highs)]}
              tick={{ fill: '#64748b', fontSize: 11 }}
              width={70}
              axisLine={false}
              tickLine={false}
              tickFormatter={money}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }}
              formatter={(val) => money(val)}
            />
            <Area type="monotone" dataKey="c" stroke="#38bdf8" strokeWidth={1.5} fill="url(#fill)" name="цена" />
            {market.indicators.ema21 != null && (
              <ReferenceLine y={market.indicators.ema21} stroke="#f59e0b" strokeDasharray="4 4" />
            )}
            {market.indicators.ema9 != null && (
              <ReferenceLine y={market.indicators.ema9} stroke="#a78bfa" strokeDasharray="4 4" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
        <Cell k="EMA9" v={market.indicators.ema9 != null ? money(market.indicators.ema9) : '—'} hint="лилава линия" />
        <Cell k="EMA21" v={market.indicators.ema21 != null ? money(market.indicators.ema21) : '—'} hint="оранжева линия" />
        <Cell k="RSI(14)" v={market.indicators.rsi14 ?? '—'} hint="над 75 е скъпо" />
        <Cell k="натиск" v={`${market.tick.buyPressurePercent}% купувачи`} hint={`${market.tick.tickScore}/25 · ${market.tick.tradeCount} сделки`} />
      </div>

      <h3 className="text-sm text-slate-300 mt-8 mb-2">Сделки на този робот</h3>
      {market.trades.length === 0 ? (
        <p className="text-sm text-slate-500">
          Още няма. Роботът търгува, когато присъдата стане ВХОД и режимът позволи поръчки.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr className="text-left">
                <th className="py-2 pr-4">кога</th><th className="pr-4">двойка</th>
                <th className="pr-4">посока</th><th className="pr-4">цена</th>
                <th className="pr-4">количество</th><th>резултат</th>
              </tr>
            </thead>
            <tbody>
              {market.trades.map((t, i) => (
                <tr key={t.id ?? i} className="border-t border-slate-800/70">
                  <td className="py-2 pr-4 text-slate-400">{String(t.created_date ?? '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="pr-4">{t.pair ?? t.instId ?? '—'}</td>
                  <td className={`pr-4 ${String(t.side).toLowerCase() === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side ?? '—'}</td>
                  <td className="pr-4">{t.price != null ? money(Number(t.price)) : '—'}</td>
                  <td className="pr-4">{t.size ?? t.qty ?? '—'}</td>
                  <td className={Number(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {t.pnl != null ? Number(t.pnl).toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-600 mt-6">
        Данни от OKX, {new Date(market.dataAt).toLocaleTimeString('bg-BG')}. Обновяват се на 15 секунди.
      </p>
    </section>
  );
}

function Cell({ k, v, hint }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-slate-500 text-xs">{k}</div>
      <div className="text-slate-100 font-medium">{v}</div>
      <div className="text-slate-600 text-[11px] mt-0.5">{hint}</div>
    </div>
  );
}
