import React, { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, limit,
  doc, updateDoc, getDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { processReferralReward } from '../lib/referralReward';
import {
  Package, MapPin, Phone, Truck, CheckCircle2, Navigation,
  User, Zap, LogOut, ShoppingBag, Box, WifiOff, Wifi, PhoneCall, PartyPopper
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

// ─── helpers ──────────────────────────────────────────────────────────────────
const isToday = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};

const STATUS_CHIP: Record<string, string> = {
  'Order Placed':    'bg-yellow-100/80 text-yellow-800 border border-yellow-200',
  'Order Received':  'bg-blue-100/80 text-blue-800 border border-blue-200',
  Packed:            'bg-purple-100/80 text-purple-800 border border-purple-200',
  Dispatched:        'bg-orange-100/80 text-orange-800 border border-orange-200',
  Delivered:         'bg-green-100/80 text-green-800 border border-green-200',
  Cancelled:         'bg-red-100/80 text-red-800 border border-red-200',
};

type Tab = 'active' | 'completed';

export default function DeliveryDashboard() {
  const { user, isDelivery, logout } = useAuth();
  const [allOrders,  setAllOrders]  = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>('active');
  const [isOnline,   setIsOnline]   = useState<boolean>(true);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // ─── Derived lists ────────────────────────────────────────────────────────
  const activeOrders     = allOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled');
  const completedOrders  = allOrders.filter(o => o.status === 'Delivered' || o.status === 'Cancelled');

  // ─── Fetch partner's online state ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setIsOnline(data.isOnline === true);
      }
    });
  }, [user]);

  // ─── Real-time orders listener (assigned to me) ──────────────────────────
  useEffect(() => {
    if (!user || !isDelivery) return;

    // 1. Active Orders (Order Received, Packed, Dispatched)
    const activeQ = query(
      collection(db, 'orders'),
      where('deliveryPartnerId', '==', user.uid),
      where('status', 'in', ['Order Received', 'Packed', 'Dispatched']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    let activeList: Order[] = [];
    let doneList: Order[] = [];

    const unsub1 = onSnapshot(activeQ, snap => {
      activeList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      mergeOrders();
    }, err => { console.error('Active orders error:', err); setLoading(false); });

    // 2. Done Orders (Delivered, Cancelled)
    const doneQ = query(
      collection(db, 'orders'),
      where('deliveryPartnerId', '==', user.uid),
      where('status', 'in', ['Delivered', 'Cancelled']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub2 = onSnapshot(doneQ, snap => {
      doneList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      mergeOrders();
    }, err => { console.error('Done orders error:', err); setLoading(false); });

    function mergeOrders() {
      // Combine, deduplicate by id, sort by createdAt desc
      const map = new Map<string, Order>();
      [...activeList, ...doneList].forEach(o => map.set(o.id, o));
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAllOrders(merged);
      setLoading(false);
    }

    return () => { unsub1(); unsub2(); };
  }, [user, isDelivery]);

  // ─── Toggle online/offline ────────────────────────────────────────────────
  const toggleOnline = async () => {
    if (!user || togglingOnline) return;
    
    // Prevent going offline if there are active holding orders
    if (isOnline && activeOrders.length > 0) {
      setErrorToast("Cannot go offline while holding active orders!");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    setTogglingOnline(true);
    try {
      const newState = !isOnline;
      await setDoc(doc(db, 'users', user.uid), { isOnline: newState }, { merge: true });
      setIsOnline(newState);
    } catch (e) {
      console.error(e);
      setErrorToast("Failed to change status. Check internet.");
      setTimeout(() => setErrorToast(null), 3000);
    } finally {
      setTogglingOnline(false);
    }
  };



  // ─── Update order status ──────────────────────────────────────────────────
  const updateStatus = async (order: Order, newStatus: Order['status']) => {
    if (updatingOrderId === order.id) return; // Prevent double taps
    
    setUpdatingOrderId(order.id);
    try {
      const now = new Date().toISOString();
      const newHistory = [...order.statusHistory, { status: newStatus, time: now }];
      const extra: Record<string, string> = { updatedAt: now };
      if (newStatus === 'Packed') extra.acceptedAt = now;
      if (newStatus === 'Dispatched') extra.pickedAt = now;
      if (newStatus === 'Delivered') extra.deliveredAt = now;

      await updateDoc(doc(db, 'orders', order.id), {
        status: newStatus,
        statusHistory: newHistory,
        ...extra
      });

      // Trigger referral reward check when order is delivered
      if (newStatus === 'Delivered' && order.userId) {
        processReferralReward(order.userId, order.id).catch(err => 
          console.error('Referral reward check failed:', err)
        );
      }
    } catch (e) {
      console.error(e);
      setErrorToast("Failed to update order. Check internet.");
      setTimeout(() => setErrorToast(null), 3000);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const todayDone       = completedOrders.filter(o => o.status === 'Delivered' && isToday(o.updatedAt || o.createdAt)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 flex-col gap-4">
        <Truck className="w-12 h-12 text-red-600 animate-bounce" />
        <span className="font-bold text-gray-500">Loading your deliveries...</span>
      </div>
    );
  }

  const displayOrders = tab === 'active' ? activeOrders : completedOrders;
  const partnerName = user?.name || user?.phone?.slice(-4) || 'Partner';
  const partnerInitial = partnerName.charAt(0).toUpperCase();

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen relative shadow-2xl overflow-hidden sm:rounded-[3rem] sm:border-[8px] sm:border-gray-900 sm:my-8 flex flex-col font-sans">
      
      {/* ─── PREMIUM GRADIENT HEADER ────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-red-700 via-red-600 to-rose-500 rounded-b-[2.5rem] shadow-xl pb-6 pt-10 px-6 relative shrink-0 z-10">
        
        {/* Top Info */}
        
        {/* Error Toast Overlay */}
        <AnimatePresence>
          {errorToast && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-6 right-6 bg-red-900 border border-white/20 text-white p-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 text-sm font-bold"
            >
              <Box className="w-5 h-5 shrink-0" /> {errorToast}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Kari King Delivery</p>
            <h1 className="text-3xl font-black text-white leading-tight">
              Hey, {partnerName} 👋
            </h1>
            <p className="text-red-100 text-sm font-medium mt-1 opacity-90">Ready to deliver today?</p>
          </div>
          
          {/* Avatar Profile */}
          <Link to="/delivery/profile" className="relative group">
            <div className="w-12 h-12 rounded-full border-[3px] border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center overflow-hidden transition-transform active:scale-95 shadow-lg">
               <User className="w-6 h-6 text-white" />
            </div>
            {/* Online Dot on Avatar */}
            <span className={cn(
              "absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-red-600 rounded-full",
              isOnline ? "bg-green-400" : "bg-gray-400"
            )}></span>
          </Link>
        </div>

        {/* ─── Glassmorphism KPI Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Active Orders Card */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mb-2">
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
            </div>
            <div>
              <p className="text-white font-black text-xl leading-none">{activeOrders.length}</p>
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest mt-1">Active</p>
            </div>
          </div>

          {/* Today Done Card */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
            </div>
            <div>
              <p className="text-white font-black text-xl leading-none">{todayDone}</p>
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest mt-1">Today</p>
            </div>
          </div>

          {/* Online Toggle Card (Interactive) */}
          <button
            onClick={toggleOnline}
            disabled={togglingOnline}
            className={cn(
              "backdrop-blur-md border rounded-2xl p-3 flex flex-col justify-between transition-all active:scale-95 shadow-lg text-left relative overflow-hidden",
              isOnline 
                ? "bg-green-500/20 border-green-400/40" 
                : "bg-white/5 border-white/10"
            )}
          >
            {isOnline ? (
               <div className="absolute inset-0 bg-green-400/10 animate-pulse pointer-events-none" />
            ) : null}

            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center mb-2",
              isOnline ? "bg-green-400/30 text-green-200" : "bg-white/10 text-white/50"
            )}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </div>
            <div>
              <p className={cn("font-black text-[11px] uppercase tracking-wider", isOnline ? "text-green-300" : "text-white/70")}>
                {isOnline ? 'Online' : 'Offline'}
              </p>
              <p className={cn("text-[7px] font-bold uppercase tracking-widest mt-1", isOnline ? "text-green-300/60" : "text-white/40")}>
                Tap to Switch
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ─── SEGMENTED TAB CONTROL ──────────────────────────────────────── */}
      <div className="px-5 mt-6 mb-2 shrink-0">
        <div className="bg-gray-200/80 p-1.5 rounded-full flex relative">
          {(['active', 'completed'] as Tab[]).map(t => {
            const isActive = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors relative z-10 rounded-full',
                  isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-white rounded-full shadow-sm z-[-1]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="flex items-center justify-center gap-2">
                  {t === 'active' ? '🚚 Active' : '✅ Done'}
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[9px]",
                    isActive ? "bg-gray-100 text-gray-800" : "bg-gray-300/50"
                  )}>
                    {t === 'active' ? activeOrders.length : completedOrders.length}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── ORDERS LIST ────────────────────────────────────────────────── */}
      <div className="flex-1 p-5 space-y-5 overflow-y-auto pb-32">
        {displayOrders.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 flex flex-col items-center"
          >
            <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6 relative">
               <Package className="w-16 h-16 text-gray-300" />
               {!isOnline && (
                 <div className="absolute top-0 right-0 w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center border-4 border-gray-50">
                    <WifiOff className="w-3 h-3 text-white" />
                 </div>
               )}
            </div>
            
            <h3 className="text-xl font-black text-gray-800 tracking-tight">
              {tab === 'active' ? 'No active orders' : 'No deliveries yet'}
            </h3>
            
            <p className="text-gray-400 mt-2 text-sm font-medium max-w-[250px]">
              {tab === 'active' 
                ? (isOnline ? "You're online. Pending orders will appear here automatically." : "You're currently offline. Go online to receive new deliveries.")
                : "Orders you have completed will show up in this tab."}
            </p>

            {!isOnline && tab === 'active' && (
              <button 
                onClick={toggleOnline}
                className="mt-8 bg-green-500 text-white px-8 py-3.5 rounded-full font-bold shadow-lg shadow-green-500/30 active:scale-95 transition-transform"
              >
                Go Online Now
              </button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {displayOrders.map((order) => (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="p-5">
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-2xl text-gray-900 leading-none">₹{order.totalAmount}</h3>

                        {order.type === 'bulk' && <span className="bg-blue-100 text-blue-700 p-1 rounded-lg"><Package className="w-4 h-4"/></span>}
                        {order.type === 'function' && <span className="bg-amber-100 text-amber-600 p-1 rounded-lg"><PartyPopper className="w-4 h-4"/></span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-gray-400 font-bold uppercase tracking-widest text-[9px]">
                        <span>#{order.id.slice(-6)}</span>
                        <span>•</span>
                        {order.type === 'function' ? (
                          <span className="text-amber-500 font-black">Event Booking</span>
                        ) : order.type === 'bulk' ? (
                          <span className="text-blue-500 font-black">Bulk Order</span>
                        ) : (
                          <span>{order.items.length} items</span>
                        )}
                      </div>
                    </div>
                    {/* Status Badge */}
                    <span className={cn('px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm', STATUS_CHIP[order.status] || 'bg-gray-100 text-gray-600')}>
                      {order.status}
                    </span>
                  </div>

                  <hr className="border-gray-50 mb-4" />

                  {/* 🛒 Items List */}
                  {order.items && order.items.length > 0 && (
                    <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-1.5">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" /> Order Items
                      </p>
                      {order.items.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-gray-700 font-medium truncate flex-1 mr-2">{item.name}</span>
                          <span className="text-gray-500 font-bold shrink-0">
                            x{item.quantity} {item.unitType ? `(${item.baseWeight || ''}${item.unitType})` : ''}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 5 && (
                        <p className="text-[10px] text-gray-400 font-medium mt-1">+{order.items.length - 5} more items</p>
                      )}
                    </div>
                  )}

                  {/* 📍 Customer Info (Address + Phone) */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
                        <MapPin className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Deliver To</p>
                        <p className="text-sm font-bold text-gray-800 leading-snug">{order.address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Phone className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Customer</p>
                        <p className="text-sm font-bold text-gray-800">{order.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick action buttons (Call / Map) */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <a
                      href={`tel:${order.phone}`}
                      className="bg-blue-50 text-blue-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors active:scale-95 border border-blue-100/50"
                    >
                      <PhoneCall className="w-4 h-4" /> <span className="text-sm">Call</span>
                    </a>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(order.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-gray-50 text-gray-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors active:scale-95 border border-gray-100"
                    >
                      <Navigation className="w-4 h-4" /> <span className="text-sm">Maps</span>
                    </a>
                  </div>

                  {/* ── PRIMARY DELIVERY ACTION BUTTONS ── */}
                  {tab === 'active' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">


                      {/* Accept (already assigned) → Packed */}
                      {(order.status === 'Order Received') && (
                        <button
                          onClick={() => updateStatus(order, 'Packed')}
                          disabled={updatingOrderId === order.id}
                          className="w-full bg-gray-900 hover:bg-gray-800 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md disabled:opacity-50"
                        >
                          <Package className="w-5 h-5" /> {updatingOrderId === order.id ? 'Updating...' : 'MARK PACKED'}
                        </button>
                      )}

                      {/* 🟠 Packed → Mark Picked Up (Dispatched) */}
                      {order.status === 'Packed' && (
                        <button
                          onClick={() => updateStatus(order, 'Dispatched')}
                          disabled={updatingOrderId === order.id}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-orange-500/20 disabled:opacity-50"
                        >
                          <Box className="w-5 h-5" /> {updatingOrderId === order.id ? 'Updating...' : 'MARK PICKED UP'}
                        </button>
                      )}

                      {/* 🔵 Dispatched → Delivered */}
                      {order.status === 'Dispatched' && (
                        <button
                          onClick={() => updateStatus(order, 'Delivered')}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-600/20"
                        >
                          <CheckCircle2 className="w-6 h-6" /> COMPLETE DELIVERY
                        </button>
                      )}
                    </div>
                  )}

                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ─── FIXED BOTTOM NAV ────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-xl border-t border-gray-200 shadow-2xl px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between z-[999]">
        <button className="flex-1 flex flex-col items-center justify-center py-2 bg-red-50 rounded-2xl text-red-600 transition-colors">
          <Truck className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Orders</span>
        </button>
        <Link to="/delivery/profile" className="flex-1 flex flex-col items-center justify-center py-2 text-gray-400 hover:text-gray-900 transition-colors bg-transparent hover:bg-gray-50 rounded-2xl">
          <User className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
        </Link>
        <button onClick={logout} className="flex-1 flex flex-col items-center justify-center py-2 text-gray-400 hover:text-red-600 transition-colors bg-transparent hover:bg-red-50 rounded-2xl">
          <LogOut className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Logout</span>
        </button>
      </div>
    </div>
  );
}
