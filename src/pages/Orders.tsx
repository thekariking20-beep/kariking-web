import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Clock, CheckCircle2, Truck, XCircle,
  ChevronDown, ChevronUp, MapPin, Phone, ShoppingBag,
  Navigation, Box, Zap, FileDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import { downloadInvoice } from '../lib/invoiceGenerator';
import { formatQty } from '../lib/units';
import { PartyPopper } from 'lucide-react';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  'Order Placed':    { icon: Clock,         color: 'text-yellow-600',  bg: 'bg-yellow-50',  bar: 'bg-yellow-400',  label: 'Order Placed'    },
  'Order Received':  { icon: CheckCircle2,  color: 'text-blue-600',    bg: 'bg-blue-50',    bar: 'bg-blue-500',    label: 'Order Received'  },
  'Packed':          { icon: Package,       color: 'text-purple-600',  bg: 'bg-purple-50',  bar: 'bg-purple-500',  label: 'Packed'          },
  'Dispatched':      { icon: Truck,         color: 'text-orange-600',  bg: 'bg-orange-50',  bar: 'bg-orange-500',  label: 'Out for Delivery'},
  'Delivered':       { icon: CheckCircle2,  color: 'text-green-600',   bg: 'bg-green-50',   bar: 'bg-green-500',   label: 'Delivered'       },
  'Cancelled':       { icon: XCircle,       color: 'text-red-600',     bg: 'bg-red-50',     bar: 'bg-red-400',     label: 'Cancelled'       },
};

const TIMELINE_STEPS = ['Order Placed', 'Order Received', 'Packed', 'Dispatched', 'Delivered'] as const;

// formatQty imported from lib/units

