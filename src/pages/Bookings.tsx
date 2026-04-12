import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, PartyPopper, Calendar, MapPin, Users, Scale, AlertCircle, Check, X, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, BulkDetails, FunctionDetails } from '../types';

export default function Bookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeForm, setActiveForm] = useState<'none' | 'bulk' | 'function'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Focus: Bulk Form
  const [bulkData, setBulkData] = useState<BulkDetails>({ weight: '', expectedDate: '', notes: '', items: '' });
  
  // Focus: Function Form
  const [functionData, setFunctionData] = useState<FunctionDetails>({ 
    eventType: 'Wedding', peopleCount: 50, items: '', expectedDate: '', location: '', notes: '' 
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const baseOrder = {
        userId: user.uid,
        items: [], // inquiries don't require immediate cart checkout mapping
        totalAmount: 0,
        status: 'Order Placed',
        statusHistory: [{ status: 'Order Placed', time: now }],
        address: user.address || (activeForm === 'function' ? functionData.location : 'Pending'),
        phone: user.phone,
        coinsUsed: 0,
        discountAmount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const finalOrder = activeForm === 'bulk'
        ? { ...baseOrder, type: 'bulk', bulkDetails: bulkData }
        : { ...baseOrder, type: 'function', functionDetails: functionData };

      await addDoc(collection(db, 'orders'), finalOrder);
      setSuccess(true);
    } catch (error) {
      console.error(error);
      alert('Failed to place booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-600/20">
          <Check className="w-12 h-12" />
        </motion.div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Booking Received!</h2>
        <p className="text-gray-500 max-w-sm mb-8">Our team will review your requirements and contact you shortly with a custom quote.</p>
        <button onClick={() => navigate('/profile')} className="bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold px-8 py-3.5 rounded-xl transition-colors">
          View in My Orders
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#8B0000] via-[#A50000] to-[#DC2626] rounded-3xl p-6 shadow-[0_8px_30px_rgba(139,0,0,0.3)] text-white relative overflow-hidden"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full" />
        <div className="relative z-10">
          <h1 className="text-3xl font-black drop-shadow-md mb-2">Special Bookings</h1>
          <p className="text-white/80 text-sm font-medium leading-relaxed max-w-sm">From massive bulk purchases to complete event catering, we scale to meet your needs.</p>
        </div>
      </motion.div>

      {/* ─── SELECTION CARDS ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeForm === 'none' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="grid grid-cols-1 gap-4"
          >
            {/* Bulk Card */}
            <button 
              onClick={() => setActiveForm('bulk')}
              className="premium-card relative overflow-hidden bg-white text-left p-6 rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-blue-50 hover:border-blue-100 transition-all group group-hover:shadow-[0_8px_30px_rgba(59,130,246,0.15)]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full pointer-events-none" />
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/30">
                <Package className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Bulk Buy Order</h2>
              <p className="text-sm text-gray-500 max-w-[240px]">Perfect for restaurants, large families, and wholesalers. Specify your exact volume requirements.</p>
            </button>

            {/* Function Card */}
            <button 
              onClick={() => setActiveForm('function')}
              className="premium-card relative overflow-hidden bg-white text-left p-6 rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-amber-50 hover:border-amber-100 transition-all group group-hover:shadow-[0_8px_30px_rgba(245,158,11,0.15)]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full pointer-events-none" />
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-amber-500/30">
                <PartyPopper className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Celebration Booking</h2>
              <p className="text-sm text-gray-500 max-w-[240px]">Weddings, parties, and corporate events. We handle the heavy lifting for your big day.</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── FORMS ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeForm !== 'none' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {/* Form Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                {activeForm === 'bulk' ? <Package className="w-6 h-6 text-blue-600" /> : <PartyPopper className="w-6 h-6 text-amber-500" />}
                {activeForm === 'bulk' ? 'Bulk Buy Request' : 'Event Booking'}
              </h2>
              <button onClick={() => setActiveForm('none')} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-full h-1.5 ${activeForm === 'bulk' ? 'bg-blue-600' : 'bg-amber-500'}`} />
              
              {activeForm === 'bulk' && (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5"/> Needed Items</label>
                      <textarea required rows={2} placeholder="e.g. Country Chicken (skinout), Premium Mutton Cuts..." className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none font-medium resize-none transition-all" value={bulkData.items} onChange={e => setBulkData({...bulkData, items: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5"/> Total Estimated Weight</label>
                      <input required type="text" placeholder="e.g. 50kg, 100kg" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none font-bold transition-all" value={bulkData.weight} onChange={e => setBulkData({...bulkData, weight: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Required Date</label>
                      <input required type="date" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none font-bold text-gray-700 transition-all" value={bulkData.expectedDate} onChange={e => setBulkData({...bulkData, expectedDate: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Additional Notes</label>
                      <textarea rows={2} placeholder="Any specific cut instructions or delivery details?" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none font-medium resize-none transition-all" value={bulkData.notes} onChange={e => setBulkData({...bulkData, notes: e.target.value})} />
                    </div>
                  </div>
                </>
              )}

              {activeForm === 'function' && (
                <>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Event Type</label>
                        <select className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold transition-all" value={functionData.eventType} onChange={e => setFunctionData({...functionData, eventType: e.target.value as any})}>
                          <option value="Wedding">Wedding</option>
                          <option value="Party">Party</option>
                          <option value="Function">Function</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> Guest Count</label>
                        <input required type="number" min="1" placeholder="50" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold transition-all" value={functionData.peopleCount} onChange={e => setFunctionData({...functionData, peopleCount: parseInt(e.target.value) || 0})} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5"/> Required Menu / Meat List</label>
                      <textarea required rows={2} placeholder="e.g. Mutton for biryani, Chicken for 65..." className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-medium resize-none transition-all" value={functionData.items} onChange={e => setFunctionData({...functionData, items: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Event Date</label>
                        <input required type="date" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-gray-700 transition-all" value={functionData.expectedDate} onChange={e => setFunctionData({...functionData, expectedDate: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> Event Location</label>
                        <input required type="text" placeholder="Full venue address" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold transition-all" value={functionData.location} onChange={e => setFunctionData({...functionData, location: e.target.value})} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Special Notes</label>
                      <textarea rows={2} placeholder="Chef available? Specific cut timing requirements?" className="w-full p-4 border border-gray-200 rounded-2xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-medium resize-none transition-all" value={functionData.notes} onChange={e => setFunctionData({...functionData, notes: e.target.value})} />
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-gray-100">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className={`w-full py-4 rounded-xl font-black text-white text-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    activeForm === 'bulk' 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 shadow-blue-600/30 hover:shadow-blue-600/50' 
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-orange-500/30 hover:shadow-orange-500/50'
                  } disabled:opacity-50`}
                >
                  {submitting ? 'Submitting...' : 'Request Booking Quote'}
                </button>
              </div>

            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
