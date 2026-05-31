import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Home, Drumstick, CalendarDays, Tag, ShoppingCart, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { cn } from '../lib/utils';

type TabDef = {
  label: string;
  path: string;
  icon: React.ElementType;
  active: (p: string) => boolean;
  adminOnly?: boolean;
  needsAuth?: boolean;
};

const TABS: TabDef[] = [
  { label: 'Home',     path: '/',         icon: Home,          active: (p) => p === '/'        },
  { label: 'Meats',    path: '/products', icon: Drumstick,     active: (p) => p === '/products' },
  { label: 'Bookings', path: '/bookings', icon: CalendarDays,  active: (p) => p === '/bookings', needsAuth: true },
  { label: 'Deals',    path: '/referral', icon: Tag,           active: (p) => p === '/referral', needsAuth: true },
  { label: 'Cart',     path: '/cart',     icon: ShoppingCart,  active: (p) => p === '/cart'   },
  { label: 'Admin',    path: '/admin',    icon: LayoutDashboard, active: (p) => p === '/admin', adminOnly: true },
];

export default function BottomNav() {
  const { user, isAdmin, isManager } = useAuth();
  const { totalItems } = useCart();
  const location = useLocation();

  const isAdminOrManager = isAdmin || isManager;

  // Filter tabs: show admin tab only for admin/manager
  const visibleTabs = TABS.filter(tab => {
    if (tab.adminOnly && !isAdminOrManager) return false;
    return true;
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Static bottom nav with glass morphism */}
      <div className="bg-white/95 backdrop-blur-xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] border-t border-gray-100">
        <nav className="max-w-md mx-auto px-2 py-1.5 pb-safe">
          <div className="flex justify-around items-center">
            {visibleTabs.map(tab => {
              const isActive = tab.active(location.pathname);
              const Icon = tab.icon;
              const to = (tab.needsAuth && !user) ? '/login' : tab.path;

              return (
                <Link key={tab.path} to={to} className="relative flex-1 flex flex-col items-center py-2 group">
                  {/* Active pill background */}
                  {isActive && (
                    <motion.div
                      layoutId="bottom-nav-pill"
                      className={cn(
                        "absolute inset-0 mx-1 rounded-xl shadow-lg",
                        tab.adminOnly
                          ? "bg-gradient-to-r from-gray-900 to-gray-800 shadow-gray-900/40"
                          : "bg-premium-gradient shadow-[0_5px_20px_rgba(122,0,0,0.4)]"
                      )}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}

                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <div className="relative">
                      <motion.div
                        animate={{ scale: isActive ? 1.15 : 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      >
                        <Icon
                          className={cn(
                            'w-5 h-5 transition-colors duration-200',
                            isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'
                          )}
                          strokeWidth={isActive ? 2.5 : 1.8}
                        />
                      </motion.div>
                      {tab.path === '/cart' && totalItems > 0 && (
                        <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[9px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 border-2 border-white shadow-sm">
                          {totalItems}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      'text-[9px] font-black uppercase tracking-widest transition-colors duration-200',
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'
                    )}>
                      {tab.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
