import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ShoppingCart, LogOut, Package, LayoutDashboard, Gift, User, MapPin, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAddress } from '../context/AddressContext';
import { cn } from '../lib/utils';
import MobileHeader from './MobileHeader';
import BottomNav from './BottomNav';
import WelcomeAnimation from './WelcomeAnimation';
import NotificationToast from './NotificationToast';
import LocationPickerModal from './location/LocationPickerModal';

export default function Layout() {
  const { user, isAdmin, isManager, isDelivery, logout } = useAuth();
  const { totalItems } = useCart();
  const { displayLocation, displayCity } = useAddress();
  const location = useLocation();
  const [isLocationOpen, setIsLocationOpen] = useState(false);

  const isDeliveryPage = location.pathname.startsWith('/delivery');
  const isAdminPage = location.pathname === '/admin';

  const desktopNavItems = [
    { name: 'Home',      path: '/',         hideForDelivery: true },
    { name: 'Products',  path: '/products', hideForDelivery: true },
    { name: 'Orders',    path: '/orders',   protected: true, hideForDelivery: true },
    { name: 'Referral',  path: '/referral', protected: true, hideForDelivery: true },
    { name: 'Admin',     path: '/admin',    adminOnly: true  },
    { name: 'Dashboard', path: '/admin',    managerOnly: true },
    { name: 'Deliveries',path: '/delivery', deliveryOnly: true },
  ];

  // Track whether welcome animation is still active — start dark to prevent white flash
  const [welcomeDone, setWelcomeDone] = useState(
    () => localStorage.getItem('hasSeenWelcome') === 'true'
  );

  // Listen for welcome animation completing
  useEffect(() => {
    if (welcomeDone) return;
    const check = () => {
      if (localStorage.getItem('hasSeenWelcome') === 'true') {
        setWelcomeDone(true);
      }
    };
    const interval = setInterval(check, 200);
    return () => clearInterval(interval);
  }, [welcomeDone]);

  return (
    <div className={cn(
      "min-h-screen flex flex-col w-full overflow-x-hidden transition-colors duration-700",
      welcomeDone ? 'bg-gray-50' : 'bg-[#0b0b0b]'
    )}>
      {/* Push Notification Toasts */}
      <NotificationToast />

      {/* ── DESKTOP NAV (hidden on admin & delivery pages) ──────────────── */}
      {!isAdminPage && (
        <nav className="hidden md:flex items-center justify-between px-8 py-4 bg-white shadow-sm sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl font-black text-red-600">Kari</span>
              <span className="text-2xl font-black text-gray-900">King</span>
              <span className="text-xs text-amber-600 font-bold ml-1">👑</span>
            </Link>

            {!isDelivery && (
              <button
                onClick={() => setIsLocationOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-red-50/70 border border-gray-200 hover:border-red-200 transition-all text-left max-w-[230px]"
              >
                <MapPin className="w-4 h-4 text-red-600 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-gray-900 truncate">{displayLocation}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </div>
                  <p className="text-[10px] font-medium text-gray-500 truncate">{displayCity}</p>
                </div>
              </button>
            )}
          </div>
          <div className="flex items-center gap-8">
            {desktopNavItems.map(item => {
              if (item.adminOnly && !isAdmin) return null;
              if (item.managerOnly && !isManager) return null;
              if (item.deliveryOnly && !isDelivery) return null;
              if (item.hideForDelivery && isDelivery) return null;
              if (item.protected && !user) return null;
              return (
                <Link
                  key={item.path + item.name}
                  to={item.path}
                  className={cn(
                    'text-gray-600 hover:text-red-600 transition-colors font-medium',
                    location.pathname === item.path && 'text-red-600 font-bold'
                  )}
                >
                  {item.name}
                </Link>
              );
            })}

            {!isDelivery && (
              <Link to="/cart" className="relative group">
                <ShoppingCart className="w-6 h-6 text-gray-600 group-hover:text-red-600 transition-colors" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-6">
                <Link to="/profile" className="text-gray-500 hover:text-red-600 transition-colors">
                  <User className="w-5 h-5" />
                </Link>
                <button onClick={logout} className="text-gray-500 hover:text-red-600 transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <Link to="/login" className="bg-red-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20">
                Login
              </Link>
            )}
          </div>
        </nav>
      )}

      {/* ── MOBILE TOP HEADER (hidden on admin & delivery pages) ─────────── */}
      {!isDeliveryPage && !isAdminPage && <MobileHeader />}

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <main className={cn(
        'flex-1 w-full',
        isAdminPage ? '' :
        isDeliveryPage ? 'safe-bottom' : 'max-w-7xl mx-auto px-4 py-6 md:py-8 md:pb-8 safe-bottom'
      )}>
        <Outlet />
      </main>

      {/* ── MOBILE BOTTOM NAV (hidden on admin & delivery pages) ──────────── */}
      {!isDeliveryPage && !isDelivery && !isAdminPage && <BottomNav />}

      {!isAdminPage && <WelcomeAnimation />}

      <LocationPickerModal
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
        initialTab="pointing"
      />
    </div>
  );
}

