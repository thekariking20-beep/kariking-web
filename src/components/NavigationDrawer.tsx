import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  X, Home, Package, Gift, User, MapPin, LogOut, 
  ShieldCheck, Truck, ChevronRight, Drumstick, Beef, Flame
} from 'lucide-react';
import { cn } from '../lib/utils';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NavigationDrawer({ isOpen, onClose }: NavigationDrawerProps) {
  const { user, logout } = useAuth();
  const { totalPrice } = useCart();
  const location = useLocation();
  const [hasActiveOrder, setHasActiveOrder] = useState(false);

  // Free delivery threshold
  const FREE_DELIVERY_THRESHOLD = 500;
  const progressPct = Math.min((totalPrice / FREE_DELIVERY_THRESHOLD) * 100, 100);
  const remainingForFreeDelivery = Math.max(FREE_DELIVERY_THRESHOLD - totalPrice, 0);

  // Check for active orders
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      where('status', 'in', ['Order Placed', 'Order Received', 'Packed', 'Dispatched'])
    );
    const unsub = onSnapshot(q, (snap) => setHasActiveOrder(!snap.empty));
    return () => unsub();
  }, [user]);

  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Fresh Meats', path: '/products', icon: Drumstick },
    { name: 'My Orders', path: '/orders', icon: Package, protected: true },
    { name: 'Refer & Earn', path: '/referral', icon: Gift, protected: true },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] md:hidden"
          />

          {/* Drawer Sidebar */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="fixed top-0 left-0 bottom-0 w-[85vw] max-w-sm bg-gray-50 shadow-2xl z-[101] flex flex-col overflow-hidden md:hidden"
          >
            {/* ─── 1. TOP HEADER (BRAND + IDENTITY) ─── */}
            <div className="bg-gradient-to-br from-red-700 via-red-600 to-rose-600 px-6 pt-10 pb-8 relative shrink-0 rounded-br-3xl">
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border-[3px] border-white/30 flex items-center justify-center overflow-hidden shadow-lg">
                  {user ? (
                    <span className="text-2xl font-black text-white">{user.name?.charAt(0).toUpperCase() || user.phone.slice(-1)}</span>
                  ) : (
                    <User className="w-8 h-8 text-white/90" />
                  )}
                </div>
                <div>
                  <p className="text-red-100 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Kari King 👑</p>
                  {user ? (
                    <>
                      <h2 className="text-xl font-black text-white leading-tight">{user.name || 'Hey there!'}</h2>
                      <div className="flex items-center gap-1 text-red-100 mt-1">
                        <MapPin className="w-3 h-3" />
                        <span className="text-xs font-medium truncate max-w-[150px]">{user.address || 'Set your location'}</span>
                      </div>
                    </>
                  ) : (
                    <Link to="/login" onClick={onClose} className="text-white font-bold text-lg underline underline-offset-4 decoration-red-300">
                      Login / Sign Up
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-safe">
              <div className="px-5 py-6 space-y-6">

                {/* ─── 2. VALUE ADD CARDS ─── */}
                <div className="space-y-3">
                  {/* Free Delivery Bar */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-xs font-bold text-gray-700">Free Delivery</p>
                      </div>
                      <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {remainingForFreeDelivery <= 0 ? 'UNLOCKED' : `Add ₹${remainingForFreeDelivery}`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        className={cn("h-full rounded-full transition-all duration-1000", progressPct >= 100 ? "bg-green-500" : "bg-red-500")}
                      />
                    </div>
                  </div>

                  {/* Active Order Live Tracker */}
                  {hasActiveOrder && (
                    <Link 
                      to="/orders" 
                      onClick={onClose}
                      className="bg-green-50 rounded-2xl p-4 border border-green-100 flex items-center justify-between active:scale-95 transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Package className="w-5 h-5 text-green-600 relative z-10" />
                          <span className="absolute inset-0 bg-green-400 blur-sm opacity-50 animate-pulse rounded-full" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-green-800 uppercase tracking-wider mb-0.5">Live Order Active</p>
                          <p className="text-xs text-green-700 font-medium">Track your delivery now</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-green-600" />
                    </Link>
                  )}
                  
                  {/* Rewards/Coins */}
                  {user && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-100/50 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Kari Coins</p>
                        <p className="font-black text-xl text-amber-900 border-b border-amber-200/50 pb-0.5 inline-block">
                          🪙 {user.coins || 0}
                        </p>
                      </div>
                      <Link to="/referral" onClick={onClose} className="bg-amber-100/50 text-amber-700 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        Earn More
                      </Link>
                    </div>
                  )}
                </div>

                {/* ─── 3. QUICK MEAT CATEGORIES (PREMIUM ACTION) ─── */}
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 pl-1">Popular Cuts</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Link to="/products" onClick={onClose} className="bg-white p-3 rounded-2xl border border-gray-100 flex items-center gap-2 active:bg-gray-50 transition-colors shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                        <Drumstick className="w-4 h-4 text-red-600" />
                      </div>
                      <span className="font-bold text-xs text-gray-800">Fresh Chicken</span>
                    </Link>
                    <Link to="/products" onClick={onClose} className="bg-white p-3 rounded-2xl border border-gray-100 flex items-center gap-2 active:bg-gray-50 transition-colors shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                        <Beef className="w-4 h-4 text-orange-600" />
                      </div>
                      <span className="font-bold text-xs text-gray-800">Tender Mutton</span>
                    </Link>
                  </div>
                </div>

                {/* ─── 4. MAIN MENU ─── */}
                <div className="space-y-1">
                  {navItems.map((item) => {
                    if (item.protected && !user) return null;
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all",
                          isActive ? "bg-red-50 text-red-600" : "text-gray-600 hover:bg-gray-100 active:bg-gray-100"
                        )}
                      >
                        <Icon className={cn("w-5 h-5", isActive ? "text-red-500" : "text-gray-400")} />
                        <span className={cn("font-bold text-sm", isActive && "text-red-700")}>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>

                {/* Promo Banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 p-5 mt-4">
                  <Flame className="absolute -right-2 -bottom-4 w-20 h-20 text-white/5" />
                  <p className="text-red-400 font-black text-[10px] uppercase tracking-widest mb-1 relative z-10">Use Code: KARI100</p>
                  <h4 className="text-white font-black text-lg leading-tight relative z-10">Get Flat ₹100 OFF<br/>On First Order</h4>
                </div>

              </div>
            </div>

            {/* ─── BOTTOM SECTION (TRUST + SETTINGS) ─── */}
            <div className="p-6 bg-white border-t border-gray-100 shrink-0">
              <div className="flex items-center justify-around mb-6">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-wider text-center">100% Organic<br/>& Safe</span>
                </div>
                <div className="w-px h-8 bg-gray-100" />
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-wider text-center">Express<br/>Delivery</span>
                </div>
              </div>

              {user && (
                <button 
                  onClick={() => { logout(); onClose(); }}
                  className="flex items-center gap-2 text-gray-400 hover:text-red-600 transition-colors w-full justify-center"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Logout</span>
                </button>
              )}
              <p className="text-center text-[10px] text-gray-300 font-medium mt-4">Kari King App v1.0.0</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
