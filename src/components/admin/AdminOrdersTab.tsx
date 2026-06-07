import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, PartyPopper, QrCode, CheckCircle2, XCircle, Clock, CreditCard, Zap, Coins, FileDown, Banknote, Eye, X, Copy, MapPin, Calendar, ExternalLink } from 'lucide-react';
import { COIN_VALUE } from '../../config/coins';
import { Order, User, BulkBooking } from '../../types';
import { db } from '../../firebase';
import { downloadInvoice, resolveCustomerName } from '../../lib/invoiceGenerator';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, runTransaction } from 'firebase/firestore';

interface AdminOrdersTabProps {
  orders: Order[];
  deliveryPartners: User[];
  assignDeliveryPartner: (orderId: string, partnerId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, newStatus: Order['status']) => Promise<void>;
  loadMoreOrders?: () => void;
  hasMoreOrders?: boolean;
  loadingMoreOrders?: boolean;
}

// ─── Payment Badge Component ────────────────────────────────────────────
function PaymentBadge({ method, status }: { method: string; status: string }) {
  const configs: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
    qr: { icon: QrCode, bg: 'bg-blue-100', text: 'text-blue-700', label: 'UPI QR' },
    coins: { icon: Coins, bg: 'bg-amber-100', text: 'text-amber-700', label: 'Coins' },
    cod: { icon: Banknote, bg: 'bg-green-100', text: 'text-green-700', label: 'COD' },
  };
  const config = configs[method] || { icon: CreditCard, bg: 'bg-gray-100', text: 'text-gray-600', label: method };
  const Icon = config.icon;

  const statusMap: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
    pending: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Pending' },
    awaiting_payment: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Awaiting', pulse: true },
    under_review: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Under Review', pulse: true },
    confirmed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Confirmed' },
    collected: { bg: 'bg-green-100', text: 'text-green-700', label: 'Collected' },
    paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  };
  const st = statusMap[status];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${config.bg} ${config.text}`}>
        <Icon className="w-3 h-3" /> {config.label}
      </span>
      {st && (
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${st.bg} ${st.text} ${st.pulse ? 'animate-pulse' : ''}`}>
          {st.label}
        </span>
      )}
    </div>
  );
}

