import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Package, PartyPopper, QrCode, CheckCircle2, XCircle, Clock, CreditCard, Zap, Coins, FileDown, Banknote, Eye, X, Copy, MapPin, Calendar, ExternalLink, Trash2, IndianRupee, Send, Check, MessageSquare, AlertCircle, FileText, Printer, Users, Download, Percent, Plus, History, User as UserIcon, Phone, Mail, Building2, ChevronDown, ChevronUp, Truck, Ban, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { COIN_VALUE } from '../../config/coins';
import { Order, User, BulkBooking, Product, BulkBookingItem, BulkBookingStatusHistory } from '../../types';
import { db } from '../../firebase';
import { downloadInvoice, resolveCustomerName } from '../../lib/invoiceGenerator';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, runTransaction, getDocs, where } from 'firebase/firestore';
import { downloadQuotation, printQuotation } from '../../lib/quotationGenerator';
import { 
  downloadFunctionQuotation, 
  printFunctionQuotation,
  downloadFunctionInvoice,
  printFunctionInvoice 
} from '../../lib/functionInvoiceGenerator';


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
        className={`w-full p-2 text-xs font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-${accentColor}-500/20 disabled:opacity-60 disabled:cursor-not-allowed`}
        value={order.status}
        onChange={(e) => updateOrderStatus(order.id, e.target.value as Order['status'])}
        disabled={order.status === 'Delivered' || order.status === 'Cancelled'}
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

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string; cls: string }> = {
  requested:        { label: 'Requested',          bg: 'bg-blue-100', text: 'text-blue-700', cls: 'bg-blue-100 text-blue-700' },
  reviewed:         { label: 'Reviewed',           bg: 'bg-purple-100', text: 'text-purple-700', cls: 'bg-purple-100 text-purple-700' },
  awaiting_payment: { label: 'Quotation Sent',     bg: 'bg-amber-100', text: 'text-amber-700', cls: 'bg-amber-100 text-amber-700' },
  confirmed:        { label: 'Approved',           bg: 'bg-green-100', text: 'text-green-700', cls: 'bg-green-100 text-green-700' },
  delivered:        { label: 'Processing',         bg: 'bg-emerald-100', text: 'text-emerald-700', cls: 'bg-emerald-100 text-emerald-700' },
  completed:        { label: 'Completed',          bg: 'bg-gray-100', text: 'text-gray-600', cls: 'bg-gray-100 text-gray-600' },
  rejected:         { label: 'Rejected',           bg: 'bg-red-100', text: 'text-red-700', cls: 'bg-red-100 text-red-700' },
  cancelled:        { label: 'Cancelled',          bg: 'bg-red-100', text: 'text-red-700', cls: 'bg-red-100 text-red-700' },
};

function buildStatusHistoryEntry(
  status: string,
  existingHistory: BulkBookingStatusHistory[] | undefined,
  notes?: string
): BulkBookingStatusHistory[] {
  const entry: BulkBookingStatusHistory = {
    status,
    changedBy: 'admin',
    timestamp: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  };
  return [...(existingHistory || []), entry];
}

interface QuotationEditorProps {
  booking: BulkBooking;
  onClose: () => void;
  adminMessage: string;
  onAdminMessageChange: (v: string) => void;
  adminNotes: string;
  onAdminNotesChange: (v: string) => void;
}

interface QuotationLineItem {
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  unitType: 'kg' | 'gram' | 'piece';
  discount: number;
}

