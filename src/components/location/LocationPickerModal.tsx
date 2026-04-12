import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, X, Navigation, Home, Briefcase, ChevronRight, Crosshair } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { cn } from '../../lib/utils';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (fullAddress: string, lat?: number, lng?: number, tag?: string) => Promise<void>;
}

export default function LocationPickerModal({ isOpen, onClose, onSave }: LocationPickerModalProps) {
  const { user, refreshUser } = useAuth();
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveAs, setSaveAs] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [locating, setLocating] = useState(false);

  // Pre-fill if exists
  React.useEffect(() => {
    if (isOpen && user?.address) {
      const parts = user.address.split(',');
      if (parts.length > 0) setAddressLine(parts[0].trim());
      if (parts.length > 1) setCity(parts.slice(1).join(',').trim());
      if (user.locationLat && user.locationLng) {
        setLat(user.locationLat);
        setLng(user.locationLng);
      }
    }
  }, [isOpen, user]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocating(false);
        // Optionally reverse geocode here if API key existed
      },
      (error) => {
        console.error("Error obtaining location", error);
        alert("Failed to get location. Please enable location services.");
        setLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.uid.startsWith('demo-')) {
      // Handle demo mode fallback
      if (user) {
        user.address = `${addressLine}, ${city}`;
        onClose();
        return;
      }
      onClose();
      return;
    }

    setSaving(true);
    try {
      const fullAddress = `${addressLine}, ${city}`;
      if (onSave) {
        await onSave(fullAddress, lat, lng, saveAs.toLowerCase());
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          address: fullAddress,
          locationLat: lat || null,
          locationLng: lng || null,
          profileComplete: true 
        });
        await refreshUser();
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving address:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />

          {/* Modal / Bottom Sheet */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] md:max-w-md md:mx-auto md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-3xl"
          >
            {/* Handle bar for bottom sheet look */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2 md:hidden" />

            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Select Location</h2>
                  <p className="text-sm font-medium text-gray-500 mt-1">Enter your delivery address</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    Street & Area
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. 12/4 Main Street, Villangudi"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    City & Pincode
                  </label>
                  <div className="relative">
                    <Navigation className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Madurai, 625018"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-red-600 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={locating}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-xl font-bold border-2 border-red-100 hover:bg-red-100 active:scale-95 transition-all text-sm disabled:opacity-50"
                >
                  <Crosshair className="w-5 h-5" />
                  {locating ? 'Locating...' : 'Use current location (GPS)'}
                </button>
                {lat && lng && (
                  <p className="text-[10px] text-green-600 font-bold text-center mt-[-10px]">
                    ✓ Precise location captured ({lat.toFixed(4)}, {lng.toFixed(4)})
                  </p>
                )}

                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 block">
                    Save As
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setSaveAs('Home')}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-2xl border-2 font-bold flex items-center justify-center gap-2 transition-all",
                        saveAs === 'Home' 
                          ? "border-red-600 bg-red-50 text-red-600" 
                          : "border-gray-100 text-gray-500 hover:border-gray-200"
                      )}
                    >
                      <Home className="w-4 h-4" /> Home
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveAs('Work')}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-2xl border-2 font-bold flex items-center justify-center gap-2 transition-all",
                        saveAs === 'Work' 
                          ? "border-red-600 bg-red-50 text-red-600" 
                          : "border-gray-100 text-gray-500 hover:border-gray-200"
                      )}
                    >
                      <Briefcase className="w-4 h-4" /> Work
                    </button>
                  </div>
                </div>

                <div className="pt-4 pb-2">
                  <button
                    type="submit"
                    disabled={saving || !addressLine || !city}
                    className="ripple-btn w-full bg-premium-gradient text-white py-4 rounded-xl flex shadow-[0_8px_20px_rgba(122,0,0,0.3)] items-center justify-center gap-2 hover:shadow-[0_12px_25px_rgba(122,0,0,0.4)] disabled:opacity-50 active:scale-95 font-black uppercase tracking-wide transition-all"
                  >
                    {saving ? 'Saving...' : 'Confirm Location'}
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
