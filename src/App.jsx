import './App.css'
import React from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ConnectBinance from './pages/ConnectBinance';
import ConnectOKX from './pages/ConnectOKX';
import PaymentSuccess from './pages/PaymentSuccess';
import OKXDashboard from './pages/OKXDashboard';
import CleanDashboard from './components/dashboard/CleanDashboard';
import OKXDataSync from './pages/OKXDataSync';
import SignalDashboard from './pages/SignalDashboard';
import PaperTradingDashboard from './pages/PaperTradingDashboard';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, user } = useAuth();
  const queryClient = useQueryClient();

  // Clear all cached data when user changes (prevents seeing another user's data)
  const prevUserRef = React.useRef(null);
  React.useEffect(() => {
    if (prevUserRef.current && prevUserRef.current !== user?.email) {
      queryClient.clear();
    }
    prevUserRef.current = user?.email;
  }, [user?.email]);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/clean-dashboard" element={
        <LayoutWrapper currentPageName="CleanDashboard">
          <CleanDashboard />
        </LayoutWrapper>
      } />
      <Route path="/SignalDashboard" element={
        <LayoutWrapper currentPageName="SignalDashboard">
          <SignalDashboard />
        </LayoutWrapper>
      } />
      <Route path="/PaperTradingDashboard" element={
        <LayoutWrapper currentPageName="PaperTradingDashboard">
          <PaperTradingDashboard />
        </LayoutWrapper>
      } />
      <Route path="/OKXDataSync" element={
        <LayoutWrapper currentPageName="OKXDataSync">
          <OKXDataSync />
        </LayoutWrapper>
      } />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/ConnectBinance" element={
            <LayoutWrapper currentPageName="ConnectBinance">
              <ConnectBinance />
            </LayoutWrapper>
          } />
      <Route path="/ConnectOKX" element={
            <LayoutWrapper currentPageName="ConnectOKX">
              <ConnectOKX />
            </LayoutWrapper>
          } />
      <Route path="/PaymentSuccess" element={<PaymentSuccess />} />
      <Route path="/OKXDashboard" element={
            <LayoutWrapper currentPageName="OKXDashboard">
              <OKXDashboard />
            </LayoutWrapper>
          } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App