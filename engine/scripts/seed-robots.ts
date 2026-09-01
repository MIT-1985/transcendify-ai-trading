/**
 * Записва шестте робота в entity-то TradingBot, което старият екран чете.
 *
 * Досега страницата "Trading Bots" показваше "No Bots Found", защото роботите
 * живееха само в кода на двигателя, а екранът търсеше записи в базата. Тук са
 * едно и също нещо: източникът остава ROBOTS, базата е само копие за екрана.
 *
 * Изпълнява се наново без страх - записите се търсят по id и се обновяват.
 */
import { ROBOTS, BUNDLE_PRICE_USD, profileBreakeven } from '../src/core/robots.ts';
import { loadConfig } from '../src/config.ts';
import { Database } from '../src/store/db.ts';

const config = loadConfig();
const db = new Database(config.dataDir);
const bots = db.collection('TradingBot');

const RISK: Record<string, string> = {
  swing: 'low', dca: 'low', steady: 'medium',
  momentum: 'medium', grid: 'high', scalp: 'high',
};

const existing = (await bots.list({ limit: 200 })) as Array<Record<string, unknown>>;

for (const p of ROBOTS) {
  const be = Math.round(profileBreakeven(p, config.fees) * 1000) / 10;
  const row = {
    robot_id: p.id,
    name: p.name,
    description: p.summary,
    strategy: p.strategy,
    risk_level: RISK[p.strategy] ?? 'medium',
    price: p.priceUsd,
    // Доживотно - няма месечна такса. Нулата тук не е забравена стойност.
    monthly_fee: 0,
    // Няма "минимален капитал": точката на изравняване е процент и не се
    // интересува дали сметката е от сто или от пет хиляди. Полето остава 0,
    // за да не се роди фалшив праг.
    min_capital: 0,
    breakeven_win_rate: be,
    stop_pct: p.stopDistancePct * 100,
    reward_risk: p.rewardRiskRatio,
    entry_style: p.entry,
    supported_markets: p.pairs,
    lifetime: true,
    active: true,
  };

  const found = existing.find((b) => b.robot_id === p.id || b.name === p.name);
  if (found) {
    await bots.update(String(found.id), row);
    console.log(`обновен: ${p.name}`);
  } else {
    await bots.create(row);
    console.log(`създаден: ${p.name} — $${p.priceUsd}, нула при ${be}%`);
  }
}

console.log(`\n${ROBOTS.length} робота в базата. Пакет: $${BUNDLE_PRICE_USD}.`);
