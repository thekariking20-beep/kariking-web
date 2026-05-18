import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { BulkBooking, BulkBookingStatus } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import {
  Package, Clock, CheckCircle2, XCircle, CreditCard, ChevronDown,
  ChevronUp, IndianRupee, Calendar, Phone, User, AlertCircle, Check, X,
  MapPin, Truck, Ban, MessageSquare, Send
} from 'lucide-react';

// ─── Status Badge ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  requested:        { label: 'Requested',          cls: 'bg-blue-100 text-blue-700' },
  reviewed:         { label: 'Reviewed',           cls: 'bg-purple-100 text-purple-700' },
  awaiting_payment: { label: 'Awaiting Payment',   cls: 'bg-amber-100 text-amber-700' },
  confirmed:        { label: 'Confirmed',          cls: 'bg-green-100 text-green-700' },
  delivered:        { label: 'Delivered',           cls: 'bg-emerald-100 text-emerald-700' },
  completed:        { label: 'Completed',          cls: 'bg-gray-100 text-gray-600' },
  rejected:         { label: 'Rejected',           cls: 'bg-red-100 text-red-700' },
  cancelled:        { label: 'Cancelled',          cls: 'bg-red-100 text-red-700' },
};

export default function AdminBookingsTab() {
  const [bookings, setBookings] = useState<BulkBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | BulkBookingStatus>('all');

  // ─── Real-time listener ─────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'bulkBookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as BulkBooking));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="bg-gray-100 animate-pulse h-32 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
        {(['all', 'requested', 'awaiting_payment', 'confirmed', 'delivered', 'completed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold border transition-all",
              filter === s ? "bg-[#8B0000] text-white border-[#8B0000]" : "bg-white text-gray-600 border-gray-200"
            )}
          >
            {s === 'all' ? 'All' : (STATUS_STYLES[s]?.label || s)}
            {s !== 'all' && (
              <span className="ml-1 opacity-60">({bookings.filter(b => b.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-sm">No bookings found</p>
        </div>
      ) : (
        <AnimatePresence>
          {filtered.map(booking => (
            <div key={booking.id}>
              <BookingCard
                booking={booking}
                isExpanded={expandedId === booking.id}
                onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── Individual Booking Card ──────────────────────────────────────────────────
function BookingCard({ booking, isExpanded, onToggle }: { booking: BulkBooking; isExpanded: boolean; onToggle: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState(booking.quotedPrice || 0);
  const [adminNotes, setAdminNotes] = useState(booking.adminNotes || '');
  const [adminMessage, setAdminMessage] = useState(booking.adminMessage || 'We will connect with you shortly to discuss the details. Please pay the advance amount to confirm your order.');
  const [saving, setSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const advance = Math.ceil(quotedPrice / 2);
  const status = STATUS_STYLES[booking.status] || STATUS_STYLES.requested;

  const handleApprove = async () => {
    if (quotedPrice <= 0) {
      alert('Please enter a valid price greater than ₹0');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        quotedPrice: quotedPrice,
        advanceAmount: advance,
        balanceAmount: quotedPrice - advance,
        adminNotes,
        adminMessage: adminMessage.trim(),
        status: 'awaiting_payment',
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setEditMode(false);
    } catch (e) { console.error(e); alert('Failed to approve.'); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!window.confirm('Reject this booking?')) return;
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'rejected' as BulkBookingStatus,
      adminNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleVerifyPayment = async () => {
    if (!window.confirm('Confirm payment received? This will confirm the order.')) return;
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'confirmed' as BulkBookingStatus,
      paymentStatus: 'paid',
      advancePaid: true,
      confirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleMarkDelivered = async () => {
    if (!window.confirm('Mark this order as delivered?')) return;
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'delivered' as BulkBookingStatus,
      deliveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleComplete = async () => {
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'completed' as BulkBookingStatus,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      alert('Please provide a cancellation reason.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'bulkBookings', booking.id), {
        status: 'cancelled' as BulkBookingStatus,
        cancelReason: cancelReason.trim(),
        cancelledBy: 'admin',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setShowCancelModal(false);
      setCancelReason('');
    } catch (e) { console.error(e); alert('Failed to cancel.'); }
    finally { setSaving(false); }
  };

  const isCancelled = booking.status === 'cancelled';
  const isTerminal = isCancelled || booking.status === 'completed' || booking.status === 'rejected';

  return (
    <>
    <motion.div layout className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Collapsed header */}
      <button onClick={onToggle} className="w-full p-4 flex items-center justify-between text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full", status.cls)}>
              {status.label}
            </span>
            <span className="text-[10px] text-gray-400 font-bold">#{booking.id.slice(-6)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{booking.userName}</span>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{booking.userPhone}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span className="flex items-center gap-1 font-bold">
              <Package className="w-3 h-3 text-[#8B0000]" /> 
              {booking.type?.toUpperCase()} REQUIREMENT
            </span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-4">
              {/* Meat Specifications Array */}
              <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-100/50">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Target Requirements</span>
                </div>
                
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Meat Specialization</h4>
                    <p className="text-sm font-medium text-gray-900 leading-relaxed">{booking.meatDetails || <i>Legacy Order - Items map attached</i>}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Quantity Request</h4>
                      <p className="text-lg font-black text-[#8B0000]">{booking.quantityRequirement || '-'}</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Total Scaling Base</h4>
                      <p className="text-sm font-bold text-gray-700">{booking.peopleCount} People</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Requested Delivery</h4>
                      <p className="text-sm font-bold text-gray-700">{booking.deliveryTime || ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Quoted Total</p>
                      <p className="text-lg font-black text-gray-900">₹{(booking.quotedPrice || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {booking.advanceAmount > 0 && (
                    <div className="flex justify-between items-center text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <span className="font-bold text-gray-500">Advance (50%)</span>
                      <span className={cn("font-black px-2 py-1 rounded-lg", booking.advancePaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                        {booking.advancePaid ? 'Paid' : 'Pending'} ₹{booking.advanceAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {/* Location */}
                  {booking.location && (
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Delivery Location</h4>
                      <p className="text-sm font-medium text-gray-800">{booking.location}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {booking.notes && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800">
                  <span className="font-bold">Customer Note:</span> {booking.notes}
                </div>
              )}

              {/* ─── Admin Actions ─────────────────────────────────── */}
              {(booking.status === 'requested' || booking.status === 'reviewed') && (
                <div className="space-y-3">
                  {!editMode ? (
                    <div className="flex gap-2">
                      <button onClick={() => setEditMode(true)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                        <IndianRupee className="w-4 h-4" /> Set Price & Approve
                      </button>
                      <button onClick={handleReject} className="py-3 px-4 bg-red-50 text-red-600 rounded-xl font-bold text-sm active:scale-[0.98]">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                      <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest">Price Editor</h4>
                      
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
                        <p className="text-[9px] text-gray-400 font-bold mt-1">This message will be visible to the customer on their booking</p>
                      </div>

                      <textarea placeholder="Admin notes (internal — not visible to customer)" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-xs outline-none resize-none" />

                      <div className="flex gap-2">
                        <button onClick={handleApprove} disabled={saving} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
                          <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Approve & Send Price'}
                        </button>
                        <button onClick={() => setEditMode(false)} className="py-3 px-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* WhatsApp Contact Button — available for all active bookings */}
              {!isTerminal && (
                <a
                  href={`https://wa.me/${booking.userPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${booking.userName}, regarding your Kari King ${booking.type} booking #${booking.id.slice(-6)}:\n\nQuoted Price: ₹${(booking.quotedPrice || quotedPrice).toLocaleString()}\nAdvance (50%): ₹${(booking.advanceAmount || advance).toLocaleString()}\n\n${adminMessage || 'We will connect with you shortly to discuss the details.'}\n\nPay advance via UPI to confirm your order. Thank you!`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] shadow-md shadow-green-500/20"
                >
                  <MessageSquare className="w-4 h-4" /> Send WhatsApp Message
                </a>
              )}

              {/* Verify payment action */}
              {booking.status === 'awaiting_payment' && (
                <div className="flex gap-2">
                  <button onClick={handleVerifyPayment} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <CheckCircle2 className="w-4 h-4" /> Verify Payment Received
                  </button>
                </div>
              )}

              {/* Delivery + Complete actions */}
              {booking.status === 'confirmed' && (
                <div className="flex gap-2">
                  <button onClick={handleMarkDelivered} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Truck className="w-4 h-4" /> Mark Delivered
                  </button>
                  <button onClick={handleComplete} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Check className="w-4 h-4" /> Complete
                  </button>
                </div>
              )}
              {booking.status === 'delivered' && (
                <button onClick={handleComplete} className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                  <Check className="w-4 h-4" /> Mark as Completed
                </button>
              )}

              {/* Cancellation reason display */}
              {isCancelled && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-2">
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

              {/* Universal Cancel button — available on all active (non-terminal) statuses */}
              {!isTerminal && (
                <button onClick={() => setShowCancelModal(true)} className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] border border-red-100 mt-2">
                  <Ban className="w-3.5 h-3.5" /> Cancel Booking
                </button>
              )}

              {/* Show approved price for non-editable statuses */}
              {booking.quotedPrice != null && booking.status !== 'requested' && booking.status !== 'reviewed' && (
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Quoted Price</span><span className="font-black">₹{booking.quotedPrice.toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs text-[#8B0000]"><span className="font-bold">Advance (50%)</span><span className="font-black">₹{(booking.advanceAmount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Advance Paid</span><span className="font-bold capitalize">{booking.advancePaid ? 'Yes' : 'No'}</span></div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Cancel Modal */}
    <AnimatePresence>
      {showCancelModal && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowCancelModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
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

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={saving || !cancelReason.trim()}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                <Ban className="w-4 h-4" /> {saving ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} className="py-3 px-5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">
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
