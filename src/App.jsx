import './App.css'
import React from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PaymentSuccess from './pages/PaymentSuccess';
import Landing from './pages/Landing';
import { base44 } from '@/api/base44Client';

/**
 * Без сесия всеки адрес води до входа.
 *
 * Досега нямаше такъв пазач: входният екран съществуваше, но се стигаше до
 * приложението и без да се мине през него. Вход, който може да се прескочи,
 * не е вход.
 */
const RequireSession = ({ children }) => {
  const [state, setState] = React.useState('checking');
  React.useEffect(() => {
    base44.auth.isAuthenticated()
      .then((ok) => setState(ok ? 'in' : 'out'))
      .catch(() => setState('out'));
  }, []);
  if (state === 'checking') return null;
  if (state === 'out') return <Navigate to="/Landing" replace />;
  return children;
};

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => (
  <RequireSession>
    {Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>}
  </RequireSession>
);

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
      {/* Входът е без лента: няма меню, докато няма влизане. */}
      <Route path="/Landing" element={<Landing />} />
      {/* Старият адрес на екрана с роботите - води където и преди. */}
      <Route path="/robots" element={<Navigate to="/BotDashboard" replace />} />
      {/* Връщането от Stripe е без лента: човекът идва отвън, не от менюто. */}
      <Route path="/PaymentSuccess" element={<PaymentSuccess />} />
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