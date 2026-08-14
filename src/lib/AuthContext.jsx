import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Кой е влязъл - локално.
 *
 * Досега този файл питаше сървъра на платформата за "публични настройки на
 * приложението", носеше токен през адреса и можеше да откаже целия интерфейс с
 * "user_not_registered". Това има смисъл при чужд хостинг с много клиенти.
 *
 * Тук приложението върви на твоята машина и говори с твой двигател. Потребител
 * е този, който е пуснал двигателя. Полетата остават същите, за да не се пипат
 * екраните, които ги четат - просто вече не могат да блокират нищо.
 *
 * Ако някой ден това тръгне към сървър, удостоверяването се слага ТУК и в
 * двигателя, а не се връща платформа.
 */

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      // Единствената реална причина тук е спрян двигател. Съобщението го казва
      // направо, вместо да се преправя на проблем с права.
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: 'engine_unreachable',
        message:
          'Двигателят не отговаря. Пусни го с `npm run engine` и презареди. ' +
          `(${error.message})`,
      });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    // Локално няма къде да се пренасочи - вместо тихо нищо, се прави повторна проверка.
    checkAppState();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Няма отдалечени настройки за чакане - оставено, защото екраните го четат.
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: { id: 'local', public_settings: {} },
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
