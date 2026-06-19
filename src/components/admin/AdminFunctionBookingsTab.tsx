import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { BulkBooking, BulkBookingStatus, BulkBookingItem, BulkBookingStatusHistory, Product } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { 
  downloadFunctionQuotation, 
  printFunctionQuotation,
  downloadFunctionInvoice,
  printFunctionInvoice
} from '../../lib/functionInvoiceGenerator';
import {
  Package, Clock, CheckCircle2, XCircle, CreditCard, ChevronDown,
  ChevronUp, IndianRupee, Calendar, Phone, User, AlertCircle, Check, X,
  MapPin, Truck, Ban, MessageSquare, Send, Eye, FileText, Printer, Download,
  Plus, Trash2, Search, History, Mail, Building2, ShoppingCart, Percent, Users
} from 'lucide-react';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  requested:        { label: 'Event Requested',    cls: 'bg-blue-100 text-blue-700' },
  reviewed:         { label: 'Reviewed',           cls: 'bg-purple-100 text-purple-700' },
  awaiting_payment: { label: 'Quotation Sent',     cls: 'bg-amber-100 text-amber-700' },
  confirmed:        { label: 'Approved',           cls: 'bg-green-100 text-green-700' },
  delivered:        { label: 'Processing',         cls: 'bg-emerald-100 text-emerald-700' },
  completed:        { label: 'Completed',          cls: 'bg-gray-100 text-gray-600' },
  rejected:         { label: 'Rejected',           cls: 'bg-red-100 text-red-700' },
  cancelled:        { label: 'Cancelled',          cls: 'bg-red-100 text-red-700' },
};

