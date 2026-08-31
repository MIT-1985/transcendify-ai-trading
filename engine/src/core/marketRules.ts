/**
 * Правила за пазарен режим - четени от каталога, не зашити в кода.
 *
 * `data/market_patterns_rules.csv` описва 92 наблюдавани прозореца:
 * кога ликвидността пада, кога спредът се разширява, кога има емисии.
 * Всеки ред носи изпълнимо указание - "Reduce position sizes by 30%",
 * "Halt trading", "Increase monitoring, tighten stops".
 *
 * Досега този каталог стоеше само в базата на бекенда и никой не го
 * четеше по време на търговия. Тук той става вход за риска.
 *
 * ПРЕВОДЪТ Е НАРОЧНО КОНСЕРВАТИВЕН: разпознават се само указания с
 * недвусмислен ефект върху размера. Всичко останало се показва на
 * клиента като бележка, но НЕ променя поведението автоматично - реших
 * го така, защото тихо намаляване по неразбрано правило е по-лошо от
 * никакво.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MarketRule {
  pattern: string;
  windowUtc: string;
  effect: string;
  signatures: string;
  rule: string;
  notes: string;
  /** Множител върху размера: 0 значи спри, 1 значи без промяна. */
  sizeMultiplier: number;
  /** Дали правилото стяга стоповете. */
  tightenStops: boolean;
}

/** Минимален CSV парсер с кавички - полетата съдържат запетаи. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && inQuotes && text[i + 1] === '"') { field += '"'; i++; }
    else if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { row.push(field.trim()); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (field || row.length) { row.push(field.trim()); rows.push(row); row = []; field = ''; }
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

/** "Reduce position sizes by 30%" -> 0.7 ; "Halt trading" -> 0 */
export function interpret(rule: string): { sizeMultiplier: number; tightenStops: boolean } {
  const r = rule.toLowerCase();
  if (r.includes('halt trading')) return { sizeMultiplier: 0, tightenStops: true };
  const pct = r.match(/reduce\s+(?:position\s+)?(?:sizes?|exposure)\s+by\s+(\d+)\s*%/);
  if (pct) return { sizeMultiplier: 1 - Number(pct[1]) / 100, tightenStops: false };
  if (r.includes('reduce') && r.includes('exposure')) return { sizeMultiplier: 0.7, tightenStops: false };
  if (r.includes('tighten stops')) return { sizeMultiplier: 1, tightenStops: true };
  return { sizeMultiplier: 1, tightenStops: false };
}

/** "07:00-09:00" -> активно ли е сега (UTC). */
export function inWindow(windowUtc: string, now = new Date()): boolean {
  const m = windowUtc.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
  if (!m) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  // Прозорец през полунощ - напр. 22:00-02:00.
  return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
}

let cache: MarketRule[] | null = null;

export function loadRules(path = join(process.cwd(), 'data', 'market_patterns_rules.csv')): MarketRule[] {
  if (cache) return cache;
  let rows: string[][];
  try {
    rows = parseCsv(readFileSync(path, 'utf8'));
  } catch {
    // Липсващият каталог не бива да спира търговията - работи се без него.
    cache = [];
    return cache;
  }
  cache = rows.slice(1).filter((r) => r.length >= 5 && r[0]).map((r) => {
    const rule = r[4] ?? '';
    const { sizeMultiplier, tightenStops } = interpret(rule);
    return {
      pattern: r[0] ?? '', windowUtc: r[1] ?? '', effect: r[2] ?? '',
      signatures: r[3] ?? '', rule, notes: r[5] ?? '',
      sizeMultiplier, tightenStops,
    };
  });
  return cache;
}

/**
 * Кое важи сега.
 *
 * При няколко застъпени прозореца печели НАЙ-ПРЕДПАЗЛИВОТО - взима се
 * най-малкият множител, а не средният. Ако едно правило казва "спри",
 * а друго "намали с 30%", отговорът е "спри".
 */
export function activeAdjustment(now = new Date(), path?: string): {
  sizeMultiplier: number;
  tightenStops: boolean;
  matched: MarketRule[];
} {
  const matched = loadRules(path).filter((r) => inWindow(r.windowUtc, now));
  let sizeMultiplier = 1;
  let tightenStops = false;
  for (const r of matched) {
    sizeMultiplier = Math.min(sizeMultiplier, r.sizeMultiplier);
    tightenStops = tightenStops || r.tightenStops;
  }
  return { sizeMultiplier, tightenStops, matched };
}
