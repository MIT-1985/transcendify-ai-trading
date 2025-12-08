import Dashboard from './pages/Dashboard';
import PolygonConsole from './pages/PolygonConsole';
import Bots from './pages/Bots';
import Wallet from './pages/Wallet';
import Referrals from './pages/Referrals';
import Miners from './pages/Miners';
import BotRunner from './pages/BotRunner';
import Profile from './pages/Profile';
import Portfolio from './pages/Portfolio';
import Landing from './pages/Landing';
import Backtesting from './pages/Backtesting';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "PolygonConsole": PolygonConsole,
    "Bots": Bots,
    "Wallet": Wallet,
    "Referrals": Referrals,
    "Miners": Miners,
    "BotRunner": BotRunner,
    "Profile": Profile,
    "Portfolio": Portfolio,
    "Landing": Landing,
    "Backtesting": Backtesting,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};