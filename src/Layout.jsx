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

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'en';
  });
  
  const { t } = useTranslation(language);
  
  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);
  
  const navItems = [
    { nameKey: 'dashboard', page: 'Dashboard', icon: LayoutDashboard },
    { nameKey: 'botDashboard', page: 'BotDashboard', icon: Activity },
    { nameKey: 'portfolio', page: 'Portfolio', icon: TrendingUp },
    { nameKey: 'polygonConsole', page: 'PolygonConsole', icon: Terminal },
    { nameKey: 'tradingBots', page: 'Bots', icon: Bot },
    { nameKey: 'customStrategies', page: 'CustomStrategies', icon: Settings },
    { nameKey: 'backtesting', page: 'Backtesting', icon: Activity },
    { nameKey: 'constantsLibrary', page: 'ConstantsLibrary', icon: Database },
    { nameKey: 'promptLibrary', page: 'PromptLibrary', icon: Brain },
    { nameKey: 'botWizard', page: 'BotWizard', icon: Brain },
    { nameKey: 'agentOrchestrator', page: 'AgentOrchestrator', icon: Network },
    { nameKey: 'riskProfiles', page: 'RiskProfiles', icon: Shield },
    { nameKey: 'fuelMiners', page: 'Miners', icon: Zap },
    { nameKey: 'deviceMining', page: 'DeviceMining', icon: Zap },
    { nameKey: 'aiAnalysis', page: 'AIAnalysis', icon: Brain },
    { nameKey: 'connectBinance', page: 'ConnectBinance', icon: Link2, fallback: 'Connect Binance' },
    { nameKey: 'connectOKX', page: 'ConnectOKX', icon: Link2, fallback: 'Connect OKX' },
    { nameKey: 'okxDashboard', page: 'OKXDashboard', icon: Link2, fallback: 'OKX Dashboard' },
    { nameKey: 'wallet', page: 'Wallet', icon: Users },
    { nameKey: 'deposit', page: 'Deposit', icon: TrendingUp },
    { nameKey: 'vipUpgrade', page: 'VIPUpgrade', icon: Crown },
    { nameKey: 'referrals', page: 'Referrals', icon: Gift },
    { nameKey: 'profile', page: 'Profile', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Transcendify</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 flex items-center justify-center text-white"
        >
          {sidebarOpen ? <X /> : <Menu />}
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
            <div className="text-xs text-slate-500">{language === 'bg' ? 'Платформа за Търговия' : language === 'de' ? 'Handelsplattform' : 'Trading Platform'}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
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
                <span className="font-medium text-sm">{t(item.nameKey) || item.fallback || item.nameKey}</span>
                {isActive && (
                  <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          <div className="space-y-3">
            <LanguageSwitcher language={language} onLanguageChange={setLanguage} />
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold text-white">
                  {language === 'bg' ? 'Pro Функции' : language === 'de' ? 'Pro-Funktionen' : 'Pro Features'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                {language === 'bg' 
                  ? 'Отключете разширени ботове и AI инструменти' 
                  : language === 'de'
                  ? 'Erweiterte Bots und KI-Analysetools freischalten'
                  : 'Unlock advanced bots and AI analysis tools'}
              </p>
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                {language === 'bg' ? 'Надградете Сега' : language === 'de' ? 'Jetzt Upgraden' : 'Upgrade Now'}
              </button>
            </div>
          </div>
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