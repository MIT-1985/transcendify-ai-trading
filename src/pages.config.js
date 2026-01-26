import AIAnalysis from './pages/AIAnalysis';
import AgentOrchestrator from './pages/AgentOrchestrator';
import Backtesting from './pages/Backtesting';
import BotAnalytics from './pages/BotAnalytics';
import BotDashboard from './pages/BotDashboard';
import BotRunner from './pages/BotRunner';
import BotWizard from './pages/BotWizard';
import Bots from './pages/Bots';
import ConstantsLibrary from './pages/ConstantsLibrary';
import CustomStrategies from './pages/CustomStrategies';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import DeviceMining from './pages/DeviceMining';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Miners from './pages/Miners';
import PolygonConsole from './pages/PolygonConsole';
import Portfolio from './pages/Portfolio';
import Profile from './pages/Profile';
import PromptLibrary from './pages/PromptLibrary';
import Referrals from './pages/Referrals';
import RiskProfiles from './pages/RiskProfiles';
import VIPUpgrade from './pages/VIPUpgrade';
import Wallet from './pages/Wallet';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIAnalysis": AIAnalysis,
    "AgentOrchestrator": AgentOrchestrator,
    "Backtesting": Backtesting,
    "BotAnalytics": BotAnalytics,
    "BotDashboard": BotDashboard,
    "BotRunner": BotRunner,
    "BotWizard": BotWizard,
    "Bots": Bots,
    "ConstantsLibrary": ConstantsLibrary,
    "CustomStrategies": CustomStrategies,
    "Dashboard": Dashboard,
    "Deposit": Deposit,
    "DeviceMining": DeviceMining,
    "Home": Home,
    "Landing": Landing,
    "Miners": Miners,
    "PolygonConsole": PolygonConsole,
    "Portfolio": Portfolio,
    "Profile": Profile,
    "PromptLibrary": PromptLibrary,
    "Referrals": Referrals,
    "RiskProfiles": RiskProfiles,
    "VIPUpgrade": VIPUpgrade,
    "Wallet": Wallet,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};