// ─── Live timeline component ──────────────────────────────────────────────────
function LiveTimeline({ order }: { order: Order }) {
  if (order.status === 'Cancelled') {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
        <XCircle className="w-6 h-6 text-red-600 shrink-0" />
        <div>
          <p className="font-bold text-red-700">Order Cancelled</p>
          <p className="text-xs text-red-500 mt-0.5">This order was cancelled and will not be delivered.</p>
        </div>
      </div>
    );
  }

  const currentIdx = TIMELINE_STEPS.indexOf(order.status as typeof TIMELINE_STEPS[number]);
  const progressPct = currentIdx >= 0 ? (currentIdx / (TIMELINE_STEPS.length - 1)) * 100 : 0;

  const stepTimestamps: Record<string, string> = {
    'Order Placed':   order.createdAt,
    'Order Received': order.assignedAt || '',
    'Packed':         order.acceptedAt || '',
    'Dispatched':     order.pickedAt || '',
    'Delivered':      order.deliveredAt || '',
  };

  return (
    <div className="relative py-6 px-2">
      {/* Progress track */}
      <div className="absolute top-10 left-6 right-6 h-1 bg-gray-100 rounded-full z-0" />
      <motion.div
        className="absolute top-10 left-6 h-1 bg-green-500 rounded-full z-0"
        initial={{ width: 0 }}
        animate={{ width: `calc(${progressPct}% - 24px)` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      <div className="relative flex justify-between z-10">
        {TIMELINE_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent   = idx === currentIdx;
          const cfg = STATUS_CONFIG[step];
          const ts  = stepTimestamps[step];

          return (
            <div key={step} className="flex flex-col items-center gap-2 flex-1">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 border-2',
                isCompleted ? 'bg-green-500 border-green-500 text-white shadow-md shadow-green-200'
                : isCurrent ? 'bg-white border-green-500 text-green-600 scale-110 shadow-lg shadow-green-100'
                : 'bg-white border-gray-200 text-gray-300'
              )}>
                {isCompleted
                  ? <CheckCircle2 className="w-5 h-5" />
                  : <cfg.icon className="w-4 h-4" />}
              </div>
              <div className="text-center">
                <p className={cn(
                  'text-[8px] sm:text-[9px] font-black uppercase tracking-tighter leading-tight',
                  isCurrent ? 'text-green-600' : isCompleted ? 'text-gray-500' : 'text-gray-300'
                )}>
                  {cfg.label}
                </p>
                {ts && (isCompleted || isCurrent) && (
                  <p className="text-[7px] text-gray-400 mt-0.5">
                    {new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live indicator for active orders */}
      {(order.status as string) !== 'Delivered' && (order.status as string) !== 'Cancelled' && (
        <div className="flex items-center justify-center gap-2 mt-4 bg-green-50 rounded-xl px-3 py-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-green-700">Live tracking active</span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Orders() {
  const { user, isAdmin } = useAuth();
  const [orders, setOrders]           = useState<Order[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [processingPaymentFor, setProcessingPaymentFor] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Helper to safely load razorpay script
  const loadRazorpay = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRetryPayment = async (order: Order) => {
    setProcessingPaymentFor(order.id);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay failed to load.');

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: Math.round((order.finalAmount || order.totalAmount) * 100), // convert to paise
        currency: 'INR',
        name: 'Kari King',
        description: `Retry Payment for Order #${order.id.slice(-6).toUpperCase()}`,
        handler: async function (response: any) {
          // Success update DB
          await updateDoc(doc(db, 'orders', order.id), {
            paymentStatus: 'paid',
            updatedAt: new Date().toISOString()
          });
          setProcessingPaymentFor(null);
        },
        prefill: { contact: order.phone },
        theme: { color: '#7A0000' },
        modal: {
          ondismiss: function () {
            setProcessingPaymentFor(null);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      setErrorToast(err.message || 'Payment initiation failed.');
      setTimeout(() => setErrorToast(null), 3000);
      setProcessingPaymentFor(null);
    }
  };

  // Real-time listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    
    // Performance phase: 
    // Admins load latest 50 orders automatically natively indexed by createdAt
    // Users load solely their constraints to bypass rigorous composite indexing requirements
    const q = isAdmin
      ? query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50))
      : query(collection(db, 'orders'), where('userId', '==', user.uid));

    const unsub = onSnapshot(q, snap => {
      const dbOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      
      // Client-side chronologic sort prevents missing Firebase Index errors for end-users
      if (!isAdmin) {
        dbOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      
      setOrders(dbOrders);
      setLoading(false);
    }, err => { 
      console.error("Order listener error:", err); 
      setLoading(false); 
    });

    return () => unsub();
  }, [user, isAdmin]);

  const updateStatus = async (orderId: string, status: Order['status']) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const newHistory = [...order.statusHistory, { status, time: new Date().toISOString() }];
      await updateDoc(doc(db, 'orders', orderId), { status, statusHistory: newHistory, updatedAt: new Date().toISOString() });
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="font-bold text-gray-500">Loading orders...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900">
            {isAdmin ? 'Manage Orders' : 'Your Orders'}
          </h1>
          {!isAdmin && (
            <p className="text-sm text-gray-400 mt-1">Track your orders in real-time</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="bg-gray-100 text-gray-600 px-4 py-1 rounded-full text-sm font-bold">{orders.length} Total</span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No orders found</h3>
          <p className="text-gray-500">You haven't placed any orders yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {orders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['Order Placed'];
              const isExpanded = expandedOrder === order.id;
              const isActive = order.status !== 'Delivered' && order.status !== 'Cancelled';

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Status bar */}
                  <div className={cn('h-1 w-full', cfg.bar)} />

                  {/* Clickable header */}
                  <div
                    className="p-5 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between gap-4"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn('p-2.5 rounded-xl', cfg.bg)}>
                        <cfg.icon className={cn('w-5 h-5', cfg.color)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            #{order.id.slice(-6).toUpperCase()}
                          </p>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-gray-900 text-sm">
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Total</p>
                        <p className="font-black text-red-600">₹{order.totalAmount}</p>
                      </div>
                      <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-gray-50 overflow-hidden"
                      >
                        <div className="p-5 space-y-6">
                          {/* Live Timeline */}
                          <LiveTimeline order={order} />

                          {/* Retry Payment Banner */}
                          {order.paymentStatus === 'pending' && order.paymentMethod === 'razorpay' && order.status !== 'Cancelled' && (
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold text-red-800">Pending Payment</p>
                                <p className="text-xs text-red-600 mt-0.5">Your order is saved, but payment was not completed securely.</p>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleRetryPayment(order); }}
                                disabled={processingPaymentFor === order.id}
                                className="bg-red-600 text-white font-bold py-2 px-5 rounded-lg text-sm whitespace-nowrap shadow-md active:scale-95 transition-all disabled:opacity-50"
                              >
                                {processingPaymentFor === order.id ? 'Loading...' : 'Retry Payment'}
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Order items */}
                            <div>
                              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <ShoppingBag className="w-3.5 h-3.5" /> Order Items
                              </h4>
                              <div className="space-y-2.5">
                                {order.items.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600 flex items-center gap-1.5">
                                      <span className="font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest">
                                        {formatQty(item.quantity, item.unitType)}
                                      </span>
                                      {item.name}
                                    </span>
                                    <span className="font-bold text-gray-900">
                                      ₹{Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice)}
                                    </span>
                                  </div>
                                ))}
                                {order.deliveryCharge !== undefined && (
                                  <div className="flex justify-between text-sm text-gray-500 pt-1">
                                    <span>Delivery Fee</span>
                                    <span>{order.deliveryCharge === 0
                                      ? <span className="text-[10px] font-black text-green-700 bg-green-100 px-1.5 py-0.5 rounded uppercase">FREE</span>
                                      : `₹${order.deliveryCharge}`}</span>
                                  </div>
                                )}
                                <div className="border-t pt-2.5 flex justify-between font-black text-gray-900">
                                  <span>Total</span>
                                  <span>₹{order.totalAmount}</span>
                                </div>
                              </div>
                            </div>

                            {/* Delivery details + admin controls */}
                            <div className="space-y-5">
                              <div>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5" /> Delivery Details
                                </h4>
                                <div className="space-y-2.5 text-sm">
                                  <div className="flex items-start gap-2 text-gray-600">
                                    <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                    <span>{order.address}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-gray-600">
                                    <Phone className="w-4 h-4 text-blue-500 shrink-0" />
                                    <a href={`tel:${order.phone}`} className="font-bold text-blue-600 hover:underline">{order.phone}</a>
                                  </div>
                                  {order.deliveryPartnerId && (
                                    <div className="flex items-center gap-2 text-gray-600">
                                      <Truck className="w-4 h-4 text-orange-500 shrink-0" />
                                      <span className="text-xs text-orange-600 font-bold">Delivery partner assigned</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Download Invoice — only for delivered orders */}
                              {order.status === 'Delivered' && (
                                <div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadInvoice(order, user?.name);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 active:scale-[0.98] transition-all"
                                  >
                                    <FileDown className="w-4 h-4" />
                                    Download Invoice
                                  </button>
                                </div>
                              )}

                              {/* Admin manual status controls */}
                              {isAdmin && (
                                <div>
                                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Update Status</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(STATUS_CONFIG).map(([key, c]) => (
                                      <button
                                        key={key}
                                        onClick={() => updateStatus(order.id, key as Order['status'])}
                                        className={cn(
                                          'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all',
                                          order.status === key
                                            ? cn(c.bg, c.color, 'ring-2 ring-offset-1 ring-current')
                                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        )}
                                      >
                                        {c.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