// ─── QR Verification Action Buttons ──────────────────────────────────────
function QrVerifyActions({ orderId }: { orderId: string }) {
  const [verifying, setVerifying] = useState<'approve' | 'reject' | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);

  const handleVerify = async (action: 'approve' | 'reject') => {
    let rejectReason: string | undefined;
    if (action === 'reject') {
      rejectReason = prompt('Reason for rejection (shown to customer):') || 'Payment could not be verified';
    }
    
    setVerifying(action);
    try {
      const orderRef = doc(db, 'orders', orderId);
      const now = new Date().toISOString();

      if (action === 'approve') {
        // Use a transaction so we can safely read + deduct coins atomically
        await runTransaction(db, async (transaction) => {
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists()) throw new Error('Order not found.');
          const order = orderSnap.data();

          if (order.paymentStatus !== 'under_review') {
            throw new Error('Order is not under review.');
          }

          // Deduct pending coins if any
          if (order.pendingCoinsDeduction > 0) {
            const userRef = doc(db, 'users', order.userId);
            const userSnap = await transaction.get(userRef);
            if (userSnap.exists()) {
              const currentCoins = userSnap.data().coins || 0;
              const actualDeduction = Math.min(order.pendingCoinsDeduction, currentCoins);
              if (actualDeduction > 0) {
                transaction.update(userRef, { coins: currentCoins - actualDeduction });
              }
            }
          }

          // Update order status
          const newHistory = [...(order.statusHistory || []), { status: 'Order Placed', time: now }];
          transaction.update(orderRef, {
            paymentStatus: 'confirmed',
            pendingCoinsDeduction: 0,
            verifiedAt: now,
            updatedAt: now,
            statusHistory: newHistory,
          });
        });
      } else {
        // Reject — simple update, no coin logic
        await updateDoc(orderRef, {
          paymentStatus: 'rejected',
          rejectionReason: rejectReason,
          updatedAt: now,
        });
      }

      setDone(action === 'approve' ? 'approved' : 'rejected');
    } catch (err: any) {
      console.error('QR verify error:', err);
      alert(`Verification failed: ${err.message || 'Unknown error'}. Please try again.`);
    }
    setVerifying(null);
  };

  if (done) {
    return (
      <div className={`text-xs font-black uppercase tracking-widest text-center py-2 rounded-xl ${
        done === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {done === 'approved' ? '✅ Payment Approved' : '❌ Payment Rejected (User can retry)'}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleVerify('approve')}
        disabled={verifying !== null}
        className="flex-1 bg-green-600 text-white text-xs font-black py-2 rounded-xl flex items-center justify-center gap-1 hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {verifying === 'approve' ? '...' : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve</>}
      </button>
      <button
        onClick={() => handleVerify('reject')}
        disabled={verifying !== null}
        className="flex-1 bg-red-600 text-white text-xs font-black py-2 rounded-xl flex items-center justify-center gap-1 hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {verifying === 'reject' ? '...' : <><XCircle className="w-3.5 h-3.5" /> Reject</>}
      </button>
    </div>
  );
}

// ─── Quantity Formatter ──────────────────────────────────────────────────
function formatQty(qty: number, unit?: string): string {
  if (unit === 'gram') {
    if (qty >= 1000 && qty % 1000 === 0) return `${qty / 1000} kg`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
    return `${qty} g`;
  }
  if (unit === 'kg') return `${qty} kg`;
  if (unit === 'piece') return `${qty} pcs`;
  if (unit === 'litre') return `${qty} L`;
  return `${qty}`;
}

// ─── Order Details Modal ─────────────────────────────────────────────────
function OrderDetailsModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  // ─── Pricing computations (mirrors invoiceGenerator.ts) ───
  const deliveryCharge = order.deliveryCharge ?? 0;
  const coinDiscount = order.coinsDiscountAmount || (order.coinsUsed > 0 ? order.coinsUsed * COIN_VALUE : 0);
  const totalSavings = (order.couponDiscount || 0) + coinDiscount + (deliveryCharge === 0 && order.totalAmount >= 500 ? 40 : 0);

  // ─── Status color map ───
  const statusColors: Record<string, string> = {
    'Order Placed':   'bg-blue-100 text-blue-700 border-blue-200',
    'Order Received': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Packed':         'bg-purple-100 text-purple-700 border-purple-200',
    'Dispatched':     'bg-sky-100 text-sky-700 border-sky-200',
    'Delivered':      'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Cancelled':      'bg-red-100 text-red-700 border-red-200',
  };

  const paymentLabels: Record<string, string> = {
    qr: 'UPI QR Payment',
    coins: 'Kari Coins',
    cod: 'Cash on Delivery',
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ═══ HEADER ═══ */}
        <div className="bg-gradient-to-r from-red-700 to-red-600 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-black text-base tracking-wide">Order Details</h3>
            <p className="text-red-200 text-[10px] font-bold uppercase tracking-widest mt-0.5">#{order.id.slice(-8).toUpperCase()}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* ═══ SCROLLABLE CONTENT ═══ */}
        <div className="flex-1 overflow-y-auto">

          {/* ─── Order Info Bar ─── */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${statusColors[order.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {order.status}
            </span>
            <PaymentBadge method={order.paymentMethod} status={order.paymentStatus} />
            <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 font-medium">
              <Calendar className="w-3 h-3" />
              {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* ─── Customer Info ─── */}
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Customer</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{order.phone}</p>
                  <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />{order.address}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => copyToClipboard(order.phone, 'phone')}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  title="Copy phone"
                >
                  <Copy className="w-3 h-3 text-gray-500" />
                </button>
                <button
                  onClick={() => copyToClipboard(order.id, 'orderId')}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  title="Copy order ID"
                >
                  <ExternalLink className="w-3 h-3 text-gray-500" />
                </button>
              </div>
            </div>
            {copiedField && (
              <p className="text-[9px] font-bold text-green-600 mt-1 text-right">✓ {copiedField === 'phone' ? 'Phone' : 'Order ID'} copied</p>
            )}
          </div>

          {/* ─── Items List ─── */}
          <div className="px-5 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-3">Items ({order.items.length})</p>
            <div className="space-y-2.5">
              {order.items.map((item, idx) => {
                const lineTotal = Math.round((item.quantity / (item.baseWeight || 1)) * item.sellingPrice);
                return (
                  <div key={`${item.productId}-${idx}`} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0 text-lg">
                      🍗
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {formatQty(item.quantity, item.unitType)} × ₹{item.sellingPrice}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-gray-900 text-sm">₹{lineTotal}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ STICKY SUMMARY FOOTER ═══ */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-3 space-y-1.5">
          {/* Subtotal */}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Subtotal</span>
            <span className="text-gray-900 font-bold">₹{order.totalAmount}</span>
          </div>

          {/* Coupon Discount */}
          {order.couponDiscount && order.couponDiscount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 font-medium">Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</span>
              <span className="text-green-600 font-bold">−₹{order.couponDiscount}</span>
            </div>
          )}

          {/* Coins Redeemed */}
          {order.coinsUsed > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 font-medium">🪙 Coins ({order.coinsUsed})</span>
              <span className="text-green-600 font-bold">−₹{coinDiscount}</span>
            </div>
          )}

          {/* Delivery Charge */}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Delivery</span>
            <span className={`font-bold ${deliveryCharge === 0 ? 'text-green-600' : 'text-gray-900'}`}>
              {deliveryCharge === 0 ? 'FREE' : `₹${deliveryCharge}`}
            </span>
          </div>

          {/* Total Savings */}
          {totalSavings > 0 && (
            <div className="flex justify-between text-xs bg-green-50 -mx-5 px-5 py-1.5 border-y border-green-100">
              <span className="text-green-700 font-bold">💰 Total Savings</span>
              <span className="text-green-700 font-black">₹{totalSavings}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="text-gray-900 font-black text-sm">Total Paid</span>
            <span className="text-red-700 font-black text-xl">₹{order.finalAmount || order.totalAmount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Order Card Component ────────────────────────────────────────────────
function OrderCard({ order, deliveryPartners, assignDeliveryPartner, updateOrderStatus, accentColor, onViewDetails }: {
  key?: React.Key;
  order: Order;
  deliveryPartners: User[];
  assignDeliveryPartner: (orderId: string, partnerId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, newStatus: Order['status']) => Promise<void>;
  accentColor: string;
  onViewDetails: (order: Order) => void;
}) {
  const isUnderReview = order.paymentMethod === 'qr' && order.paymentStatus === 'under_review';

  // Pre-fetch customer name on mount so download stays synchronous
  const [cachedName, setCachedName] = useState<string>((order as any).customerName || 'Customer');
  useEffect(() => {
    if (!(order as any).customerName && order.userId) {
      resolveCustomerName(order).then(setCachedName);
    }
  }, [order.id]);

  return (
    <div className={`bg-white p-4 rounded-2xl border shadow-sm hover:shadow-md transition-all ${
      isUnderReview ? 'border-orange-200 ring-2 ring-orange-100' : `border-${accentColor}-100`
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">#{order.id.slice(-6)}</span>
        <span className={`text-xs font-black bg-${accentColor}-100 text-${accentColor}-700 px-2 py-0.5 rounded uppercase`}>{order.status}</span>
      </div>

      {/* Payment Info */}
      <div className="mb-2">
        <PaymentBadge method={order.paymentMethod} status={order.paymentStatus} />
      </div>

      <h4 className="font-bold text-gray-900 mb-0.5">{order.phone}</h4>
      <p className="text-xs text-gray-500 mb-2 truncate">{order.address}</p>

      {/* Price breakdown */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-black text-xl text-red-600">₹{order.finalAmount || order.totalAmount}</span>
        <span className="text-xs text-gray-400 font-medium">{new Date(order.createdAt).toLocaleDateString()}</span>
      </div>
      {order.coinsUsed > 0 && (
        <p className="text-[10px] text-amber-600 font-bold mb-3">
          🪙 {order.coinsUsed} coins used (−₹{order.coinsUsed * 20})
        </p>
      )}

      {/* UPI Verification Panel (only for under_review orders) */}
      {isUnderReview && (
        <div className="mb-3 space-y-2">
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Customer UTR Number</p>
            <p className="text-lg font-black text-gray-900 select-all text-center tracking-widest">{order.utrNumber || 'Not provided'}</p>
            {order.paymentSubmittedAt && (
              <p className="text-[9px] text-gray-400 text-center mt-1">Submitted: {new Date(order.paymentSubmittedAt).toLocaleString('en-IN')}</p>
            )}
          </div>
          <QrVerifyActions orderId={order.id} />
        </div>
      )}

      <select 
        className={`w-full mb-2 p-2 text-xs font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-${accentColor}-500/20`}
        value={order.deliveryPartnerId || ''}
        onChange={(e) => assignDeliveryPartner(order.id, e.target.value)}
      >
        <option value="">Assign Delivery Partner</option>
        {deliveryPartners.filter(p => p.isOnline === true).map(p => {
          const stableId = p.id || p.uid;
          return (
            <option key={stableId} value={stableId}>🟢 {p.name || p.phone}</option>
          );
        })}
      </select>
      <select 
        className={`w-full p-2 text-xs font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-${accentColor}-500/20`}
        value={order.status}
        onChange={(e) => updateOrderStatus(order.id, e.target.value as Order['status'])}
      >
        {/* Forward-only status transitions */}
        {(() => {
          const FLOW: Record<string, string[]> = {
            'Order Placed':   ['Order Placed', 'Order Received', 'Cancelled'],
            'Order Received': ['Order Received', 'Packed', 'Cancelled'],
            'Packed':         ['Packed', 'Dispatched', 'Cancelled'],
            'Dispatched':     ['Dispatched', 'Delivered', 'Cancelled'],
            'Delivered':      ['Delivered'],
            'Cancelled':      ['Cancelled'],
          };
          return (FLOW[order.status] || ['Order Placed']).map(s => (
            <option key={s} value={s}>{s}</option>
          ));
        })()}
      </select>
      {/* View Items Button */}
      <button
        onClick={() => onViewDetails(order)}
        className={`w-full mt-2 flex items-center justify-center gap-1.5 bg-gradient-to-r from-gray-700 to-gray-800 text-white py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md active:scale-[0.97] transition-all`}
      >
        <Eye className="w-3.5 h-3.5" />
        View Items ({order.items.length})
      </button>
      {order.status === 'Delivered' && (
        <button
          onClick={() => downloadInvoice(order, cachedName)}
          className="w-full mt-2 flex items-center justify-center gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
        >
          <FileDown className="w-3.5 h-3.5" />
          Invoice
        </button>
      )}
    </div>
  );
}

export default function AdminOrdersTab({ orders, deliveryPartners, assignDeliveryPartner, updateOrderStatus, loadMoreOrders, hasMoreOrders, loadingMoreOrders }: AdminOrdersTabProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [bookings, setBookings] = React.useState<BulkBooking[]>([]);

  // Real-time listener for the separated Custom Meat Bookings layout
  React.useEffect(() => {
    const q = query(collection(db, 'bulkBookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BulkBooking));
    });
    return () => unsub();
  }, []);

  const updateBookingStatus = async (bookingId: string, newStatus: any) => {
    await updateDoc(doc(db, 'bulkBookings', bookingId), {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
  };

  // Count UTR submissions awaiting admin verification
  const qrPendingCount = orders.filter(o => o.paymentMethod === 'qr' && o.paymentStatus === 'under_review').length;

  return (
    <div className="space-y-6">
      {/* UTR Pending Alert */}
      {qrPendingCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <QrCode className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-black text-orange-900 text-sm">UTR Payments — Verify Now</h4>
            <p className="text-xs text-orange-700">{qrPendingCount} order{qrPendingCount > 1 ? 's' : ''} with UTR submitted, awaiting your approval</p>
          </div>
          <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-lg animate-pulse">
            {qrPendingCount}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Column 1: Normal Orders (Red) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="p-4 border-b border-gray-100 bg-red-50 flex items-center justify-between sticky top-0 z-10">
            <h3 className="font-black text-red-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-red-600"/> Normal Orders</h3>
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-lg">{orders.filter(o => !o.type || o.type === 'normal').length}</span>
          </div>
          <div className="p-4 overflow-y-auto space-y-4 bg-gray-50/30 flex-1 scrollbar-none">
            {orders.filter(o => !o.type || o.type === 'normal').map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                deliveryPartners={deliveryPartners} 
                assignDeliveryPartner={assignDeliveryPartner} 
                updateOrderStatus={updateOrderStatus}
                accentColor="red"
                onViewDetails={setSelectedOrder}
              />
            ))}
            {orders.filter(o => !o.type || o.type === 'normal').length === 0 && <p className="text-center justify-center text-sm text-gray-400 py-10 font-medium">No normal orders yet</p>}
            {hasMoreOrders && loadMoreOrders && (
              <button
                onClick={loadMoreOrders}
                disabled={loadingMoreOrders}
                className="w-full py-3 text-xs font-bold text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loadingMoreOrders ? 'Loading...' : 'Load More Orders'}
              </button>
            )}
          </div>
        </div>

        {/* Column 2: Bulk Bookings (Blue) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="p-4 border-b border-gray-100 bg-blue-50 flex items-center justify-between sticky top-0 z-10">
            <h3 className="font-black text-blue-900 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600"/> Bulk Bookings</h3>
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg">{bookings.filter(b => b.type === 'bulk').length}</span>
          </div>
          <div className="p-4 overflow-y-auto space-y-4 bg-gray-50/30 flex-1 scrollbar-none">
            {bookings.filter(b => b.type === 'bulk').map(booking => (
              <div key={booking.id} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">#{booking.id.slice(-6)}</span>
                  <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">{booking.status}</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-0.5">{booking.userName} • {booking.userPhone}</h4>
                <div className="text-xs text-gray-500 space-y-1 mt-2 mb-3 bg-blue-50/50 p-2 rounded-xl border border-blue-50">
                  <p><span className="font-bold text-gray-700">Req Date:</span> {booking.requiredDate}</p>
                  <p><span className="font-bold text-gray-700">Weight:</span> {booking.quantityRequirement}</p>
                  <p className="line-clamp-2"><span className="font-bold text-gray-700">Meat:</span> {booking.meatDetails}</p>
                  {booking.notes && <p className="line-clamp-1 italic">"{booking.notes}"</p>}
                </div>
                <select 
                  className="w-full text-xs p-2 font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-blue-500/20"
                  value={booking.status}
                  onChange={(e) => updateBookingStatus(booking.id, e.target.value)}
                >
                  <option value="requested">Requested</option>
                  <option value="reviewed">Reviewed (Awaiting Final Price)</option>
                  <option value="awaiting_payment">Awaiting Adv Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected/Cancelled</option>
                </select>
              </div>
            ))}
            {bookings.filter(b => b.type === 'bulk').length === 0 && <p className="text-center justify-center text-sm text-gray-400 py-10 font-medium">No bulk requests yet</p>}
          </div>
        </div>

        {/* Column 3: Function Bookings (Gold) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="p-4 border-b border-gray-100 bg-amber-50 flex items-center justify-between sticky top-0 z-10">
            <h3 className="font-black text-amber-900 flex items-center gap-2"><PartyPopper className="w-5 h-5 text-amber-500"/> Function Bookings</h3>
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-lg">{bookings.filter(b => b.type === 'function').length}</span>
          </div>
          <div className="p-4 overflow-y-auto space-y-4 bg-gray-50/30 flex-1 scrollbar-none">
            {bookings.filter(b => b.type === 'function').map(booking => (
              <div key={booking.id} className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md hover:border-amber-200 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase text-amber-600 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">#{(booking.id).slice(-5)}</span>
                  <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase">{booking.status}</span>
                </div>
                <h4 className="font-bold text-gray-900 mb-0.5">{booking.userName} • {booking.userPhone}</h4>
                <div className="text-xs text-gray-500 space-y-1 mt-2 mb-3 bg-amber-50/30 p-2 rounded-xl border border-amber-50">
                  <p><span className="font-bold text-gray-700">Date:</span> {booking.requiredDate} • <span className="font-bold text-gray-700">Guests:</span> {booking.peopleCount}</p>
                  <p className="truncate"><span className="font-bold text-gray-700">Loc:</span> {booking.location}</p>
                  <p className="line-clamp-2"><span className="font-bold text-gray-700">Meat:</span> {booking.meatDetails}</p>
                  {booking.notes && <p className="line-clamp-1 italic">"{booking.notes}"</p>}
                </div>
                <select 
                  className="w-full text-xs p-2 font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-amber-500/20"
                  value={booking.status}
                  onChange={(e) => updateBookingStatus(booking.id, e.target.value)}
                >
                  <option value="requested">Requested</option>
                  <option value="reviewed">Reviewed (Awaiting Final Price)</option>
                  <option value="awaiting_payment">Awaiting Adv Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected/Cancelled</option>
                </select>
              </div>
            ))}
            {bookings.filter(b => b.type === 'function').length === 0 && <p className="text-center justify-center text-sm text-gray-400 py-10 font-medium">No event bookings yet</p>}
          </div>
        </div>
      </div>

      {/* ═══ Order Details Modal (lazy-rendered) ═══ */}
      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}
