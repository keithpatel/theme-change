import { useState, useEffect, useRef, cloneElement, ReactElement, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, LogOut, Wallet, Bell, FileQuestion, CircleDollarSign, Menu, RotateCcw } from 'lucide-react';
import { useAuth } from '../App';
// @ts-ignore
import { collection, query, where, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { AppNotification } from '../types';

interface LayoutProps {
  children?: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { logout, adminEmail } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: 'Dashboard', shortName: 'Home', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Members', shortName: 'Members', path: '/members', icon: <Users size={20} /> },
    { name: 'Monthly Savings', shortName: 'Savings', path: '/payments', icon: <CreditCard size={20} /> },
    { name: 'Loan Requests', shortName: 'Requests', path: '/loan-requests', icon: <FileQuestion size={20} /> },
    { name: 'Loan Payments', shortName: 'Loans', path: '/loan-payments', icon: <CircleDollarSign size={20} /> },
    { name: 'Refunds', shortName: 'Refunds', path: '/refunds', icon: <RotateCcw size={20} /> },
  ];

  useEffect(() => {
    // Listen for Admin Notifications
    const q = query(
      collection(db, 'notifications'), 
      where('recipient', '==', 'ADMIN')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppNotification[];
      // Sort by new
      notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(notifs);
    }, (error) => {
      // Handle permission errors silently to prevent console spam/crashes
      console.log("Notification listener paused (permission denied):", error.message);
    });

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    const batch = writeBatch(db);
    notifications.forEach(n => {
      if (!n.read) {
        const ref = doc(db, 'notifications', n.id);
        batch.update(ref, { read: true });
      }
    });
    await batch.commit();
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar - Desktop Only */}
      <div className="hidden md:flex w-64 bg-white shadow-md flex-col z-20">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-emerald-600">CommunityCircle</h1>
          <p className="text-xs text-gray-500 mt-1">Admin Portal</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t bg-gray-50">
          <div className="mb-4">
             <p className="text-sm font-medium text-gray-900 truncate">{adminEmail || 'Admin'}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center space-x-2 text-red-600 hover:text-red-700 w-full px-2"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header - Responsive */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-4 sm:px-8 z-10 shrink-0">
          {/* Mobile Title */}
          <div className="md:hidden flex items-center gap-2">
            <h1 className="text-xl font-bold text-emerald-600">CommunityCircle</h1>
          </div>

          <div className="flex items-center gap-3 ml-auto">
             <span className="hidden sm:block text-sm font-medium text-gray-700">{adminEmail || 'Admin'}</span>

            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications && unreadCount > 0) markAllRead(); }}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden z-50">
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">No notifications</div>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id} className={`p-4 border-b hover:bg-gray-50 transition-colors ${!notif.read ? 'bg-blue-50/50' : ''}`}>
                          <div className="flex justify-between items-start">
                            <p className="text-sm text-gray-800">{notif.message}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notif.timestamp).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Mobile Logout */}
            <button
                onClick={logout}
                className="md:hidden p-2 text-gray-500 hover:text-red-600"
              >
                <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          {children}
        </main>

        {/* Bottom Navigation - Mobile Only */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-between items-center px-2 py-1 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] safe-area-pb">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full py-2 space-y-1 ${
                  isActive
                    ? 'text-emerald-600'
                    : 'text-gray-400 hover:text-gray-500'
                }`
              }
            >
              {cloneElement(item.icon as ReactElement<any>, { size: 20 })}
              <span className="text-[10px] font-medium leading-none">{item.shortName}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Layout;