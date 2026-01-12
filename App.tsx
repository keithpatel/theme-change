import { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole, Member, UserContextType } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import MemberDetails from './pages/MemberDetails';
import Payments from './pages/Payments';
import LoanRequests from './pages/LoanRequests';
import LoanPayments from './pages/LoanPayments';
import Loans from './pages/Loans';
import Refunds from './pages/Refunds';
import MemberPortal from './pages/MemberPortal';
import Layout from './components/Layout';
// @ts-ignore
import { setPersistence, inMemoryPersistence, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

export const AuthContext = createContext<UserContextType>({
  role: UserRole.GUEST,
  currentMember: null,
  adminEmail: null,
  loginAdmin: () => { },
  loginAdminView: () => { },
  loginMember: () => { },
  logout: () => { },
});

export const useAuth = () => useContext(AuthContext);

const App = () => {
  const [role, setRole] = useState<UserRole>(UserRole.GUEST);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Auth Initialization & Persistence
  useEffect(() => {
    let unsubscribe: () => void;

    const initAuth = async () => {
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch (error) {
        console.error("Error setting persistence:", error);
      }

      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          if (!user.isAnonymous) {
            setRole(UserRole.ADMIN);
            setAdminEmail(user.email);
          }
        } else {
          setRole(UserRole.GUEST);
          setCurrentMember(null);
          setAdminEmail(null);
        }
        setLoading(false);
      });
    };

    initAuth();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 2. Inactivity Timer (Logout after 5 minutes)
  useEffect(() => {
    if (role === UserRole.GUEST) return;

    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 Minutes
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleLogout = () => {
      logout();
      alert("You have been logged out due to inactivity.");
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleLogout, INACTIVITY_LIMIT);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [role]);

  const loginAdmin = (email: string) => {
    setRole(UserRole.ADMIN);
    setAdminEmail(email);
  };

  const loginAdminView = (name: string) => {
    setRole(UserRole.ADMIN_VIEW);
    setAdminEmail(name); // Use name as display name
  };

  const loginMember = (member: Member) => {
    setRole(UserRole.MEMBER);
    setCurrentMember(member);
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setRole(UserRole.GUEST);
      setCurrentMember(null);
      setAdminEmail(null);
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ role, currentMember, adminEmail, loginAdmin, loginAdminView, loginMember, logout }}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={role === UserRole.GUEST ? <Login /> : <Navigate to="/" />} />

          {/* Admin & View-Only Routes */}
          <Route path="/" element={
            (role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? (
              <Layout><Dashboard /></Layout>
            ) : role === UserRole.MEMBER ? (
              <Navigate to="/portal" />
            ) : (
              <Navigate to="/login" />
            )
          } />

          <Route path="/members" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><Members /></Layout> : <Navigate to="/login" />} />
          <Route path="/members/:id" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><MemberDetails /></Layout> : <Navigate to="/login" />} />
          <Route path="/payments" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><Payments /></Layout> : <Navigate to="/login" />} />
          <Route path="/loan-requests" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><LoanRequests /></Layout> : <Navigate to="/login" />} />
          <Route path="/loan-payments" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><LoanPayments /></Layout> : <Navigate to="/login" />} />
          <Route path="/loans-manage" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><Loans /></Layout> : <Navigate to="/login" />} />
          <Route path="/refunds" element={(role === UserRole.ADMIN || role === UserRole.ADMIN_VIEW) ? <Layout><Refunds /></Layout> : <Navigate to="/login" />} />

          {/* Member Routes */}
          <Route path="/portal" element={role === UserRole.MEMBER ? <MemberPortal /> : role === UserRole.ADMIN_VIEW ? <Navigate to="/" /> : <Navigate to="/login" />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </AuthContext.Provider>
  );
};

export default App;