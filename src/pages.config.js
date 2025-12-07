import Dashboard from './pages/Dashboard';
import PolygonConsole from './pages/PolygonConsole';
import Bots from './pages/Bots';
import AIAnalysis from './pages/AIAnalysis';
import Wallet from './pages/Wallet';
import Referrals from './pages/Referrals';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "PolygonConsole": PolygonConsole,
    "Bots": Bots,
    "AIAnalysis": AIAnalysis,
    "Wallet": Wallet,
    "Referrals": Referrals,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};