import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { 
        LayoutDashboard, 
        Terminal, 
        Bot, 
        Brain, 
        Settings, 
        Menu, 
        X,
        Zap,
        ChevronRight,
        Users,
        Gift,
        TrendingUp,
        Crown,
        Activity,
        Database,
        Network,
        Shield,
        Link2
      } from 'lucide-react';
import { cn } from '@/lib/utils';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/components/utils/translations';
import { base44 } from '@/api/base44Client';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'bg';
  });
  
  const { t } = useTranslation(language);
  
  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);
  
  // Три реда за човека, който е дошъл да купи робот. Всичко останало е
  // инструмент за собственика и стои прибрано - не защото е тайна, а защото
  // "📄 Phase 4 Paper Trading" не значи нищо за купувача.
  const navItems = [
    { label: 'Роботи', page: 'BotDashboard', icon: Bot },
    { label: 'Табло', page: 'Dashboard', icon: LayoutDashboard },
    { label: 'OKX ключове', page: 'ConnectOKX', icon: Link2 },
  ];

  const devItems = [
    { label: 'Сигнали', page: 'SignalDashboard' },
    { label: 'Хартиена търговия', page: 'PaperTradingDashboard' },
    { label: 'Истински тест', page: 'Phase5RealTestMode' },
    { label: 'Дневник', page: 'Transactions' },
    { label: 'Polygon конзола', page: 'PolygonConsole' },
    { label: 'Чеклист за графики', page: 'ChartGuide' },
    { label: 'OKX табло', page: 'OKXDashboard' },
    { label: 'OKX синхрон', page: 'OKXDataSync' },
  ];


  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-slate-800 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Transcendify</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 flex items-center justify-center"
          style={{ color: '#ffffff' }}
        >
          {sidebarOpen ? <X color="#ffffff" /> : <Menu color="#ffffff" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 z-40 transform transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-lg">Transcendify</span>
            <div className="text-xs text-slate-500">{language === 'bg' ? 'AI Платформа за Автоматизирана Търговия' : language === 'de' ? 'KI-Handelsautomatisierungsplattform' : 'AI Trading Automation Platform'}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 150px)' }}>
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            const Icon = item.icon;

            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-blue-500/20 text-blue-400" 
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && (
                  <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0" />
                )}
              </Link>
            );
          })}

          <details className="mt-4 pt-4 border-t border-slate-800/70">
            <summary className="px-4 py-2 text-xs uppercase tracking-wide text-slate-600 cursor-pointer select-none hover:text-slate-400">
              Диагностика
            </summary>
            <div className="mt-1 space-y-0.5">
              {devItems.map((item) => (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "block px-4 py-2 rounded-lg text-sm transition-colors",
                    currentPageName === item.page
                      ? "bg-slate-800/70 text-slate-200"
                      : "text-slate-500 hover:bg-slate-800/40 hover:text-slate-300"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800 space-y-2">
          <LanguageSwitcher language={language} onLanguageChange={setLanguage} />
          <button
            onClick={() => base44.auth.logout()}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 transition-colors"
          >
            Излез
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}