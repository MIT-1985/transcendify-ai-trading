/**
 * Страниците на приложението - всичките.
 *
 * Бяха трийсет и пет. Двайсет и две паднаха: едните показваха измислени
 * числа (портфейл с $5000, който не съществува, VIP нива, минери, реферали),
 * другите бяха празни рамки без нищо зад тях. И двата вида ти отнемат време
 * и не ти дават нищо в замяна.
 *
 * Остана това, което работи с истински данни.
 */
import BotDashboard from './pages/BotDashboard';
import Dashboard from './pages/Dashboard';
// Landing нарочно НЕ е тук: входът няма меню.
import ConnectOKX from './pages/ConnectOKX';

// Диагностика: инструменти за собственика, не за купувача. Работят с истински
// данни, затова не се трият - но и не стоят в главното меню.
import SignalDashboard from './pages/SignalDashboard';
import PaperTradingDashboard from './pages/PaperTradingDashboard';
import Phase5RealTestMode from './pages/Phase5RealTestMode';
import Transactions from './pages/Transactions';
import PolygonConsole from './pages/PolygonConsole';
import ChartGuide from './pages/ChartGuide';
import OKXDashboard from './pages/OKXDashboard';
import OKXDataSync from './pages/OKXDataSync';

import __Layout from './Layout.jsx';

export const PAGES = {
    "BotDashboard": BotDashboard,
    "Dashboard": Dashboard,
    "ConnectOKX": ConnectOKX,
    "SignalDashboard": SignalDashboard,
    "PaperTradingDashboard": PaperTradingDashboard,
    "Phase5RealTestMode": Phase5RealTestMode,
    "Transactions": Transactions,
    "PolygonConsole": PolygonConsole,
    "ChartGuide": ChartGuide,
    "OKXDashboard": OKXDashboard,
    "OKXDataSync": OKXDataSync,
};

export const pagesConfig = {
    // Първото, което човек вижда, са роботите - заради тях идва.
    mainPage: "BotDashboard",
    Pages: PAGES,
    Layout: __Layout,
};
