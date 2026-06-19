import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Calendar, MapPin, Users, AlertCircle, Check, X, ClipboardList, Clock, ChevronRight, CheckCircle2, XCircle, CreditCard, Scale, Navigation, IndianRupee, Ban, MessageSquare, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { BulkBooking } from '../types';
import { cn } from '../lib/utils';
import { useAddress } from '../context/AddressContext';
import { downloadQuotation, printQuotation } from '../lib/quotationGenerator';
import { 
  downloadFunctionQuotation, 
  printFunctionQuotation,
  downloadFunctionInvoice,
  printFunctionInvoice 
} from '../lib/functionInvoiceGenerator';
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
    notes: '',
    // Function specific fields
    functionType: 'Marriage' as 'Marriage' | 'Reception' | 'Birthday' | 'Temple Function' | 'Corporate Event' | 'House Function' | 'Other',
    eventAddress: '',
    eventArea: '',
    eventCity: '',
    eventPincode: '',
    eventDate: '',
    eventTime: '',
    deliveryDate: '',
    adultCount: 50,
    childrenCount: 0,
    vegCount: 0,
    nonVegCount: 50,
    specialInstructions: ''
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
    const eventErrors: typeof errors & Record<string, string> = { ...errors };
    let isEventValid = valid;

    if (formData.type === 'function') {
      if (!formData.eventAddress.trim()) {
        eventErrors.eventAddress = 'Please enter event address';
        isEventValid = false;
      }
      if (!formData.eventArea.trim()) {
        eventErrors.eventArea = 'Please enter event area';
        isEventValid = false;
      }
      if (!formData.eventCity.trim()) {
        eventErrors.eventCity = 'Please enter event city';
        isEventValid = false;
      }
      if (!/^\d{6}$/.test(formData.eventPincode)) {
        eventErrors.eventPincode = 'Pincode must be exactly 6 digits';
        isEventValid = false;
      }
      if (!formData.eventDate) {
        eventErrors.eventDate = 'Please select event date';
        isEventValid = false;
      }
      if (!formData.eventTime) {
        eventErrors.eventTime = 'Please select event time';
        isEventValid = false;
      }
      if (formData.adultCount <= 0) {
        eventErrors.adultCount = 'Adult count must be at least 1';
        isEventValid = false;
      }
    }

    setFormErrors(eventErrors);

    // Touch fields
    const touchedFields: Record<string, boolean> = {
      peopleCount: true,
      meatDetails: true,
      quantityRequirement: true,
      requiredDate: true,
      deliveryTime: true,
      location: true
    };
    if (formData.type === 'function') {
      touchedFields.eventAddress = true;
      touchedFields.eventArea = true;
      touchedFields.eventCity = true;
      touchedFields.eventPincode = true;
      touchedFields.eventDate = true;
      touchedFields.eventTime = true;
      touchedFields.adultCount = true;
    }
    setTouched(touchedFields);

    if (formData.type === 'function' ? !isEventValid : !valid) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const sanitized = sanitizeBookingForm(formData);
      
      const computedPeopleCount = sanitized.type === 'function'
        ? (formData.adultCount + formData.childrenCount)
        : sanitized.peopleCount;

      const computedLocation = sanitized.type === 'function'
        ? [formData.eventAddress, formData.eventArea, formData.eventCity, formData.eventPincode ? `Pin: ${formData.eventPincode}` : ''].filter(Boolean).join(', ')
        : sanitized.location;

      const booking: Omit<BulkBooking, 'id'> = {
        userId: user.uid,
        userName: user.name || 'Customer',
        userPhone: user.phone,
        type: sanitized.type,
        peopleCount: computedPeopleCount,
        meatDetails: sanitized.meatDetails,
        quantityRequirement: sanitized.quantityRequirement,
        requiredDate: sanitized.type === 'function' ? (formData.deliveryDate || sanitized.requiredDate) : sanitized.requiredDate,
        deliveryTime: sanitized.deliveryTime,
        location: computedLocation,
        notes: sanitized.notes,
        status: 'requested',
        paymentStatus: 'none',
        advancePaid: false,
        createdAt: now,
        updatedAt: now,
        ...(sanitized.type === 'function' ? {
          functionType: formData.functionType,
          eventAddress: formData.eventAddress,
          eventArea: formData.eventArea,
          eventCity: formData.eventCity,
          eventPincode: formData.eventPincode,
          eventDate: formData.eventDate || sanitized.requiredDate,
          eventTime: formData.eventTime || sanitized.deliveryTime,
          deliveryDate: formData.deliveryDate || sanitized.requiredDate,
          adultCount: formData.adultCount,
          childrenCount: formData.childrenCount,
          vegCount: formData.vegCount,
          nonVegCount: formData.nonVegCount,
          specialInstructions: formData.specialInstructions,
        } : {})
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
      case 'eventAddress': {
        if (!formData.eventAddress.trim()) newErrors.eventAddress = 'Please enter event address'; else delete newErrors.eventAddress;
        break;
      }
      case 'eventArea': {
        if (!formData.eventArea.trim()) newErrors.eventArea = 'Please enter event area'; else delete newErrors.eventArea;
        break;
      }
      case 'eventCity': {
        if (!formData.eventCity.trim()) newErrors.eventCity = 'Please enter event city'; else delete newErrors.eventCity;
        break;
      }
      case 'eventPincode': {
        if (!/^\d{6}$/.test(formData.eventPincode)) newErrors.eventPincode = 'Pincode must be exactly 6 digits'; else delete newErrors.eventPincode;
        break;
      }
      case 'eventDate': {
        if (!formData.eventDate) newErrors.eventDate = 'Please select event date'; else delete newErrors.eventDate;
        break;
      }
      case 'eventTime': {
        if (!formData.eventTime) newErrors.eventTime = 'Please select event time'; else delete newErrors.eventTime;
        break;
      }
      case 'adultCount': {
        if (formData.adultCount <= 0) newErrors.adultCount = 'Adult count must be at least 1'; else delete newErrors.adultCount;
        break;
      }
    }
    setFormErrors(newErrors);
  };

  const hasErrors = Object.keys(formErrors).length > 0;
  // ─── Payment Handler ────────────────────────────────────────────────────
  const [processingPaymentFor, setProcessingPaymentFor] = useState<string | null>(null);
  const [showAdvanceQr, setShowAdvanceQr] = useState<BulkBooking | null>(null);
  const [advanceUtr, setAdvanceUtr] = useState('');
  const [advanceUtrError, setAdvanceUtrError] = useState('');

  const UPI_ID = 'balanr454-1@okhdfcbank';
  const UPI_NAME = 'KARI KING';

  const handleAdvancePayment = (booking: BulkBooking) => {
    if (!booking.advanceAmount || booking.advanceAmount <= 0) return;
    setShowAdvanceQr(booking);
    setAdvanceUtr('');
    setAdvanceUtrError('');
  };

  const handleSubmitAdvanceUtr = async () => {
    if (!showAdvanceQr) return;
    const trimmed = advanceUtr.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      setAdvanceUtrError('UTR must be exactly 12 digits');
      return;
    }
    setProcessingPaymentFor(showAdvanceQr.id);
    try {
      await updateDoc(doc(db, 'bulkBookings', showAdvanceQr.id), {
        advancePaid: true,
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'qr',
        utrNumber: trimmed,
        advancePaidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setShowAdvanceQr(null);
      setAdvanceUtr('');
    } catch (err: any) {
      console.error('UTR submit failed', err);
      setAdvanceUtrError('Failed to submit. Please try again.');
    } finally {
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

            {formData.type === 'bulk' ? (
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
            ) : (
              <div className="space-y-4 bg-amber-50/30 p-5 rounded-2xl border border-amber-100/50">
                <h3 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                  <Calendar className="w-4 h-4" /> Event Booking Info
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* Function Type */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Event Type</label>
                    <select
                      className="w-full p-4 border border-gray-200 rounded-2xl bg-white outline-none font-bold text-gray-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      value={formData.functionType}
                      onChange={e => setFormData({...formData, functionType: e.target.value as any})}
                    >
                      <option value="Marriage">Marriage</option>
                      <option value="Reception">Reception</option>
                      <option value="Birthday">Birthday</option>
                      <option value="Temple Function">Temple Function</option>
                      <option value="Corporate Event">Corporate Event</option>
                      <option value="House Function">House Function</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Target Quantity */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-amber-600"/> Target Quantity</label>
                    <input required type="text" placeholder="e.g. 20 kg" className={cn("w-full p-4 border rounded-2xl bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-gray-800", touched.quantityRequirement && formErrors.quantityRequirement ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.quantityRequirement} onChange={e => setFormData({...formData, quantityRequirement: e.target.value})} onBlur={() => handleBlur('quantityRequirement')} />
                    {touched.quantityRequirement && formErrors.quantityRequirement && (
                      <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.quantityRequirement}</p>
                    )}
                  </div>
                </div>

                {/* Guest Breakdown */}
                <div className="space-y-3">
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Guest Count Breakdown</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Adults</label>
                      <input type="number" min="1" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold", touched.adultCount && formErrors.adultCount ? 'border-red-400' : 'border-gray-200')} value={formData.adultCount} onChange={e => setFormData({...formData, adultCount: parseInt(e.target.value) || 0})} onBlur={() => handleBlur('adultCount')} />
                      {touched.adultCount && formErrors.adultCount && (
                        <p className="text-[9px] text-red-500 font-bold mt-0.5">{formErrors.adultCount}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Children</label>
                      <input type="number" min="0" className="w-full p-3 border border-gray-200 rounded-xl bg-white outline-none text-xs font-bold" value={formData.childrenCount} onChange={e => setFormData({...formData, childrenCount: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Veg Guests</label>
                      <input type="number" min="0" className="w-full p-3 border border-gray-200 rounded-xl bg-white outline-none text-xs font-bold" value={formData.vegCount} onChange={e => setFormData({...formData, vegCount: parseInt(e.target.value) || 0})} />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Non-Veg Guests</label>
                      <input type="number" min="0" className="w-full p-3 border border-gray-200 rounded-xl bg-white outline-none text-xs font-bold" value={formData.nonVegCount} onChange={e => setFormData({...formData, nonVegCount: parseInt(e.target.value) || 0})} />
                    </div>
                  </div>
                </div>

                {/* Event Date & Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Event Date</label>
                    <input required type="date" min={new Date().toISOString().split('T')[0]} className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventDate && formErrors.eventDate ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventDate} onChange={e => setFormData({...formData, eventDate: e.target.value})} onBlur={() => handleBlur('eventDate')} />
                    {touched.eventDate && formErrors.eventDate && (
                      <p className="text-[10px] text-red-500 font-bold mt-1">{formErrors.eventDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Event Time</label>
                    <input required type="time" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventTime && formErrors.eventTime ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventTime} onChange={e => setFormData({...formData, eventTime: e.target.value})} onBlur={() => handleBlur('eventTime')} />
                    {touched.eventTime && formErrors.eventTime && (
                      <p className="text-[10px] text-red-500 font-bold mt-1">{formErrors.eventTime}</p>
                    )}
                  </div>
                </div>

                {/* Required Delivery Date & Time */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Delivery Date</label>
                    <input required type="date" min={new Date().toISOString().split('T')[0]} className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.requiredDate && formErrors.requiredDate ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.requiredDate} onChange={e => setFormData({...formData, requiredDate: e.target.value})} onBlur={() => handleBlur('requiredDate')} />
                    {touched.requiredDate && formErrors.requiredDate && (
                      <p className="text-[10px] text-red-500 font-bold mt-1">{formErrors.requiredDate}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Delivery Time</label>
                    <input required type="time" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.deliveryTime && formErrors.deliveryTime ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.deliveryTime} onChange={e => setFormData({...formData, deliveryTime: e.target.value})} onBlur={() => handleBlur('deliveryTime')} />
                    {touched.deliveryTime && formErrors.deliveryTime && (
                      <p className="text-[10px] text-red-500 font-bold mt-1">{formErrors.deliveryTime}</p>
                    )}
                  </div>
                </div>

                {/* Venue Address */}
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Venue Address</span>
                  <div>
                    <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Street Address / Venue Name</label>
                    <input required type="text" placeholder="e.g. Grand Palace Hall, 1st Cross" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventAddress && formErrors.eventAddress ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventAddress} onChange={e => setFormData({...formData, eventAddress: e.target.value})} onBlur={() => handleBlur('eventAddress')} />
                    {touched.eventAddress && formErrors.eventAddress && (
                      <p className="text-[9px] text-red-500 font-bold mt-0.5">{formErrors.eventAddress}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Area</label>
                      <input required type="text" placeholder="Anna Nagar" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventArea && formErrors.eventArea ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventArea} onChange={e => setFormData({...formData, eventArea: e.target.value})} onBlur={() => handleBlur('eventArea')} />
                      {touched.eventArea && formErrors.eventArea && (
                        <p className="text-[9px] text-red-500 font-bold mt-0.5">{formErrors.eventArea}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">City</label>
                      <input required type="text" placeholder="Chennai" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventCity && formErrors.eventCity ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventCity} onChange={e => setFormData({...formData, eventCity: e.target.value})} onBlur={() => handleBlur('eventCity')} />
                      {touched.eventCity && formErrors.eventCity && (
                        <p className="text-[9px] text-red-500 font-bold mt-0.5">{formErrors.eventCity}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Pincode</label>
                      <input required type="text" maxLength={6} placeholder="600040" className={cn("w-full p-3 border rounded-xl bg-white outline-none text-xs font-bold text-gray-800", touched.eventPincode && formErrors.eventPincode ? 'border-red-400 bg-red-50/30' : 'border-gray-200')} value={formData.eventPincode} onChange={e => setFormData({...formData, eventPincode: e.target.value.replace(/\D/g, '')})} onBlur={() => handleBlur('eventPincode')} />
                      {touched.eventPincode && formErrors.eventPincode && (
                        <p className="text-[9px] text-red-500 font-bold mt-0.5">{formErrors.eventPincode}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Special Instructions */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Special Instructions</label>
                  <textarea rows={2} placeholder="Catering specifics, preparation style..." className="w-full p-3 border border-gray-200 rounded-xl bg-white outline-none text-xs font-medium resize-none" value={formData.specialInstructions} onChange={e => setFormData({...formData, specialInstructions: e.target.value})} />
                </div>
              </div>
            )}

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

            {formData.type === 'bulk' && (
              <>
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
              </>
            )}

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
                        {booking.type === 'function' ? 'EVENT SPEC' : 'BULK SPEC'} #{booking.id.slice(-5)}
                      </p>
                      <p className="text-xs font-bold text-gray-700 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        Req: {new Date(booking.requiredDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {booking.deliveryTime}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm border border-black/5", 
                      booking.type === 'function' && booking.status === 'requested' ? 'bg-blue-100 text-blue-700' : statusCfg.color
                    )}>
                      <StatusIcon className="w-3 h-3" /> {booking.type === 'function' && booking.status === 'requested' ? 'Event Requested' : statusCfg.label}
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

                    {/* Event Specific Specs (For history display) */}
                    {booking.type === 'function' && (
                      <div className="bg-amber-50/30 rounded-xl p-3 border border-amber-100/50 space-y-1.5 text-xs text-amber-900">
                        <div className="flex justify-between font-bold">
                          <span>Event Type:</span>
                          <span className="text-amber-800">{booking.functionType || 'Catering'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Event Date & Time:</span>
                          <span>{booking.eventDate ? new Date(booking.eventDate).toLocaleDateString('en-IN') : new Date(booking.requiredDate).toLocaleDateString('en-IN')} @ {booking.eventTime || booking.deliveryTime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Guests Breakdown:</span>
                          <span>{booking.adultCount || booking.peopleCount} Adults | {booking.childrenCount || 0} Children</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Diet:</span>
                          <span>{booking.vegCount || 0} Veg | {booking.nonVegCount || 0} Non-Veg</span>
                        </div>
                        {booking.specialInstructions && (
                          <div className="pt-1.5 border-t border-amber-100/50 text-[11px] leading-relaxed">
                            <span className="font-bold">Instructions:</span> {booking.specialInstructions}
                          </div>
                        )}
                      </div>
                    )}
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
                      <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Quoted Total</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <IndianRupee className="w-4 h-4 text-green-600" />
                              <span className="text-lg font-black text-gray-900">{(booking.grandTotal || booking.quotedPrice).toLocaleString()}</span>
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

                        {/* Itemized Quotation Summary */}
                        {booking.items && booking.items.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                <ShoppingCart className="w-3 h-3" /> Quotation Items ({booking.items.length})
                              </p>
                            </div>
                            <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                              {booking.items.map((item, idx) => (
                                <div key={idx} className="px-3 py-2 flex justify-between items-center text-xs">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800 truncate">{item.productName}</p>
                                    <p className="text-[10px] text-gray-500">
                                      {item.quantity} {item.unitType} × ₹{item.unitPrice.toLocaleString()}
                                      {(item.discount || 0) > 0 && <span className="text-green-600 ml-1">(-₹{item.discount!.toLocaleString()})</span>}
                                    </p>
                                  </div>
                                  <span className="font-black text-gray-900 ml-2">₹{(item.lineTotal ?? item.subtotal).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                            {/* Quotation totals */}
                            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 space-y-1 text-[10px]">
                              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-bold">₹{(booking.subtotal || 0).toLocaleString()}</span></div>
                              {(booking.deliveryCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Delivery/Catering</span><span className="font-bold">₹{booking.deliveryCharges!.toLocaleString()}</span></div>}
                              {(booking.additionalCharges || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Additional</span><span className="font-bold">₹{booking.additionalCharges!.toLocaleString()}</span></div>}
                              {(booking.globalDiscount || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="font-bold text-green-600">-₹{booking.globalDiscount!.toLocaleString()}</span></div>}
                              <div className="flex justify-between border-t border-gray-200 pt-1 font-bold"><span className="text-gray-700">Grand Total</span><span className="text-[#8B0000]">₹{(booking.grandTotal || booking.quotedPrice).toLocaleString()}</span></div>
                            </div>
                          </div>
                        )}
                        
                        {booking.status === 'awaiting_payment' && (
                          <div className="space-y-2">
                            {booking.adminMessage && (
                              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest mb-1">Message from Kari King</p>
                                  <p className="text-xs font-medium text-blue-800 leading-relaxed">{booking.adminMessage}</p>
                                </div>
                              </div>
                            )}
                            <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                              <p className="text-[10px] font-bold text-orange-800 tracking-wide">
                                💰 50% advance required to confirm order. The quoted price is binding.
                              </p>
                            </div>
                            <a
                              href={`https://wa.me/919442735406?text=${encodeURIComponent(`Hi, I have a bulk booking #${booking.id.slice(-6)}. I'd like to discuss and pay the advance of ₹${(booking.advanceAmount || 0).toLocaleString()}.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-2.5 bg-green-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Contact Us on WhatsApp
                            </a>
                          </div>
                        )}

                        {booking.adminNotes && (
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Admin Quote Notes</p>
                            <p className="text-xs text-gray-600 font-medium italic">"{booking.adminNotes}"</p>
                          </div>
                        )}

                        {/* PDF Downloads */}
                        <div className="pt-2 border-t border-gray-100 space-y-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => booking.type === 'function' ? downloadFunctionQuotation(booking) : downloadQuotation(booking)}
                              className="flex-1 py-2 bg-purple-50 text-purple-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-purple-100 shadow-sm"
                            >
                              <Download className="w-3.5 h-3.5" /> Quotation PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => booking.type === 'function' ? printFunctionQuotation(booking) : printQuotation(booking)}
                              className="py-2 px-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-gray-200 shadow-sm"
                            >
                              <Printer className="w-3.5 h-3.5" /> Print Quote
                            </button>
                          </div>

                          {booking.type === 'function' && booking.status === 'completed' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => downloadFunctionInvoice(booking)}
                                className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-100 shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" /> Invoice PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => printFunctionInvoice(booking)}
                                className="py-2 px-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border border-gray-200 shadow-sm"
                              >
                                <Printer className="w-3.5 h-3.5" /> Print Invoice
                              </button>
                            </div>
                          )}
                        </div>
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

      {/* ─── Advance Payment QR Modal ────────────────────────────── */}
      {showAdvanceQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-[380px] w-full p-6 shadow-2xl relative">
            <button onClick={() => setShowAdvanceQr(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-3">
                <QrCode className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Pay Advance</h3>
              <p className="text-sm text-gray-500 mt-1">Scan & pay ₹{showAdvanceQr.advanceAmount?.toLocaleString()} via UPI</p>
            </div>
            <div className="bg-white rounded-2xl p-4 mb-4 flex items-center justify-center border-2 border-gray-100 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${showAdvanceQr.advanceAmount}&cu=INR&tn=KariKing_Advance_${showAdvanceQr.id.slice(-5)}`)}`}
                alt="UPI QR Code"
                className="w-[220px] h-[220px] rounded-xl object-contain"
              />
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Advance Amount</p>
              <p className="text-2xl font-black text-green-700 my-1">₹{showAdvanceQr.advanceAmount?.toLocaleString()}</p>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Enter 12-digit UTR number"
                value={advanceUtr}
                onChange={(e) => { setAdvanceUtr(e.target.value.replace(/\D/g, '')); setAdvanceUtrError(''); }}
                maxLength={12}
                className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm text-center tracking-widest"
              />
              {advanceUtrError && <p className="text-[10px] text-red-600 font-bold text-center">{advanceUtrError}</p>}
              <button
                onClick={handleSubmitAdvanceUtr}
                disabled={processingPaymentFor === showAdvanceQr.id || advanceUtr.length !== 12}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {processingPaymentFor === showAdvanceQr.id ? 'Submitting...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
