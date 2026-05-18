import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserCircle, MapPin, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function UserOnboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    address: user?.address || '',
  });

  // If already complete, redirect
  useEffect(() => {
    if (user?.profileComplete) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Please enter your delivery address.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user!.uid), {
        name: formData.name.trim(),
        address: formData.address.trim(),
        profileComplete: true,
      });

      setSuccess(true);
      await refreshUser();

      // Redirect after success animation — clear welcome flag so the fireworks play
      setTimeout(() => {
        localStorage.removeItem('hasSeenWelcome');
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF1E6 50%, #FFE8D6 100%)' }}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <div className="w-24 h-24 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
            <Sparkles className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Welcome, {formData.name.split(' ')[0]}!
          </h2>
          <p className="text-gray-500 font-medium">Setting up your account...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-0 sm:px-4"
      style={{ fontFamily: 'Poppins, sans-serif', background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF1E6 50%, #FFE8D6 100%)' }}
    >
      <div className="w-full sm:max-w-[480px] min-h-screen sm:min-h-0 sm:rounded-3xl sm:shadow-2xl sm:border sm:border-gray-100 bg-white/80 backdrop-blur-sm overflow-hidden relative flex flex-col">

        {/* ─── Top Brand Section ─── */}
        <div className="relative pt-12 pb-8 px-6 text-center overflow-hidden">
          <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-[0.07]" style={{ background: '#8B0000' }} />
          <div className="absolute -bottom-10 -left-16 w-40 h-40 rounded-full opacity-[0.05]" style={{ background: '#FFC107' }} />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg mb-4"
              style={{ background: 'linear-gradient(135deg, #8B0000 0%, #A50000 100%)' }}
            >
              <span className="text-white text-2xl font-black">KK</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h1 className="text-2xl font-black tracking-tight" style={{ color: '#8B0000' }}>
              Complete Your Profile
            </h1>
            <p className="text-gray-400 text-sm font-medium mt-2">
              Tell us a bit about yourself so we can deliver to you
            </p>
          </motion.div>
        </div>

        {/* ─── Form Section ─── */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          onSubmit={handleSubmit}
          className="flex-1 px-6 pb-8 flex flex-col"
        >
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                <UserCircle className="w-4 h-4" />
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Enter your full name"
                className="w-full px-4 py-3.5 text-base font-semibold text-gray-900 bg-gray-50 rounded-xl border-2 border-gray-200 outline-none transition-all duration-200 focus:border-[#8B0000] focus:ring-4 focus:ring-[#8B0000]/10 placeholder:text-gray-300 placeholder:font-normal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Address */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                <MapPin className="w-4 h-4" />
                Delivery Address <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Door No, Street, Area, City, PIN code"
                className="w-full px-4 py-3.5 text-base font-semibold text-gray-900 bg-gray-50 rounded-xl border-2 border-gray-200 outline-none transition-all duration-200 focus:border-[#8B0000] focus:ring-4 focus:ring-[#8B0000]/10 resize-none placeholder:text-gray-300 placeholder:font-normal"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>


          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="mt-4 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-100"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Spacer */}
          <div className="flex-1 min-h-[24px]" />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !formData.name.trim() || !formData.address.trim()}
            className="w-full text-white font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg mt-4"
            style={{
              background: loading || !formData.name.trim() || !formData.address.trim()
                ? '#ccc'
                : 'linear-gradient(135deg, #8B0000 0%, #A50000 100%)',
              boxShadow: formData.name.trim() && formData.address.trim() ? '0 8px 30px -8px rgba(139,0,0,0.45)' : 'none',
            }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Start Ordering
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
