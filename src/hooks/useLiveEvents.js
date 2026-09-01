/**
 * Живият поток от решенията на роботите.
 *
 * Панелите досега дърпаха на интервали - тоест показваха състояние отпреди
 * няколко секунди и товареха двигателя с заявки, които в повечето случаи
 * връщат същото. Тук връзката е една и говори само когато има какво.
 *
 * EventSource, а не WebSocket: потокът е еднопосочен и браузърът сам
 * възстановява връзката при прекъсване. WebSocket би искал ръчно
 * преизграждане без нищо в замяна.
 */
import { useEffect, useRef, useState } from 'react';

const BASE_URL = import.meta.env?.VITE_ENGINE_URL ?? 'http://127.0.0.1:8787';

/**
 * @param {object} options
 * @param {number} [options.keep] колко събития да се пазят на екрана
 * @param {string[]} [options.kinds] само тези видове; празно = всички
 */
export function useLiveEvents({ keep = 200, kinds } = {}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  // Последният видян номер - при повторно свързване се иска само пропуснатото,
  // а не целият буфер отначало.
  const lastSeq = useRef(0);

  useEffect(() => {
    const url = new URL(BASE_URL + '/api/events');
    if (lastSeq.current) url.searchParams.set('after', String(lastSeq.current));

    const source = new EventSource(url.toString());

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    const onAny = (raw) => {
      let ev;
      try {
        ev = JSON.parse(raw.data);
      } catch {
        return;
      }
      if (kinds && !kinds.includes(ev.kind)) return;
      lastSeq.current = Math.max(lastSeq.current, ev.seq ?? 0);
      setEvents((prev) => {
        const next = [...prev, ev];
        return next.length > keep ? next.slice(next.length - keep) : next;
      });
    };

    // Сървърът праща именувани събития, затова се слуша всеки вид поотделно.
    const named = ['cycle', 'signal', 'trok', 'risk', 'order', 'fill', 'close', 'error'];
    for (const name of named) source.addEventListener(name, onAny);

    return () => {
      for (const name of named) source.removeEventListener(name, onAny);
      source.close();
    };
    // Празен списък нарочно: връзката се вдига веднъж и живее, докато екранът
    // е отворен. Пресъздаването ѝ при всяка промяна на филтъра би късало потока.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { events, connected, latest: events[events.length - 1] ?? null };
}