function QuotationEditor({ booking, onClose, adminMessage, onAdminMessageChange, adminNotes, onAdminNotesChange }: QuotationEditorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [saving, setSaving] = useState(false);

  // Load products from Firestore
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Product));
      } catch (e) {
        console.error('Failed to load products', e);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  // Pre-populate from existing booking items
  useEffect(() => {
    if (booking.items && booking.items.length > 0) {
      setLineItems(booking.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage || '',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        unitType: item.unitType,
        discount: item.discount || 0,
      })));
      if (booking.deliveryCharges) setDeliveryCharges(booking.deliveryCharges);
      if (booking.additionalCharges) setAdditionalCharges(booking.additionalCharges);
      if (booking.globalDiscount) setGlobalDiscount(booking.globalDiscount);
    }
  }, [booking.items, booking.deliveryCharges, booking.additionalCharges, booking.globalDiscount]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.mainCategory?.toLowerCase().includes(q));
  }, [products, searchQuery]);

  const addProduct = (product: Product) => {
    if (lineItems.some(li => li.productId === product.id)) {
      alert('This product is already in the quotation');
      return;
    }
    setLineItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      productImage: product.image || '',
      unitPrice: product.sellingPrice,
      quantity: 1,
      unitType: (product.unitType as 'kg' | 'gram' | 'piece') || 'kg',
      discount: 0,
    }]);
    setShowProductPicker(false);
    setSearchQuery('');
  };

  const removeItem = (idx: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof QuotationLineItem, value: any) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const subtotal = lineItems.reduce((sum, item) => {
    const lineTotal = (item.unitPrice * item.quantity) - item.discount;
    return sum + Math.max(lineTotal, 0);
  }, 0);

  const grandTotal = subtotal + deliveryCharges + additionalCharges - globalDiscount;

  const handleSubmitQuotation = async () => {
    if (lineItems.length === 0) {
      alert('Please add at least one product to the quotation');
      return;
    }
    if (grandTotal <= 0) {
      alert('Grand total must be greater than ₹0');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const builtItems: BulkBookingItem[] = lineItems.map(li => ({
        productId: li.productId,
        productName: li.productName,
        productImage: li.productImage,
        unitPrice: li.unitPrice,
        quantity: li.quantity,
        unitType: li.unitType,
        subtotal: li.unitPrice * li.quantity,
        discount: li.discount,
        lineTotal: (li.unitPrice * li.quantity) - li.discount,
      }));

      const advanceAmount = Math.ceil(grandTotal / 2);

      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        items: builtItems,
        subtotal,
        deliveryCharges,
        additionalCharges,
        globalDiscount,
        grandTotal,
        quotedPrice: grandTotal,
        advanceAmount,
        balanceAmount: grandTotal - advanceAmount,
        adminNotes,
        adminMessage: adminMessage.trim(),
        status: 'awaiting_payment',
        reviewedAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('awaiting_payment', booking.statusHistory, 
          booking.type === 'function' 
            ? `Detailed event quotation with ${builtItems.length} item(s) sent to customer`
            : `Detailed quotation with ${builtItems.length} item(s) sent to customer`
        ),
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to send quotation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-4 border border-blue-200 shadow-lg text-left font-sans">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4" /> Quotation Builder
        </h4>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/50">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Line Items */}
      <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
        {lineItems.map((item, idx) => (
          <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-xs">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-900 truncate flex-1">{item.productName}</p>
              <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase">Qty</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', Math.max(0, Number(e.target.value)))}
                  className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase">Unit</label>
                <select
                  value={item.unitType}
                  onChange={e => updateItem(idx, 'unitType', e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400 bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="gram">gram</option>
                  <option value="piece">piece</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase">Rate (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={item.unitPrice}
                  onChange={e => updateItem(idx, 'unitPrice', Math.max(0, Number(e.target.value)))}
                  className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-0.5"><Percent className="w-2.5 h-2.5" /> Disc (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={item.discount}
                  onChange={e => updateItem(idx, 'discount', Math.max(0, Number(e.target.value)))}
                  className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex justify-end mt-1">
              <span className="text-[10px] font-black text-gray-600">
                Line Total: ₹{Math.max((item.unitPrice * item.quantity) - item.discount, 0).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Product Button / Picker */}
      {!showProductPicker ? (
        <button
          onClick={() => setShowProductPicker(true)}
          className="w-full py-3 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-md">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {loadingProducts ? (
              <p className="text-xs text-gray-400 p-3 text-center">Loading products...</p>
            ) : filteredProducts.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">No products found</p>
            ) : (
              filteredProducts.slice(0, 20).map(product => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50 text-left transition-colors text-xs"
                >
                  {product.image && <img src={product.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{product.name}</p>
                    <p className="text-[10px] text-gray-500">{product.mainCategory} · ₹{product.sellingPrice}/{product.unitType || 'kg'}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button onClick={() => { setShowProductPicker(false); setSearchQuery(''); }} className="w-full py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Additional Charges */}
      {lineItems.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2 text-xs">
          <h5 className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Additional Charges & Discounts</h5>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase">Delivery (₹)</label>
              <input
                type="number" min="0" value={deliveryCharges}
                onChange={e => setDeliveryCharges(Math.max(0, Number(e.target.value)))}
                className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase">Additional (₹)</label>
              <input
                type="number" min="0" value={additionalCharges}
                onChange={e => setAdditionalCharges(Math.max(0, Number(e.target.value)))}
                className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase">Discount (₹)</label>
              <input
                type="number" min="0" value={globalDiscount}
                onChange={e => setGlobalDiscount(Math.max(0, Number(e.target.value)))}
                className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Totals */}
      {lineItems.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-gray-200 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold">₹{subtotal.toLocaleString()}</span></div>
          {deliveryCharges > 0 && <div className="flex justify-between"><span className="text-gray-500">+ Delivery</span><span className="font-bold">₹{deliveryCharges.toLocaleString()}</span></div>}
          {additionalCharges > 0 && <div className="flex justify-between"><span className="text-gray-500">+ Additional</span><span className="font-bold">₹{additionalCharges.toLocaleString()}</span></div>}
          {globalDiscount > 0 && <div className="flex justify-between text-green-600"><span className="text-green-600">- Discount</span><span className="font-bold">-₹{globalDiscount.toLocaleString()}</span></div>}
          <div className="flex justify-between border-t border-gray-200 pt-1.5">
            <span className="text-sm font-black text-gray-700">Grand Total</span>
            <span className="text-sm font-black text-[#8B0000]">₹{Math.max(grandTotal, 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Advance (50%)</span>
            <span className="font-bold text-blue-700">₹{Math.ceil(Math.max(grandTotal, 0) / 2).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Message & Notes */}
      <div className="text-xs">
        <label className="text-[10px] font-bold text-green-700 uppercase mb-1 block flex items-center gap-1"><Send className="w-3 h-3" /> Message to Customer</label>
        <textarea placeholder="e.g. We will connect with you shortly..." value={adminMessage} onChange={e => onAdminMessageChange(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-green-200 rounded-xl font-medium text-xs outline-none resize-none focus:border-green-500" />
      </div>

      <textarea placeholder="Admin notes (internal)" value={adminNotes} onChange={e => onAdminNotesChange(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-xs outline-none resize-none text-xs" />

      {/* Submit */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={handleSubmitQuotation}
          disabled={saving || lineItems.length === 0}
          className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-green-600/20"
        >
          <Send className="w-4 h-4" /> {saving ? 'Sending...' : 'Send Quotation'}
        </button>
        <button onClick={onClose} className="py-3 px-4 bg-gray-200 text-gray-600 rounded-xl font-bold">Cancel</button>
      </div>
    </div>
  );
}

function BookingDetailsModal({ booking, onClose }: { booking: BulkBooking; onClose: () => void }) {
  const [customerEmail, setCustomerEmail] = useState(booking.userEmail || '');
  const [customerCompany, setCustomerCompany] = useState(booking.companyName || '');
  const [loadingUser, setLoadingUser] = useState(!booking.userEmail);
  const [editMode, setEditMode] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState(booking.quotedPrice || 0);
  const [adminNotes, setAdminNotes] = useState(booking.adminNotes || '');
  const [adminMessage, setAdminMessage] = useState(booking.adminMessage || (
    booking.type === 'function'
      ? 'We will connect with you shortly to discuss the event details. Please pay the advance amount to confirm your booking.'
      : 'We will connect with you shortly to discuss the details. Please pay the advance amount to confirm your order.'
  ));
  const [saving, setSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showQuotationEditor, setShowQuotationEditor] = useState(false);

  // Fetch user details from Firestore
  useEffect(() => {
    if (booking.userEmail && booking.companyName) return;
    const fetchUser = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users')));
        const u = snap.docs.find(d => d.id === booking.userId)?.data();
        if (u) {
          if (!booking.userEmail && u.email) setCustomerEmail(u.email as string);
          if (!booking.companyName && u.companyName) setCustomerCompany(u.companyName as string);
        }
      } catch (e) {
        console.error('Failed to fetch user details', e);
      } finally {
        setLoadingUser(false);
      }
    };
    fetchUser();
  }, [booking.userId, booking.userEmail, booking.companyName]);

  const advance = Math.ceil(quotedPrice / 2);
  const isFunction = booking.type === 'function';
  const status = STATUS_STYLES[booking.status] || { label: booking.status, bg: 'bg-blue-100', text: 'text-blue-700', cls: 'bg-blue-100 text-blue-700' };

  const handleSendQuotation = async () => {
    if (quotedPrice <= 0) {
      alert('Please enter a valid price greater than ₹0');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        quotedPrice,
        advanceAmount: advance,
        balanceAmount: quotedPrice - advance,
        adminNotes,
        adminMessage: adminMessage.trim(),
        status: 'awaiting_payment',
        reviewedAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('awaiting_payment', booking.statusHistory, 
          isFunction ? 'Event quotation sent to customer' : 'Quotation sent to customer'
        ),
      });
      setEditMode(false);
    } catch (e) {
      console.error(e);
      alert('Failed to approve.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!window.confirm('Reject this booking?')) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'rejected',
        adminNotes,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('rejected', booking.statusHistory, adminNotes || 'Booking rejected by admin'),
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to reject.');
    }
  };

  const handleVerifyPayment = async () => {
    if (!window.confirm(isFunction ? 'Confirm payment received? This will approve the event booking.' : 'Confirm payment received? This will confirm the order.')) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'confirmed',
        paymentStatus: 'paid',
        advancePaid: true,
        confirmedAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('confirmed', booking.statusHistory, 
          isFunction ? 'Advance payment verified, event booking approved' : 'Payment verified and order approved'
        ),
      });
    } catch (e) {
      console.error(e);
      alert('Failed to verify payment.');
    }
  };

  const handleMarkProcessing = async () => {
    if (!window.confirm(isFunction ? 'Mark this event as Processing?' : 'Mark this order as Processing?')) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'delivered',
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('delivered', booking.statusHistory, 
          isFunction ? 'Order is in preparation' : 'Order is being processed'
        ),
      });
    } catch (e) {
      console.error(e);
      alert('Failed to update status.');
    }
  };

  const handleComplete = async () => {
    if (!window.confirm(isFunction ? 'Mark this event booking as Completed?' : 'Mark this order as Completed?')) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'completed',
        completedAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('completed', booking.statusHistory, 
          isFunction ? 'Event catering completed successfully' : 'Order completed successfully'
        ),
      });
    } catch (e) {
      console.error(e);
      alert('Failed to complete booking.');
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      alert('Please provide a cancellation reason.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'cancelled',
        cancelReason: cancelReason.trim(),
        cancelledBy: 'admin',
        cancelledAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('cancelled', booking.statusHistory, cancelReason.trim()),
      });
      setShowCancelModal(false);
      setCancelReason('');
    } catch (e) {
      console.error(e);
      alert('Failed to cancel.');
    } finally {
      setSaving(false);
    }
  };

  const isCancelled = booking.status === 'cancelled';
  const isTerminal = isCancelled || booking.status === 'completed' || booking.status === 'rejected';

  const adults = booking.adultCount || booking.peopleCount || 0;
  const children = booking.childrenCount || 0;
  const veg = booking.vegCount || 0;
  const nonveg = booking.nonVegCount || 0;

  const eventFullAddress = [
    booking.eventAddress,
    booking.eventArea,
    booking.eventCity,
    booking.eventPincode ? `Pin: ${booking.eventPincode}` : ''
  ].filter(Boolean).join(', ');

  const deliveryDest = isFunction ? (eventFullAddress || booking.location) : booking.location;
  const statusLabel = isFunction && booking.status === 'requested' ? 'Event Requested' : (status.label || booking.status);

  const triggerDownloadQuotation = () => {
    if (isFunction) {
      downloadFunctionQuotation(booking);
    } else {
      downloadQuotation(booking);
    }
  };

  const triggerPrintQuotation = () => {
    if (isFunction) {
      printFunctionQuotation(booking);
    } else {
      printQuotation(booking);
    }
  };

  const triggerDownloadInvoice = () => {
    if (isFunction) {
      downloadFunctionInvoice(booking);
    }
  };

  const triggerPrintInvoice = () => {
    if (isFunction) {
      printFunctionInvoice(booking);
    }
  };

  const messageText = isFunction
    ? `Hi ${booking.userName}, regarding your Kari King event booking #${booking.id.slice(-6)}:\n\nQuoted Price: ₹${(booking.grandTotal || booking.quotedPrice || quotedPrice).toLocaleString()}\nAdvance (50%): ₹${(booking.advanceAmount || advance).toLocaleString()}\n\n${adminMessage || 'We will connect with you shortly to discuss the event details.'}\n\nPay advance via UPI to confirm your booking. Thank you!`
    : `Hi ${booking.userName}, regarding your Kari King bulk booking #${booking.id.slice(-6)}:\n\nQuoted Price: ₹${(booking.grandTotal || booking.quotedPrice || quotedPrice).toLocaleString()}\nAdvance (50%): ₹${(booking.advanceAmount || advance).toLocaleString()}\n\n${adminMessage || 'We will connect with you shortly to discuss the details.'}\n\nPay advance via UPI to confirm your order. Thank you!`;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] shadow-2xl overflow-hidden flex flex-col font-sans"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8B0000] to-[#A50000] p-5 text-white relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                {isFunction ? <Calendar className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-lg font-black">{isFunction ? 'Event Booking Details' : 'Booking Details'}</h3>
                <p className="text-white/70 text-xs">#{booking.id.slice(-6)} · {isFunction ? (booking.functionType || 'CATERING') : booking.type.toUpperCase()}</p>
              </div>
            </div>
            <span className={`absolute bottom-4 right-4 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${status.bg} ${status.text}`}>
              {statusLabel}
            </span>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Customer Information */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                <UserIcon className="w-3 h-3" /> Customer Information
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Name</p>
                  <p className="font-bold text-gray-900">{booking.userName}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Phone</p>
                  <p className="font-bold text-gray-900">{booking.userPhone}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Email</p>
                  <p className="font-medium text-gray-700 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-gray-400" />
                    {loadingUser ? 'Loading...' : (customerEmail || 'Not provided')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Company</p>
                  <p className="font-medium text-gray-700 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-gray-400" />
                    {loadingUser ? 'Loading...' : (customerCompany || 'Not provided')}
                  </p>
                </div>
              </div>
            </div>

            {/* Target Specifications */}
            {isFunction ? (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Event Details & Scaling
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs border-b border-gray-100 pb-2.5">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Event Type</p>
                    <p className="font-bold text-gray-900 text-sm">{booking.functionType || 'Catering'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Total Guests</p>
                    <p className="font-black text-[#8B0000] text-sm">{adults + children} pax</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs pt-1">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Adults</p>
                    <p className="font-bold text-gray-800">{adults}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Children</p>
                    <p className="font-bold text-gray-800">{children}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Veg</p>
                    <p className="font-bold text-gray-800">{veg}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Non-Veg</p>
                    <p className="font-bold text-gray-800">{nonveg}</p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-gray-100">
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Meat Details</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 leading-relaxed">{booking.meatDetails || 'Not specified'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-100 text-xs">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Event Date & Time</p>
                    <p className="font-bold text-gray-900">
                      {new Date(booking.eventDate || booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {booking.eventTime ? ` @ ${booking.eventTime}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Event Address</p>
                    <p className="font-medium text-gray-800 leading-relaxed">{deliveryDest}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Target Specifications
                </h4>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">Meat Specialization</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5 leading-relaxed">{booking.meatDetails || 'Legacy Order'}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100 text-xs">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Quantity</p>
                    <p className="text-sm font-black text-[#8B0000]">{booking.quantityRequirement || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">People</p>
                    <p className="text-sm font-bold text-gray-900">{booking.peopleCount}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Delivery Time</p>
                    <p className="text-sm font-bold text-gray-900">{booking.deliveryTime || '-'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-xs">
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Required Date</p>
                    <p className="font-bold text-gray-900">{new Date(booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400 font-bold uppercase">Location</p>
                    <p className="text-xs font-medium text-gray-700 leading-relaxed">{booking.location || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quotation Items Menu */}
            {booking.items && booking.items.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" /> Itemized Menu / Quotation
                </h4>
                <div className="space-y-2">
                  {booking.items.map((item, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-gray-100 text-xs">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{item.productName}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {item.quantity} {item.unitType} × ₹{item.unitPrice.toLocaleString()}
                            {(item.discount || 0) > 0 && <span className="text-green-600 ml-1">(-₹{item.discount!.toLocaleString()} disc)</span>}
                          </p>
                        </div>
                        <p className="font-black text-gray-900">₹{(item.lineTotal ?? item.subtotal).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold">₹{(booking.subtotal || 0).toLocaleString()}</span></div>
                  {(booking.deliveryCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">{isFunction ? 'Delivery / Catering Setup' : 'Delivery Charges'}</span><span className="font-bold">₹{booking.deliveryCharges!.toLocaleString()}</span></div>}
                  {(booking.additionalCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Additional Charges</span><span className="font-bold">₹{booking.additionalCharges!.toLocaleString()}</span></div>}
                  {(booking.globalDiscount || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="font-bold text-green-600">-₹{booking.globalDiscount!.toLocaleString()}</span></div>}
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-black text-gray-700">Grand Total</span>
                    <span className="font-black text-[#8B0000] text-base">₹{(booking.grandTotal || booking.quotedPrice || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pricing Summary (if non-itemized but has quotedPrice) */}
            {booking.quotedPrice != null && booking.status !== 'requested' && (!booking.items || booking.items.length === 0) && (
              <div className="bg-green-50 rounded-xl p-4 border border-green-100 space-y-2 text-xs">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                  <IndianRupee className="w-3 h-3" /> Pricing
                </h4>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Quoted Price</span><span className="font-black">₹{booking.quotedPrice.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm text-[#8B0000]"><span className="font-bold">Advance (50%)</span><span className="font-black">₹{(booking.advanceAmount || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Advance Paid</span><span className="font-bold">{booking.advancePaid ? '✅ Yes' : '❌ No'}</span></div>
              </div>
            )}

            {/* Notes */}
            {booking.notes && (
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800 border border-blue-100">
                <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mb-1">Customer Notes</p>
                <p className="font-medium leading-relaxed">{booking.notes}</p>
              </div>
            )}
            {booking.adminNotes && (
              <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-800 border border-amber-100">
                <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mb-1">Admin Notes (Internal)</p>
                <p className="font-medium leading-relaxed">{booking.adminNotes}</p>
              </div>
            )}

            {/* ─── Admin Action Forms inside Modal ─── */}
            {(booking.status === 'requested' || booking.status === 'reviewed') && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                {!editMode && !showQuotationEditor ? (
                  <div className="flex gap-2">
                    <button onClick={() => setShowQuotationEditor(true)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                      <FileText className="w-4 h-4" /> Create Menu Quote
                    </button>
                    <button onClick={() => setEditMode(true)} className="py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                      <IndianRupee className="w-4 h-4" /> Quick Price
                    </button>
                    <button onClick={handleReject} className="py-3 px-4 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 active:scale-[0.98] transition-all">
                      Reject
                    </button>
                  </div>
                ) : editMode ? (
                  <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100 text-xs">
                    <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Quick Price Editor</h4>
                    
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Final Quoted Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₹</span>
                        <input type="number" value={quotedPrice} onChange={e => setQuotedPrice(Number(e.target.value))} className="w-full pl-7 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                      </div>
                    </div>

                    <div className="bg-white/50 p-3 rounded-xl border border-blue-100/50 flex justify-between items-center mt-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Auto Advance (50%)</span>
                      <span className="text-sm font-black text-blue-900">₹{advance.toLocaleString()}</span>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-green-700 uppercase mb-1 block flex items-center gap-1"><Send className="w-3 h-3" /> Message to Customer</label>
                      <textarea placeholder="e.g. We will connect with you shortly..." value={adminMessage} onChange={e => setAdminMessage(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-green-200 rounded-xl font-medium text-xs outline-none resize-none focus:border-green-500" />
                    </div>

                    <textarea placeholder="Admin notes (internal)" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-xs outline-none resize-none text-xs" />

                    <div className="flex gap-2">
                      <button onClick={handleSendQuotation} disabled={saving} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all">
                        <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Send Quotation'}
                      </button>
                      <button onClick={() => setEditMode(false)} className="py-3 px-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs">Cancel</button>
                    </div>
                  </div>
                ) : null}

                {showQuotationEditor && (
                  <QuotationEditor
                    booking={booking}
                    onClose={() => setShowQuotationEditor(false)}
                    adminMessage={adminMessage}
                    onAdminMessageChange={setAdminMessage}
                    adminNotes={adminNotes}
                    onAdminNotesChange={setAdminNotes}
                  />
                )}
              </div>
            )}

            {/* Booking flow actions */}
            {booking.status === 'awaiting_payment' && (
              <button onClick={handleVerifyPayment} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                <CheckCircle2 className="w-4 h-4" /> Verify Payment Received
              </button>
            )}

            {booking.status === 'confirmed' && (
              <div className="flex gap-2">
                <button onClick={handleMarkProcessing} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                  <Truck className="w-4 h-4" /> Mark Processing
                </button>
                <button onClick={handleComplete} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                  <Check className="w-4 h-4" /> Complete
                </button>
              </div>
            )}

            {booking.status === 'delivered' && (
              <button onClick={handleComplete} className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                <Check className="w-4 h-4" /> Mark as Completed
              </button>
            )}

            {/* Cancel Actions */}
            {isCancelled && (
              <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-black text-red-700 uppercase tracking-widest">Booking Cancelled</span>
                </div>
                {booking.cancelReason && (
                  <div className="flex items-start gap-2 bg-white/60 rounded-lg p-2.5">
                    <MessageSquare className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-800 font-medium leading-relaxed">{booking.cancelReason}</p>
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-red-500">
                  <span className="font-bold">By: {booking.cancelledBy === 'admin' ? 'Admin' : 'Customer'}</span>
                  {booking.cancelledAt && <span>• {new Date(booking.cancelledAt).toLocaleString('en-IN')}</span>}
                </div>
              </div>
            )}

            {!isTerminal && (
              <button onClick={() => setShowCancelModal(true)} className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 active:scale-[0.98] border border-red-100 transition-all">
                <Ban className="w-3.5 h-3.5" /> Cancel Booking
              </button>
            )}

            {/* WhatsApp link */}
            {!isTerminal && (
              <a
                href={`https://wa.me/${booking.userPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(messageText)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-600 active:scale-[0.98] transition-all shadow-md shadow-green-500/10"
              >
                <MessageSquare className="w-4 h-4" /> Send WhatsApp Message
              </a>
            )}

            {/* Status History Timeline */}
            {booking.statusHistory && booking.statusHistory.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-1">
                  <History className="w-3 h-3" /> Status Timeline
                </h4>
                <div className="relative pl-4 border-l-2 border-[#8B0000]/20 space-y-4">
                  {booking.statusHistory.map((entry, idx) => {
                    const stStyle = STATUS_STYLES[entry.status] || { label: entry.status, bg: 'bg-gray-100', text: 'text-gray-600', cls: 'bg-gray-100 text-gray-600' };
                    const itemLabel = isFunction && entry.status === 'requested' ? 'Event Requested' : (stStyle.label || entry.status);
                    return (
                      <div key={idx} className="relative text-xs">
                        <div className="absolute -left-[21px] top-0.5 w-3 h-3 rounded-full bg-[#8B0000] border-2 border-white" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${stStyle.bg || 'bg-gray-100'} ${stStyle.text || 'text-gray-600'}`}>{itemLabel}</span>
                            <span className="text-[9px] text-gray-400 font-medium">
                              {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[9px] text-gray-400">by {entry.changedBy}</span>
                          </div>
                          {entry.notes && <p className="text-[10px] text-gray-600 mt-1 font-medium">{entry.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Timestamps</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div><span className="text-gray-400">Created:</span> <span className="font-bold">{new Date(booking.createdAt).toLocaleString('en-IN')}</span></div>
                <div><span className="text-gray-400">Updated:</span> <span className="font-bold">{new Date(booking.updatedAt).toLocaleString('en-IN')}</span></div>
                {booking.reviewedAt && <div><span className="text-gray-400">Reviewed:</span> <span className="font-bold">{new Date(booking.reviewedAt).toLocaleString('en-IN')}</span></div>}
                {booking.confirmedAt && <div><span className="text-gray-400">Confirmed:</span> <span className="font-bold">{new Date(booking.confirmedAt).toLocaleString('en-IN')}</span></div>}
                {booking.completedAt && <div><span className="text-gray-400">Completed:</span> <span className="font-bold">{new Date(booking.completedAt).toLocaleString('en-IN')}</span></div>}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-100 flex gap-2 bg-gray-50/50">
            {booking.quotedPrice != null && booking.status !== 'requested' && (
              <>
                <button
                  onClick={triggerDownloadQuotation}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-purple-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Quotation PDF
                </button>
                <button
                  onClick={triggerPrintQuotation}
                  className="py-2.5 px-3.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors"
                  title="Print Quotation"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Quote
                </button>
                {booking.status === 'completed' && isFunction && (
                  <>
                    <button
                      onClick={triggerDownloadInvoice}
                      className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Invoice PDF
                    </button>
                    <button
                      onClick={triggerPrintInvoice}
                      className="py-2.5 px-3.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors"
                      title="Print Invoice"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Invoice
                    </button>
                  </>
                )}
              </>
            )}
            <button onClick={onClose} className="py-2.5 px-5 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-300 transition-colors">
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Cancel Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setShowCancelModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 font-sans"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Ban className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Cancel Booking</h3>
                  <p className="text-xs text-gray-500">#{booking.id.slice(-6)} · {booking.userName}</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Reason for Cancellation *</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer requested cancellation, out of stock, delivery unavailable..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl font-medium text-sm outline-none focus:border-red-500 resize-none bg-gray-50"
                  autoFocus
                />
                {cancelReason.trim().length === 0 && (
                  <p className="text-[10px] text-red-500 font-bold mt-1">Reason is required</p>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-800 font-bold leading-relaxed">This action cannot be undone. The user will be notified instantly via the app.</p>
              </div>

              <div className="flex gap-3 text-sm">
                <button
                  onClick={handleCancel}
                  disabled={saving || !cancelReason.trim()}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-colors"
                >
                  <Ban className="w-4 h-4" /> {saving ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
                <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} className="py-3 px-5 bg-gray-100 text-gray-600 rounded-xl font-bold">
                  Back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}



export default function AdminOrdersTab({ orders, deliveryPartners, assignDeliveryPartner, updateOrderStatus, loadMoreOrders, hasMoreOrders, loadingMoreOrders }: AdminOrdersTabProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [bookings, setBookings] = React.useState<BulkBooking[]>([]);
  const [activeBookingDetails, setActiveBookingDetails] = useState<BulkBooking | null>(null);

  const currentOpenBooking = useMemo(() => {
    if (!activeBookingDetails) return null;
    return bookings.find(b => b.id === activeBookingDetails.id) || activeBookingDetails;
  }, [bookings, activeBookingDetails]);

  // Real-time listener for the separated Custom Meat Bookings layout
  React.useEffect(() => {
    const q = query(collection(db, 'bulkBookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BulkBooking));
    });
    return () => unsub();
  }, []);

  const updateBookingStatus = async (booking: BulkBooking, newStatus: any) => {
    const now = new Date().toISOString();
    const historyEntry = {
      status: newStatus,
      changedBy: 'admin',
      timestamp: now,
      notes: `Status updated via Orders Tab to ${newStatus}`
    };
    const newHistory = [...(booking.statusHistory || []), historyEntry];

    const updateFields: any = {
      status: newStatus,
      updatedAt: now,
      statusHistory: newHistory
    };

    if (newStatus === 'completed') {
      updateFields.completedAt = now;
    } else if (newStatus === 'confirmed') {
      updateFields.confirmedAt = now;
      updateFields.paymentStatus = 'paid';
      updateFields.advancePaid = true;
    } else if (newStatus === 'reviewed') {
      updateFields.reviewedAt = now;
    } else if (newStatus === 'cancelled') {
      updateFields.cancelledAt = now;
      updateFields.cancelledBy = 'admin';
    }

    await updateDoc(doc(db, 'bulkBookings', booking.id), updateFields);
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
                  {(() => {
                    const style = STATUS_STYLES[booking.status] || { label: booking.status, bg: 'bg-blue-100', text: 'text-blue-700' };
                    return (
                      <span className={`text-[10px] font-black ${style.bg} ${style.text} px-2 py-0.5 rounded uppercase`}>
                        {style.label}
                      </span>
                    );
                  })()}
                </div>
                <h4 className="font-bold text-gray-900 mb-0.5">{booking.userName} • {booking.userPhone}</h4>
                <div className="text-xs text-gray-500 space-y-1 mt-2 mb-3 bg-blue-50/50 p-2 rounded-xl border border-blue-50">
                  <p><span className="font-bold text-gray-700">Req Date:</span> {booking.requiredDate}</p>
                  <p><span className="font-bold text-gray-700">Weight:</span> {booking.quantityRequirement}</p>
                  <p className="line-clamp-2"><span className="font-bold text-gray-700">Meat:</span> {booking.meatDetails}</p>
                  {booking.notes && <p className="line-clamp-1 italic">"{booking.notes}"</p>}
                </div>
                <select 
                  className="w-full text-xs p-2 font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={booking.status}
                  onChange={(e) => updateBookingStatus(booking, e.target.value)}
                  disabled={booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'rejected'}
                >
                  <option value="requested">Requested</option>
                  <option value="reviewed">Reviewed (Awaiting Final Price)</option>
                  <option value="awaiting_payment">Awaiting Adv Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="delivered">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={() => setActiveBookingDetails(booking)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 bg-gradient-to-r from-blue-700 to-blue-800 text-white py-2 px-3 rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md active:scale-[0.97] transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Details & Quote
                </button>
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
                  {(() => {
                    const style = STATUS_STYLES[booking.status] || { label: booking.status, bg: 'bg-amber-100', text: 'text-amber-700' };
                    return (
                      <span className={`text-[10px] font-black ${style.bg} ${style.text} px-2 py-0.5 rounded uppercase`}>
                        {style.label}
                      </span>
                    );
                  })()}
                </div>
                <h4 className="font-bold text-gray-900 mb-0.5">{booking.userName} • {booking.userPhone}</h4>
                <div className="text-xs text-gray-500 space-y-1 mt-2 mb-3 bg-amber-50/30 p-2 rounded-xl border border-amber-50">
                  <p><span className="font-bold text-gray-700">Date:</span> {booking.requiredDate} • <span className="font-bold text-gray-700">Guests:</span> {booking.peopleCount}</p>
                  <p className="truncate"><span className="font-bold text-gray-700">Loc:</span> {booking.location}</p>
                  <p className="line-clamp-2"><span className="font-bold text-gray-700">Meat:</span> {booking.meatDetails}</p>
                  {booking.notes && <p className="line-clamp-1 italic">"{booking.notes}"</p>}
                </div>
                <select 
                  className="w-full text-xs p-2 font-bold border rounded-xl bg-gray-50 text-gray-700 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={booking.status}
                  onChange={(e) => updateBookingStatus(booking, e.target.value)}
                  disabled={booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'rejected'}
                >
                  <option value="requested">Requested</option>
                  <option value="reviewed">Reviewed (Awaiting Final Price)</option>
                  <option value="awaiting_payment">Awaiting Adv Payment</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="delivered">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={() => setActiveBookingDetails(booking)}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-700 to-amber-800 text-white py-2 px-3 rounded-xl font-bold text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md active:scale-[0.97] transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Details & Quote
                </button>
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

      {/* ═══ Booking Details Modal (lazy-rendered) ═══ */}
      <AnimatePresence>
        {currentOpenBooking && (
          <BookingDetailsModal booking={currentOpenBooking} onClose={() => setActiveBookingDetails(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
