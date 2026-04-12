import React, { useEffect, useState, useMemo } from 'react';
import {
  collection, query, where, orderBy, onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { motion } from 'motion/react';
import {
  CheckCircle2, Package, Zap, Calendar, TrendingUp, Clock,
  MapPin, Phone, User, Truck, LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

// ── helpers ───────────────────────────────────────────────────────────────────
const isToday = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};

const isThisWeek = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < 7;
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

const STATUS_COLORS: Record<string, string> = {
  Delivered:     'bg-green-100 text-green-700',
  Dispatched:    'bg-orange-100 text-orange-700',
  Cancelled:     'bg-red-100 text-red-600',
  Packed:        'bg-purple-100 text-purple-700',
  'Order Placed': 'bg-blue-100 text-blue-700',
  'Order Received': 'bg-indigo-100 text-indigo-700',
};

// ── component ─────────────────────────────────────────────────────────────────
export default function DeliveryProfile() {
  const { user, logout } = useAuth();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Real-time listener: all orders for this partner ──────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('deliveryPartnerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, [user]);

  // ── Derived metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const delivered = allOrders.filter(o => o.status === 'Delivered');
    const active    = allOrders.filter(o => o.status === 'Dispatched' || o.status === 'Packed');
    const timestamp = (o: Order) => o.updatedAt || o.createdAt;
    return {
      totalCompleted:  delivered.length,
      activeNow:       active.length,
      todayCompleted:  delivered.filter(o => isToday(timestamp(o))).length,
      weekCompleted:   delivered.filter(o => isThisWeek(timestamp(o))).length,
      monthCompleted:  delivered.filter(o => isThisMonth(timestamp(o))).length,
      totalEarnings:   delivered.reduce((s, o) => s + (o.totalAmount || 0), 0),
    };
  }, [allOrders]);

  const recentHistory = allOrders.slice(0, 20);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 gap-4">
        <Truck className="w-12 h-12 text-red-600 animate-bounce" />
        <span className="font-bold text-gray-500">Loading your profile...</span>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-24 relative shadow-2xl overflow-hidden sm:rounded-[3rem] sm:border-[8px] sm:border-gray-900 sm:my-8">

      {/* ─── HERO PROFILE CARD ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-red-700 via-red-600 to-rose-500 text-white px-6 pt-10 pb-8 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
        <div className="absolute right-4 top-16 w-16 h-16 rounded-full bg-white/10" />

        <div className="relative flex items-center gap-4 mb-6">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-0.5">Delivery Partner</p>
            <h1 className="text-xl font-black text-white">{user?.name || 'Partner'}</h1>
            <p className="text-red-200 text-sm font-medium mt-0.5">{user?.phone}</p>
          </div>
          {/* Online badge */}
          <div className="ml-auto flex items-center gap-1.5 bg-green-400/20 border border-green-400/40 backdrop-blur-sm text-green-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Active
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="relative grid grid-cols-3 gap-3">
          {[
            { label: 'Active Now', value: metrics.activeNow, icon: Zap, color: 'text-yellow-300' },
            { label: 'Today', value: metrics.todayCompleted, icon: CheckCircle2, color: 'text-green-300' },
            { label: 'This Month', value: metrics.monthCompleted, icon: Calendar, color: 'text-blue-300' },
          ].map((s, i) => (
            <div key={i} className="bg-white/15 backdrop-blur-sm rounded-2xl p-3 border border-white/20 text-center">
              <s.icon className={cn('w-4 h-4 mx-auto mb-1', s.color)} />
              <p className="text-white font-black text-xl leading-none">{s.value}</p>
              <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">

        {/* ─── KPI CARDS ────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">Performance Overview</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Total Completed',
                value: metrics.totalCompleted,
                sub: 'All time deliveries',
                icon: CheckCircle2,
                gradient: 'from-green-500 to-emerald-400',
              },
              {
                label: 'Active Deliveries',
                value: metrics.activeNow,
                sub: 'In progress right now',
                icon: Zap,
                gradient: 'from-orange-500 to-amber-400',
              },
              {
                label: 'Total Earnings',
                value: `₹${metrics.totalEarnings.toLocaleString('en-IN')}`,
                sub: 'Estimated gross value',
                icon: TrendingUp,
                gradient: 'from-blue-600 to-cyan-500',
              },
              {
                label: 'This Week',
                value: metrics.weekCompleted,
                sub: 'Completed deliveries',
                icon: Calendar,
                gradient: 'from-purple-600 to-indigo-500',
              },
            ].map((kpi, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 overflow-hidden relative"
              >
                <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full bg-gradient-to-br ${kpi.gradient} opacity-10`} />
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center mb-3`}>
                  <kpi.icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
                <p className="text-xs font-bold text-gray-700 mt-0.5">{kpi.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── DELIVERY STATS BAR ───────────────────────────────────────────── */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Delivery Stats</h2>
          <div className="space-y-3">
            {[
              { label: 'Completed Today', value: metrics.todayCompleted, max: Math.max(metrics.weekCompleted, 1), color: 'bg-green-500' },
              { label: 'Completed This Week', value: metrics.weekCompleted, max: Math.max(metrics.monthCompleted, 1), color: 'bg-blue-500' },
              { label: 'Completed This Month', value: metrics.monthCompleted, max: Math.max(metrics.totalCompleted, 1), color: 'bg-purple-500' },
            ].map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-gray-700">{s.label}</span>
                  <span className="text-sm font-black text-gray-900">{s.value}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((s.value / s.max) * 100, 100)}%` }}
                    transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
                    className={`h-full ${s.color} rounded-full`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── DELIVERY HISTORY ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Delivery History</h2>
            <span className="text-xs text-gray-400 font-medium">{allOrders.length} total</span>
          </div>

          {recentHistory.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-sm">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="font-bold text-gray-500">No deliveries yet</p>
              <p className="text-xs text-gray-400 mt-1">Your completed orders will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentHistory.map((order, i) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        #{order.id.slice(-6).toUpperCase()}
                      </p>
                      <p className="font-black text-gray-900 text-base mt-0.5">₹{order.totalAmount}</p>
                    </div>
                    <span className={cn('text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0 mt-1', STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600')}>
                      {order.status}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500 leading-snug truncate">{order.address}</p>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-gray-300" />
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {order.phone && (
                      <a href={`tel:${order.phone}`} className="flex items-center gap-1 text-[10px] font-bold text-blue-600">
                        <Phone className="w-3 h-3" /> {order.phone}
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ─── FLOATING BOTTOM NAV ────────────────────────────────────────── */}
      <div className="fixed bottom-6 left-6 right-6 max-w-md md:left-1/2 md:-translate-x-1/2 bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl px-2 py-2 flex items-center justify-between z-20">
        <Link to="/delivery" className="flex-1 flex flex-col items-center justify-center py-2 text-gray-400 hover:text-gray-900 transition-colors bg-transparent hover:bg-gray-50 rounded-2xl">
          <Truck className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Orders</span>
        </Link>
        <button className="flex-1 flex flex-col items-center justify-center py-2 bg-red-50 rounded-2xl text-red-600 transition-colors">
          <User className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
        </button>
        <button onClick={logout} className="flex-1 flex flex-col items-center justify-center py-2 text-gray-400 hover:text-red-600 transition-colors bg-transparent hover:bg-red-50 rounded-2xl">
          <LogOut className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-black uppercase tracking-widest">Logout</span>
        </button>
      </div>
    </div>
  );
}
