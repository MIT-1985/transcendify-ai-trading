import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Bell, BellRing, MessageSquare, Check, X, Loader2 } from 'lucide-react';

const LS_WEBHOOK = 'discord_webhook_url';
const LS_ENABLED = 'discord_notifier_enabled';
const LS_LAST_ID = 'discord_last_trade_id';

export default function DiscordTradeNotifier() {
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(LS_WEBHOOK) || '');
  const [enabled, setEnabled] = useState(() => localStorage.getItem(LS_ENABLED) === 'true');
  const [showSetup, setShowSetup] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [lastNotify, setLastNotify] = useState(() => {
    const saved = localStorage.getItem('discord_last_notify');
    return saved ? JSON.parse(saved) : null;
  });
  const notifiedRef = useRef(new Set());
  const webhookRef = useRef(webhookUrl);

  useEffect(() => { webhookRef.current = webhookUrl; }, [webhookUrl]);

  // Realtime subscription to VerifiedTrade creations
  useEffect(() => {
    if (!enabled || !webhookUrl) return;
    let active = true;

    const unsubscribe = base44.entities.VerifiedTrade.subscribe(async (event) => {
      if (!active || event.type !== 'create') return;
      const trade = event.data;
      if (!trade || notifiedRef.current.has(trade.id)) return;

      const pnl = parseFloat(trade.realizedPnL || 0);
      if (pnl <= 0) return; // only winning trades

      notifiedRef.current.add(trade.id);
      await sendToDiscord(trade, webhookRef.current);
    });

    return () => { active = false; unsubscribe?.(); };
  }, [enabled, webhookUrl]);

  const sendToDiscord = async (trade, url) => {
    setStatus('sending');
    const pnl = parseFloat(trade.realizedPnL || 0);
    const pnlPct = parseFloat(trade.realizedPnLPct || 0);
    const pair = trade.instId || 'BTC-USDT';
    const time = new Date().toLocaleString('bg-BG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

    const payload = {
      username: 'Transcendify Bot',
      content: `🎉 **Печеливша сделка!** +${pnl.toFixed(4)} USDT на ${pair}`,
      embeds: [{
        title: '✅ Печеливша сделка',
        color: 3066993,
        fields: [
          { name: '💰 Печалба', value: `**+${pnl.toFixed(4)} USDT**`, inline: true },
          { name: '📈 Пара', value: pair, inline: true },
          { name: '📊 ROI', value: `${pnlPct ? pnlPct.toFixed(2) : '—'}%`, inline: true },
          { name: '🕐 Време', value: time, inline: true },
        ],
        footer: { text: 'Transcendify · Автоматична търговия' },
        timestamp: new Date().toISOString(),
      }]
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus('sent');
        const info = { pnl, pair, time, at: Date.now() };
        setLastNotify(info);
        localStorage.setItem('discord_last_notify', JSON.stringify(info));
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 5000);
      }
    } catch (e) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  const sendTest = async () => {
    if (!webhookUrl) return;
    await sendToDiscord({ realizedPnL: 1.2345, realizedPnLPct: 2.5, instId: 'BTC-USDT' }, webhookUrl);
  };

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(LS_ENABLED, String(next));
  };

  const saveWebhook = () => {
    localStorage.setItem(LS_WEBHOOK, webhookUrl.trim());
    setShowSetup(false);
  };

  return (
    <div className="rounded-2xl border-2 border-indigo-700/50 bg-indigo-950/10 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled && webhookUrl ? 'bg-indigo-600/30' : 'bg-slate-800'}`}>
            {status === 'sending' ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              : status === 'sent' ? <Check className="w-5 h-5 text-emerald-400" />
              : status === 'error' ? <X className="w-5 h-5 text-red-400" />
              : enabled && webhookUrl ? <BellRing className="w-5 h-5 text-indigo-400" />
              : <Bell className="w-5 h-5 text-slate-500" />}
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              Discord известия
              {enabled && webhookUrl
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700">АКТИВНО</span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">ИЗКЛ.</span>}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {enabled && webhookUrl
                ? 'Ще получиш известие веднага при печеливша сделка'
                : 'Въведи Discord webhook URL за известия'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSetup(s => !s)}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-700/50 border border-slate-600 hover:bg-slate-700 text-slate-200 transition-all flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Настройки
          </button>
          {webhookUrl && (
            <button
              onClick={toggleEnabled}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${enabled
                ? 'bg-emerald-700/30 border-emerald-600 text-emerald-300 hover:bg-emerald-700/50'
                : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/50'}`}
            >
              {enabled ? 'Включи' : 'Изключи'}
            </button>
          )}
        </div>
      </div>

      {showSetup && (
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Discord Webhook URL</label>
            <input
              type="text"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Discord → Настройки на канала → Интеграции → Webhooks → Нов webhook → Copy Webhook URL
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveWebhook}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
            >
              Запази
            </button>
            {webhookUrl && (
              <button
                onClick={sendTest}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-700/50 border border-slate-600 hover:bg-slate-700 text-slate-200 transition-all"
              >
                Тестово известие
              </button>
            )}
          </div>
        </div>
      )}

      {lastNotify && (
        <div className="mt-3 flex items-center gap-2 text-xs bg-slate-900/50 rounded-lg p-2.5 border border-slate-700">
          <span className="text-emerald-400">📨</span>
          <span className="text-slate-400">Последно известие:</span>
          <span className="text-emerald-400 font-bold">+{lastNotify.pnl.toFixed(4)} USDT</span>
          <span className="text-slate-500">· {lastNotify.pair} · {lastNotify.time}</span>
        </div>
      )}
    </div>
  );
}