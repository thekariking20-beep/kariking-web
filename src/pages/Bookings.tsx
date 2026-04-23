import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Calendar, MapPin, Users, AlertCircle, Check, X, ClipboardList, Clock, ChevronRight, CheckCircle2, XCircle, CreditCard, Scale, Navigation, IndianRupee, Ban, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { BulkBooking } from '../types';
import { cn } from '../lib/utils';
import { useAddress } from '../context/AddressContext';
import {
  validateBookingForm, sanitizeBookingForm,
  validatePeopleCount, validateMeatDetails, validateQuantity,
  validateDeliveryDate, validateDeliveryTime, validateAddress,
  type FormErrors
} from '../lib/validation';

// ─── Status Config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  requested:        { label: 'Requested',        color: 'bg-blue-100 text-blue-700',   icon: Clock },
  reviewed:         { label: 'Reviewed',         color: 'bg-purple-100 text-purple-700', icon: CheckCircle2 },
  awaiting_payment: { label: 'Pay Advance',      color: 'bg-amber-100 text-amber-700', icon: CreditCard },
  confirmed:        { label: 'Confirmed',        color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  delivered:        { label: 'Delivered',         color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  completed:        { label: 'Completed',        color: 'bg-gray-100 text-gray-600',   icon: Check },
  rejected:         { label: 'Rejected',         color: 'bg-red-100 text-red-700',     icon: XCircle },
  cancelled:        { label: 'Cancelled',        color: 'bg-red-100 text-red-700',     icon: Ban },
};

export default function Bookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedAddress } = useAddress();
  
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // ─── New Custom Meat Form ────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    type: 'bulk' as 'bulk' | 'function',
    peopleCount: 50,
    meatDetails: '',
    quantityRequirement: '',
    requiredDate: '',
    deliveryTime: '',
    location: selectedAddress?.fullAddress || user?.address || '',
    notes: ''
  });

  // Sync address if it changes externally
  useEffect(() => {
    if (selectedAddress) {
      setFormData(prev => ({ ...prev, location: selectedAddress.fullAddress }));
    }
  }, [selectedAddress]);

  // ─── Booking history ───────────────────────────────────────────────────
  const [myBookings, setMyBookings] = useState<BulkBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Query without orderBy to avoid composite index requirement
    const q = query(
      collection(db, 'bulkBookings'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, snap => {
      const boks = snap.docs.map(d => ({ id: d.id, ...d.data() }) as BulkBooking);
      // Client-side chronological sort
      boks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setMyBookings(boks);
      setBookingsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ─── Submit Handler ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    // Run full validation
    const { valid, errors } = validateBookingForm(formData);
    setFormErrors(errors);
    // Mark all fields as touched on submit attempt
    setTouched({ peopleCount: true, meatDetails: true, quantityRequirement: true, requiredDate: true, deliveryTime: true, location: true });
    if (!valid) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const sanitized = sanitizeBookingForm(formData);
      const booking: Omit<BulkBooking, 'id'> = {
        userId: user.uid,
        userName: user.name || 'Customer',
        userPhone: user.phone,
        type: sanitized.type,
        peopleCount: sanitized.peopleCount,
        meatDetails: sanitized.meatDetails,
        quantityRequirement: sanitized.quantityRequirement,
        requiredDate: sanitized.requiredDate,
        deliveryTime: sanitized.deliveryTime,
        location: sanitized.location,
        notes: sanitized.notes,
        status: 'requested',
        paymentStatus: 'none',
        advancePaid: false,
        createdAt: now,
        updatedAt: now,
      };
      
      await addDoc(collection(db, 'bulkBookings'), booking);
      setSuccess(true);
      setFormErrors({});
      setTouched({});
      
      // Reset form
      setFormData(prev => ({ ...prev, meatDetails: '', quantityRequirement: '', notes: '' }));
    } catch (error: any) {
      console.error('Booking submission error:', error);
      alert(error?.message || 'Failed to submit booking.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Per-field blur validation ───────────────────────────────────────────
  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const newErrors = { ...formErrors };
    switch (field) {
      case 'peopleCount': {
        const r = validatePeopleCount(formData.peopleCount);
        if (!r.valid) newErrors.peopleCount = r.error; else delete newErrors.peopleCount;
        break;
      }
      case 'meatDetails': {
        const r = validateMeatDetails(formData.meatDetails);
        if (!r.valid) newErrors.meatDetails = r.error; else delete newErrors.meatDetails;
        break;
      }
      case 'quantityRequirement': {
        const r = validateQuantity(formData.quantityRequirement);
        if (!r.valid) newErrors.quantityRequirement = r.error; else delete newErrors.quantityRequirement;
        break;
      }
      case 'requiredDate': {
        const r = validateDeliveryDate(formData.requiredDate);
        if (!r.valid) newErrors.requiredDate = r.error; else delete newErrors.requiredDate;
        break;
      }
      case 'deliveryTime': {
        const r = validateDeliveryTime(formData.deliveryTime);
        if (!r.valid) newErrors.deliveryTime = r.error; else delete newErrors.deliveryTime;
        break;
      }
      case 'location': {
        const r = validateAddress(formData.location);
        if (!r.valid) newErrors.location = r.error; else delete newErrors.location;
        break;
      }
    }
    setFormErrors(newErrors);
  };

  const hasErrors = Object.keys(formErrors).length > 0;
  // ─── Payment Handler ────────────────────────────────────────────────────
  const [processingPaymentFor, setProcessingPaymentFor] = useState<string | null>(null);

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

  const handleAdvancePayment = async (booking: BulkBooking) => {
    if (!booking.advanceAmount || booking.advanceAmount <= 0) return;
    
    setProcessingPaymentFor(booking.id);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay failed to load.');

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: Math.round(booking.advanceAmount * 100), // convert to paise
        currency: 'INR',
        name: 'Kari King',
        description: `Advance Payment for Request #${booking.id.slice(-5).toUpperCase()}`,
        handler: async function (response: any) {
          // Success update DB
          await updateDoc(doc(db, 'bulkBookings', booking.id), {
            advancePaid: true,
            status: 'confirmed',
            paymentStatus: 'paid',
            paymentMethod: 'razorpay',
            advancePaidAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            razorpayPaymentId: response.razorpay_payment_id
          });
          setProcessingPaymentFor(null);
          alert("Advance payment successful! Order Confirmed.");
        },
        prefill: { contact: user?.phone || booking.userPhone },
        theme: { color: '#8B0000' },
        modal: {
          ondismiss: function () {
            setProcessingPaymentFor(null);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error("Payment failed", err);
      alert(err.message || 'Payment initiation failed.');
      setProcessingPaymentFor(null);
    }
  };
  // ─── SUCCESS SCREEN ────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-600/20">
          <Check className="w-12 h-12" />
        </motion.div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Requirement Received!</h2>
        <p className="text-gray-500 max-w-sm mb-8">Our master butchers will review your meat cutting spec and assign a custom price quote shortly.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setSuccess(false); setActiveTab('history'); }} className="bg-[#8B0000] text-white font-bold px-6 py-3 rounded-xl shadow-lg">
            View Request Status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      
      {/* ─── HEADER ──────────────────────────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#8B0000] via-[#A50000] to-[#DC2626] rounded-3xl p-6 shadow-[0_8px_30px_rgba(139,0,0,0.3)] text-white relative overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-black drop-shadow-md mb-2">Custom Meat Orders</h1>
          <p className="text-white/80 text-sm font-medium leading-relaxed max-w-[280px]">
            Freshly cut meat prepared based on your exact requirement and delivered on time.
          </p>
        </div>
      </motion.div>

      {/* ─── TABS ─────────────────────────────────────────────────── */}
      <div className="flex bg-gray-100 rounded-2xl p-1.5 shadow-inner">
        <button onClick={() => setActiveTab('new')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all", activeTab === 'new' ? "bg-white text-[#8B0000] shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          New Order
        </button>
        <button onClick={() => setActiveTab('history')} className={cn("flex-1 py-3 rounded-xl font-bold text-sm transition-all relative", activeTab === 'history' ? "bg-white text-[#8B0000] shadow-sm" : "text-gray-500 hover:text-gray-700")}>
          My Bookings
          {myBookings.filter(b => b.status === 'awaiting_payment').length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-bounce">
              {myBookings.filter(b => b.status === 'awaiting_payment').length}
            </span>
          )}
        </button>
      </div>

      {/* ─── NEW BOOKING FORM ──────────────────────────────────────── */}
      {activeTab === 'new' && (
        <motion.form 
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-6 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#8B0000] to-red-500" />
          
          <div className="space-y-5 pt-2">
            
            {/* Type Radio */}
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Order Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, type: 'bulk'})}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2",
                    formData.type === 'bulk' ? "border-[#8B0000] bg-red-50 text-[#8B0000]" : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <Package className="w-6 h-6" />
                  <span className="font-bold text-sm">Bulk Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, type: 'function'})}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2",
                    formData.type === 'function' ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <Users className="w-6 h-6" />
                  <span className="font-bold text-sm">Function / Event</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* People Count */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-[#8B0000]"/> No. of People</label>
                <input required type="number" min="1" max="5000" placeholder="50" className={cn("w-full p-4 border rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-bold text-gray-800", touched.peopleCount && formErrors.peopleCount ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.peopleCount} onChange={e => setFormData({...formData, peopleCount: parseInt(e.target.value) || 0})} onBlur={() => handleBlur('peopleCount')} />
                {touched.peopleCount && formErrors.peopleCount ? (
                  <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.peopleCount}</p>
                ) : (
                  <p className="text-[9px] text-gray-400 font-bold mt-1">Range: 1–5000 people</p>
                )}
              </div>
              
              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-[#8B0000]"/> Target Quantity</label>
                <input required type="text" placeholder="e.g. 20 kg" className={cn("w-full p-4 border rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-bold text-gray-800", touched.quantityRequirement && formErrors.quantityRequirement ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.quantityRequirement} onChange={e => setFormData({...formData, quantityRequirement: e.target.value})} onBlur={() => handleBlur('quantityRequirement')} />
                {touched.quantityRequirement && formErrors.quantityRequirement && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.quantityRequirement}</p>
                )}
              </div>
            </div>

            {/* Meat Details */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-[#8B0000]"/> Required Meat Details</label>
              <textarea 
                required 
                rows={3} 
                placeholder="e.g. Country chicken (skin removed), mutton curry cut, boneless pieces..." 
                className={cn("w-full p-4 border rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium resize-none text-gray-800", touched.meatDetails && formErrors.meatDetails ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} 
                value={formData.meatDetails} 
                onChange={e => setFormData({...formData, meatDetails: e.target.value})} 
                onBlur={() => handleBlur('meatDetails')}
              />
              {touched.meatDetails && formErrors.meatDetails ? (
                <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.meatDetails}</p>
              ) : (
                <p className="text-[9px] text-gray-400 font-bold mt-1">Describe meat type, cut style, and preparation (raw meat only)</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#8B0000]"/> Delivery Date</label>
                <input required type="date" min={new Date().toISOString().split('T')[0]} className={cn("w-full p-4 border rounded-2xl bg-gray-50 outline-none font-bold text-gray-800", touched.requiredDate && formErrors.requiredDate ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.requiredDate} onChange={e => setFormData({...formData, requiredDate: e.target.value})} onBlur={() => handleBlur('requiredDate')} />
                {touched.requiredDate && formErrors.requiredDate && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.requiredDate}</p>
                )}
              </div>
              {/* Time */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#8B0000]"/> Delivery Time</label>
                <input required type="time" className={cn("w-full p-4 border rounded-2xl bg-gray-50 outline-none font-bold text-gray-800", touched.deliveryTime && formErrors.deliveryTime ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.deliveryTime} onChange={e => setFormData({...formData, deliveryTime: e.target.value})} onBlur={() => handleBlur('deliveryTime')} />
                {touched.deliveryTime && formErrors.deliveryTime && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.deliveryTime}</p>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#8B0000]"/> Delivery Location</label>
              <div className="relative">
                <input required type="text" placeholder="e.g. Anna Nagar, Chennai, Tamil Nadu" className={cn("w-full p-4 pr-12 border rounded-2xl bg-gray-50 outline-none font-bold text-gray-800", touched.location && formErrors.location ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} onBlur={() => handleBlur('location')} />
                <button type="button" onClick={() => navigate('/manage-addresses')} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-red-100 text-[#8B0000] rounded-xl font-bold shadow-sm active:scale-95">
                  <Navigation className="w-4 h-4" />
                </button>
              </div>
              {touched.location && formErrors.location ? (
                <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.location}</p>
              ) : (
                <p className="text-[9px] text-gray-400 font-bold mt-1">Include area, city (e.g. "Wisework, Bangalore, Karnataka")</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-gray-400"/> Special Notes (Optional)</label>
              <textarea rows={2} placeholder="Any specific cutting instructions?" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 outline-none font-medium resize-none text-gray-800" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>
            
          </div>
          
          <div className="pt-4 border-t border-gray-100">
            {hasErrors && Object.keys(touched).length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-[10px] font-bold text-red-700 tracking-wide">Please fix the highlighted fields before submitting</p>
              </div>
            )}
            <button type="submit" disabled={submitting || (hasErrors && Object.keys(touched).length > 0)} className="w-full relative py-4 rounded-xl font-black text-white text-lg shadow-lg bg-[#8B0000] shadow-[#8B0000]/30 disabled:opacity-50 active:scale-[0.98] overflow-hidden group">
              <span className="relative z-10 flex items-center justify-center gap-2">
                {submitting ? 'Submitting Request...' : 'Submit Request for Quote'}
                {!submitting && <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </span>
              <div className="absolute inset-0 bg-red-800 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <p className="text-center text-[10px] text-gray-400 font-bold tracking-wide uppercase mt-4 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Price requires manual confirmation
            </p>
          </div>
        </motion.form>
      )}

      {/* ─── MY BOOKINGS TAB ──────────────────────────────────────── */}
      {activeTab === 'history' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {bookingsLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="bg-gray-100 animate-pulse h-40 rounded-2xl" />)}
            </div>
          ) : myBookings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="font-bold text-gray-400">No meat requirements issued yet</p>
              <button onClick={() => setActiveTab('new')} className="mt-4 text-sm font-bold text-[#8B0000] hover:underline">Submit your first custom order →</button>
            </div>
          ) : (
            myBookings.map(booking => {
              const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.requested;
              const StatusIcon = statusCfg.icon;
              return (
                <motion.div key={booking.id} layout className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        {booking.type === 'bulk' ? <Package className="w-3 h-3 text-blue-500" /> : <Users className="w-3 h-3 text-amber-500" />}
                        {booking.type.toUpperCase()} SPEC #{booking.id.slice(-5)}
                      </p>
                      <p className="text-xs font-bold text-gray-700 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        Req: {new Date(booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {booking.deliveryTime}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm border border-black/5", statusCfg.color)}>
                      <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Meat Requirements</p>
                      <p className="text-sm font-medium text-gray-800 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                        {booking.meatDetails || 'Standard legacy request'}
                      </p>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex-1 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/50">
                        <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1"><Scale className="w-3 h-3"/> Target Qty</p>
                        <p className="text-sm font-black text-blue-900">{booking.quantityRequirement || '-'}</p>
                      </div>
                      <div className="flex-1 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/50">
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1"><Users className="w-3 h-3"/> Guests</p>
                        <p className="text-sm font-black text-amber-900">{booking.peopleCount} Pax</p>
                      </div>
                    </div>
                  </div>

                  {/* Price Tracker Segment */}
                  <div className="px-4 pb-4">
                    {booking.status === 'requested' || booking.status === 'reviewed' ? (
                      <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 text-center">
                        <Clock className="w-6 h-6 text-amber-400 mx-auto mb-2 opacity-50" />
                        <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Waiting for Price Quote</p>
                        <p className="text-[10px] text-amber-600 mt-1">Admin is reviewing your meat specifications.</p>
                      </div>
                    ) : booking.quotedPrice ? (
                      <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Quoted Total</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <IndianRupee className="w-4 h-4 text-green-600" />
                              <span className="text-lg font-black text-gray-900">{booking.quotedPrice.toLocaleString()}</span>
                            </div>
                          </div>
                          
                          {/* Payment Actions */}
                          {booking.status === 'awaiting_payment' && (
                            <button 
                              onClick={() => handleAdvancePayment(booking)}
                              disabled={processingPaymentFor === booking.id}
                              className="bg-green-600 text-white font-bold text-xs uppercase tracking-wide px-5 py-2.5 rounded-xl shadow-md shadow-green-600/20 active:scale-95 transition-transform flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {processingPaymentFor === booking.id ? 'Processing...' : `Pay ₹${booking.advanceAmount?.toLocaleString()} Adv`}
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                          {(booking.status === 'confirmed' || booking.status === 'completed' || booking.advancePaid) && (
                            <span className="bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Advance Paid & Confirmed
                            </span>
                          )}
                        </div>
                        
                        {booking.status === 'awaiting_payment' && (
                           <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5 flex items-center gap-2 mb-2">
                             <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                             <p className="text-[10px] font-bold text-orange-800 tracking-wide">
                               💰 50% advance required to confirm order. The quoted price is binding.
                             </p>
                           </div>
                        )}
                        {booking.adminNotes && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Admin Quote Notes</p>
                            <p className="text-xs text-gray-600 font-medium italic">"{booking.adminNotes}"</p>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Cancelled State */}
                    {(booking.status === 'cancelled' || booking.status === 'rejected') && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Ban className="w-5 h-5 text-red-500" />
                          <span className="text-xs font-black text-red-700 uppercase tracking-widest">
                            {booking.status === 'cancelled' ? 'Booking Cancelled' : 'Booking Rejected'}
                          </span>
                        </div>
                        {booking.cancelReason && (
                          <div className="flex items-start gap-2 bg-white/70 rounded-lg p-3">
                            <MessageSquare className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-0.5">Reason</p>
                              <p className="text-xs text-red-800 font-medium leading-relaxed">{booking.cancelReason}</p>
                            </div>
                          </div>
                        )}
                        {booking.cancelledAt && (
                          <p className="text-[10px] text-red-400 font-bold">
                            {new Date(booking.cancelledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}
    </div>
  );
}