export default function AdminFunctionBookingsTab() {
  const [bookings, setBookings] = useState<BulkBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | BulkBookingStatus>('all');

  // Real-time listener for function bookings
  useEffect(() => {
    const q = query(collection(db, 'bulkBookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }) as BulkBooking);
      setBookings(allBookings.filter(b => b.type === 'function'));
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
            {s === 'all' ? 'All Events' : (STATUS_STYLES[s]?.label || s)}
            {s !== 'all' && (
              <span className="ml-1 opacity-60">({bookings.filter(b => b.status === s).length})</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-400 text-sm">No event bookings found</p>
        </div>
      ) : (
        <AnimatePresence>
          {filtered.map(booking => (
            <div key={booking.id}>
              <FunctionBookingCard
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

// ─── Individual Booking Card ──────────────────────────────────────────────────
function FunctionBookingCard({ booking, isExpanded, onToggle }: { booking: BulkBooking; isExpanded: boolean; onToggle: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState(booking.quotedPrice || 0);
  const [adminNotes, setAdminNotes] = useState(booking.adminNotes || '');
  const [adminMessage, setAdminMessage] = useState(booking.adminMessage || 'We will connect with you shortly to discuss the event details. Please pay the advance amount to confirm your booking.');
  const [saving, setSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showQuotationEditor, setShowQuotationEditor] = useState(false);

  const advance = Math.ceil(quotedPrice / 2);
  const status = STATUS_STYLES[booking.status] || STATUS_STYLES.requested;

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
        statusHistory: buildStatusHistoryEntry('awaiting_payment', booking.statusHistory, 'Event quotation sent to customer'),
      });
      setEditMode(false);
    } catch (e) { console.error(e); alert('Failed to approve.'); }
    finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!window.confirm('Reject this booking?')) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'rejected' as BulkBookingStatus,
      adminNotes,
      updatedAt: now,
      statusHistory: buildStatusHistoryEntry('rejected', booking.statusHistory, adminNotes || 'Booking rejected by admin'),
    });
  };

  const handleVerifyPayment = async () => {
    if (!window.confirm('Confirm payment received? This will approve the event booking.')) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'confirmed' as BulkBookingStatus,
      paymentStatus: 'paid',
      advancePaid: true,
      confirmedAt: now,
      updatedAt: now,
      statusHistory: buildStatusHistoryEntry('confirmed', booking.statusHistory, 'Advance payment verified, event booking approved'),
    });
  };

  const handleMarkProcessing = async () => {
    if (!window.confirm('Mark this event as Processing?')) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'delivered' as BulkBookingStatus,
      updatedAt: now,
      statusHistory: buildStatusHistoryEntry('delivered', booking.statusHistory, 'Order is in preparation'),
    });
  };

  const handleComplete = async () => {
    if (!window.confirm('Mark this event booking as Completed?')) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'bulkBookings', booking.id), {
      status: 'completed' as BulkBookingStatus,
      completedAt: now,
      updatedAt: now,
      statusHistory: buildStatusHistoryEntry('completed', booking.statusHistory, 'Event catering completed successfully'),
    });
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
        status: 'cancelled' as BulkBookingStatus,
        cancelReason: cancelReason.trim(),
        cancelledBy: 'admin',
        cancelledAt: now,
        updatedAt: now,
        statusHistory: buildStatusHistoryEntry('cancelled', booking.statusHistory, cancelReason.trim()),
      });
      setShowCancelModal(false);
      setCancelReason('');
    } catch (e) { console.error(e); alert('Failed to cancel.'); }
    finally { setSaving(false); }
  };

  const isCancelled = booking.status === 'cancelled';
  const isTerminal = isCancelled || booking.status === 'completed' || booking.status === 'rejected';

  // Guest count breakdown
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

  const deliveryDest = eventFullAddress || booking.location;

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
            <span className="flex items-center gap-1 font-bold text-[#8B0000]">
              <Calendar className="w-3 h-3 text-[#8B0000]" /> 
              {booking.functionType || 'FUNCTION'}
            </span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{adults + children} Guests</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(booking.eventDate || booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-4">
              {/* Event specifications */}
              <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-100/50 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Event Details</span>
                  <span className="text-xs font-black text-gray-900 bg-white px-2 py-0.5 rounded border">{booking.functionType || 'Catering'}</span>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Detailed specs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Guests</h4>
                      <p className="text-sm font-bold text-gray-800">
                        {adults} Adults, {children} Children
                      </p>
                    </div>
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Diet preferences</h4>
                      <p className="text-sm font-bold text-gray-800">
                        {veg} Veg, {nonveg} Non-Veg
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Meat / Food Requirements</h4>
                    <p className="text-sm font-medium text-gray-900 leading-relaxed">{booking.meatDetails || booking.quantityRequirement || <i>Details below</i>}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1">Event Date & Time</h4>
                      <p className="text-sm font-bold text-gray-700">
                        {new Date(booking.eventDate || booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {booking.eventTime ? ` @ ${booking.eventTime}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Quotation</p>
                      <p className="text-lg font-black text-[#8B0000]">₹{(booking.grandTotal || booking.quotedPrice || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  {booking.deliveryDate && (
                    <div className="pt-2 text-xs text-gray-500 font-medium">
                      <span className="font-bold">Required Delivery Date:</span> {new Date(booking.deliveryDate).toLocaleDateString('en-IN')}
                    </div>
                  )}
                  
                  {booking.advanceAmount! > 0 && (
                    <div className="flex justify-between items-center text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <span className="font-bold text-gray-500">Advance (50%)</span>
                      <span className={cn("font-black px-2 py-1 rounded-lg", booking.advancePaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                        {booking.advancePaid ? 'Paid' : 'Pending'} ₹{booking.advanceAmount!.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Quotation Items Summary */}
                  {booking.items && booking.items.length > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-2 flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" /> Event Menu / Items ({booking.items.length})
                      </h4>
                      <div className="space-y-1.5">
                        {booking.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs bg-white p-2 rounded-lg border border-gray-100">
                            <span className="font-medium text-gray-800 truncate flex-1">{item.productName}</span>
                            <span className="text-gray-500 mx-2">{item.quantity} {item.unitType}</span>
                            <span className="font-bold text-gray-900">₹{(item.lineTotal ?? item.subtotal).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 bg-gray-100/50 rounded-lg p-2 space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold">₹{(booking.subtotal || 0).toLocaleString()}</span></div>
                        {(booking.deliveryCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Delivery / Catering setup</span><span className="font-bold">₹{booking.deliveryCharges!.toLocaleString()}</span></div>}
                        {(booking.additionalCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Additional Charges</span><span className="font-bold">₹{booking.additionalCharges!.toLocaleString()}</span></div>}
                        {(booking.globalDiscount || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="font-bold text-green-600">-₹{booking.globalDiscount!.toLocaleString()}</span></div>}
                        <div className="flex justify-between border-t border-gray-200 pt-1"><span className="font-black text-gray-700">Grand Total</span><span className="font-black text-[#8B0000]">₹{(booking.grandTotal || booking.quotedPrice || 0).toLocaleString()}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Delivery Location */}
                  {deliveryDest && (
                    <div className="pt-3 border-t border-gray-100">
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-gray-400 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Event/Delivery Address</h4>
                      <p className="text-sm font-medium text-gray-800">{deliveryDest}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Special Instructions */}
              {booking.specialInstructions && (
                <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-900 border border-amber-100">
                  <span className="font-bold flex items-center gap-1 mb-0.5 text-amber-800"><AlertCircle className="w-3.5 h-3.5" /> Special Instructions:</span>
                  {booking.specialInstructions}
                </div>
              )}

              {/* Notes */}
              {booking.notes && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800">
                  <span className="font-bold">Customer Notes:</span> {booking.notes}
                </div>
              )}

              {/* Action Bar */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowDetailsModal(true)}
                  className="flex-1 min-w-[120px] py-2.5 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-indigo-100"
                >
                  <Eye className="w-3.5 h-3.5" /> View Event Details
                </button>

                {booking.quotedPrice != null && booking.status !== 'requested' && (
                  <>
                    <button
                      onClick={() => downloadFunctionQuotation(booking)}
                      className="py-2.5 px-3 bg-purple-50 text-purple-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-purple-100"
                    >
                      <Download className="w-3.5 h-3.5" /> Quotation PDF
                    </button>
                    <button
                      onClick={() => printFunctionQuotation(booking)}
                      className="py-2.5 px-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-gray-200"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Quote
                    </button>
                  </>
                )}

                {booking.status === 'completed' && (
                  <>
                    <button
                      onClick={() => downloadFunctionInvoice(booking)}
                      className="py-2.5 px-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-100"
                    >
                      <Download className="w-3.5 h-3.5" /> Invoice PDF
                    </button>
                    <button
                      onClick={() => printFunctionInvoice(booking)}
                      className="py-2.5 px-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-gray-200"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Invoice
                    </button>
                  </>
                )}
              </div>

              {/* Admin Actions */}
              {(booking.status === 'requested' || booking.status === 'reviewed') && (
                <div className="space-y-3">
                  {!editMode && !showQuotationEditor ? (
                    <div className="flex gap-2">
                      <button onClick={() => setShowQuotationEditor(true)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                        <FileText className="w-4 h-4" /> Create Event Quotation
                      </button>
                      <button onClick={() => setEditMode(true)} className="py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                        <IndianRupee className="w-4 h-4" /> Quick Price
                      </button>
                      <button onClick={handleReject} className="py-3 px-4 bg-red-50 text-red-600 rounded-xl font-bold text-sm active:scale-[0.98]">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : editMode ? (
                    <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                      <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest">Quick Price Editor</h4>
                      
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

                      <textarea placeholder="Admin notes (internal — not visible to customer)" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-xs outline-none resize-none" />

                      <div className="flex gap-2">
                        <button onClick={handleSendQuotation} disabled={saving} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
                          <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Send Quotation'}
                        </button>
                        <button onClick={() => setEditMode(false)} className="py-3 px-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">Cancel</button>
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

              {/* WhatsApp Contact */}
              {!isTerminal && (
                <a
                  href={`https://wa.me/${booking.userPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${booking.userName}, regarding your Kari King ${booking.functionType || 'Function'} booking #${booking.id.slice(-6)}:\n\nQuoted Price: ₹${(booking.grandTotal || booking.quotedPrice || quotedPrice).toLocaleString()}\nAdvance (50%): ₹${(booking.advanceAmount || advance).toLocaleString()}\n\n${adminMessage || 'We will connect with you shortly to discuss the event details.'}\n\nPay advance via UPI to confirm your order. Thank you!`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] shadow-md shadow-green-500/20"
                >
                  <MessageSquare className="w-4 h-4" /> Send WhatsApp Update
                </a>
              )}

              {/* Verify payment */}
              {booking.status === 'awaiting_payment' && (
                <div className="flex gap-2">
                  <button onClick={handleVerifyPayment} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <CheckCircle2 className="w-4 h-4" /> Verify Payment Received
                  </button>
                </div>
              )}

              {/* Processing + Complete actions */}
              {booking.status === 'confirmed' && (
                <div className="flex gap-2">
                  <button onClick={handleMarkProcessing} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Truck className="w-4 h-4" /> Mark Processing
                  </button>
                  <button onClick={handleComplete} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Check className="w-4 h-4" /> Complete Event
                  </button>
                </div>
              )}
              {booking.status === 'delivered' && (
                <button onClick={handleComplete} className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                  <Check className="w-4 h-4" /> Complete Event Catering
                </button>
              )}

              {/* Cancellation info */}
              {isCancelled && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-black text-red-700 uppercase tracking-widest">Event Cancelled</span>
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

              {/* Universal Cancel */}
              {!isTerminal && (
                <button onClick={() => setShowCancelModal(true)} className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] border border-red-100 mt-2">
                  <Ban className="w-3.5 h-3.5" /> Cancel Event Booking
                </button>
              )}

              {/* Prices summary */}
              {booking.quotedPrice != null && booking.status !== 'requested' && booking.status !== 'reviewed' && (
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Event Grand Total</span><span className="font-black">₹{(booking.grandTotal || booking.quotedPrice).toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs text-[#8B0000]"><span className="font-bold">Advance (50%)</span><span className="font-black">₹{(booking.advanceAmount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Advance Paid</span><span className="font-bold capitalize">{booking.advancePaid ? 'Yes' : 'No'}</span></div>
                </div>
              )}

              {/* Timeline */}
              {booking.statusHistory && booking.statusHistory.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                    <History className="w-3 h-3" /> Event Status History
                  </h4>
                  <div className="space-y-2">
                    {booking.statusHistory.map((entry, idx) => {
                      const stStyle = STATUS_STYLES[entry.status] || { label: entry.status, cls: 'bg-gray-100 text-gray-600' };
                      return (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#8B0000] mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded", stStyle.cls)}>{stStyle.label}</span>
                              <span className="text-[9px] text-gray-400">{new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {entry.notes && <p className="text-[10px] text-gray-500 mt-0.5">{entry.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Details Modal */}
    <AnimatePresence>
      {showDetailsModal && (
        <FunctionDetailsModal booking={booking} onClose={() => setShowDetailsModal(false)} />
      )}
    </AnimatePresence>

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
                <h3 className="text-lg font-black text-gray-900">Cancel Event Booking</h3>
                <p className="text-xs text-gray-500">#{booking.id.slice(-6)} · {booking.userName}</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">Reason for Cancellation *</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Provide event cancellation details..."
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
              <p className="text-[10px] text-amber-800 font-bold leading-relaxed">This will notify the customer. The action is irreversible.</p>
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

// ─── Event Details Modal ──────────────────────────────────────────────────────
function FunctionDetailsModal({ booking, onClose }: { booking: BulkBooking; onClose: () => void }) {
  const [customerEmail, setCustomerEmail] = useState(booking.userEmail || '');
  const [customerCompany, setCustomerCompany] = useState(booking.companyName || '');
  const [loadingUser, setLoadingUser] = useState(!booking.userEmail);

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
      } catch (e) { console.error('Failed to fetch user details', e); }
      finally { setLoadingUser(false); }
    };
    fetchUser();
  }, [booking.userId, booking.userEmail, booking.companyName]);

  const status = STATUS_STYLES[booking.status] || STATUS_STYLES.requested;

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

  const deliveryDest = eventFullAddress || booking.location;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#8B0000] to-[#A50000] p-5 text-white relative font-sans">
          <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black">Event Booking Details</h3>
              <p className="text-white/70 text-xs">#{booking.id.slice(-6)} · {booking.functionType || 'CATERING'}</p>
            </div>
          </div>
          <span className={cn("absolute bottom-4 right-4 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full", status.cls)}>
            {status.label}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 font-sans">
          {/* Customer Details */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <User className="w-3 h-3" /> Customer Information
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
                <p className="font-medium text-gray-700">
                  {loadingUser ? 'Loading...' : (customerEmail || 'Not provided')}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 font-bold uppercase">Company</p>
                <p className="font-medium text-gray-700">
                  {loadingUser ? 'Loading...' : (customerCompany || 'Not provided')}
                </p>
              </div>
            </div>
          </div>

          {/* Event Specs */}
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
              <p className="text-sm font-medium text-gray-800 mt-0.5">{booking.meatDetails || 'Not specified'}</p>
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

          {/* Quotation items */}
          {booking.items && booking.items.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                <ShoppingCart className="w-3 h-3" /> Itemized Menu
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
                {(booking.deliveryCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Delivery / Catering setup</span><span className="font-bold">₹{booking.deliveryCharges!.toLocaleString()}</span></div>}
                {(booking.additionalCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Additional Charges</span><span className="font-bold">₹{booking.additionalCharges!.toLocaleString()}</span></div>}
                {(booking.globalDiscount || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="font-bold text-green-600">-₹{booking.globalDiscount!.toLocaleString()}</span></div>}
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="font-black text-gray-700">Grand Total</span>
                  <span className="font-black text-[#8B0000] text-base">₹{(booking.grandTotal || booking.quotedPrice || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Timestamps</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400">Created:</span> <span className="font-bold">{new Date(booking.createdAt).toLocaleString('en-IN')}</span></div>
              <div><span className="text-gray-400">Updated:</span> <span className="font-bold">{new Date(booking.updatedAt).toLocaleString('en-IN')}</span></div>
              {booking.reviewedAt && <div><span className="text-gray-400">Reviewed:</span> <span className="font-bold">{new Date(booking.reviewedAt).toLocaleString('en-IN')}</span></div>}
              {booking.confirmedAt && <div><span className="text-gray-400">Confirmed:</span> <span className="font-bold">{new Date(booking.confirmedAt).toLocaleString('en-IN')}</span></div>}
              {booking.completedAt && <div><span className="text-gray-400">Completed:</span> <span className="font-bold">{new Date(booking.completedAt).toLocaleString('en-IN')}</span></div>}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2 bg-gray-50/50">
          {booking.quotedPrice != null && booking.status !== 'requested' && (
            <>
              <button
                onClick={() => downloadFunctionQuotation(booking)}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Quotation PDF
              </button>
              {booking.status === 'completed' && (
                <button
                  onClick={() => downloadFunctionInvoice(booking)}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Invoice PDF
                </button>
              )}
            </>
          )}
          <button onClick={onClose} className="py-2.5 px-5 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs">
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Quotation Editor Prop definitions
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

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Product));
      } catch (e) { console.error('Failed to load products', e); }
      finally { setLoadingProducts(false); }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (booking.items && booking.items.length > 0) {
      setLineItems(booking.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
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
        statusHistory: buildStatusHistoryEntry('awaiting_payment', booking.statusHistory, `Detailed event quotation with ${builtItems.length} item(s) sent to customer`),
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
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-4 border border-blue-200 shadow-lg text-left">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4" /> Quotation Builder
        </h4>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/50">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="space-y-2">
        {lineItems.map((item, idx) => (
          <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
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

      {!showProductPicker ? (
        <button
          onClick={() => setShowProductPicker(true)}
          className="w-full py-3 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Menu Item / Product
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
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50 text-left transition-colors"
                >
                  {product.image && <img src={product.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{product.name}</p>
                    <p className="text-[10px] text-gray-500">{product.mainCategory} · ₹{product.sellingPrice}/{product.unitType || 'kg'}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100 text-center">
            <button onClick={() => { setShowProductPicker(false); setSearchQuery(''); }} className="w-full py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {lineItems.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2">
          <h5 className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Catering setup / Delivery charges</h5>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] font-bold text-gray-400 uppercase">Setup / Del (₹)</label>
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

      {lineItems.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-gray-200 space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-gray-500">Subtotal</span><span className="font-bold">₹{subtotal.toLocaleString()}</span></div>
          {deliveryCharges > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">+ Setup / Catering</span><span className="font-bold">₹{deliveryCharges.toLocaleString()}</span></div>}
          {additionalCharges > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">+ Additional</span><span className="font-bold">₹{additionalCharges.toLocaleString()}</span></div>}
          {globalDiscount > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">- Discount</span><span className="font-bold text-green-600">-₹{globalDiscount.toLocaleString()}</span></div>}
          <div className="flex justify-between border-t border-gray-200 pt-1.5">
            <span className="text-sm font-black text-gray-700">Grand Total</span>
            <span className="text-sm font-black text-[#8B0000]">₹{Math.max(grandTotal, 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Advance (50%)</span>
            <span className="font-bold text-blue-700">₹{Math.ceil(Math.max(grandTotal, 0) / 2).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div>
        <label className="text-[10px] font-bold text-green-700 uppercase mb-1 block flex items-center gap-1"><Send className="w-3 h-3" /> Message to Customer</label>
        <textarea placeholder="e.g. Quotation details attached..." value={adminMessage} onChange={e => onAdminMessageChange(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-green-200 rounded-xl font-medium text-xs outline-none resize-none focus:border-green-500" />
      </div>

      <textarea placeholder="Admin internal notes..." value={adminNotes} onChange={e => onAdminNotesChange(e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl font-medium text-xs outline-none resize-none" />

      <div className="flex gap-2">
        <button
          onClick={handleSubmitQuotation}
          disabled={saving || lineItems.length === 0}
          className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-green-600/20"
        >
          <Send className="w-4 h-4" /> {saving ? 'Sending...' : 'Send Quotation to Customer'}
        </button>
        <button onClick={onClose} className="py-3 px-4 bg-gray-200 text-gray-600 rounded-xl font-bold text-sm">Cancel</button>
      </div>
    </div>
  );
}
