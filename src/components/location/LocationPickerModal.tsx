import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, X, Home, Briefcase, ChevronRight, AlertCircle, Tag, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAddress } from '../../context/AddressContext';
import { cn } from '../../lib/utils';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional override callback — if not provided, saves via AddressContext */
  onSave?: (fullAddress: string) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Capitalize first letter of every word */
function titleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build clean fullAddress string */
function buildFullAddress(street: string, city: string, pincode: string): string {
  return `${titleCase(street)}, ${titleCase(city)} - ${pincode}`;
}

// ─── Validation ─────────────────────────────────────────────────────────────

interface FormErrors {
  street?: string;
  city?: string;
  pincode?: string;
}

function validate(street: string, city: string, pincode: string): FormErrors {
  const errors: FormErrors = {};
  const trimStreet = street.trim();
  const trimCity = city.trim();
  const trimPin = pincode.trim();

  if (trimStreet.length < 5) {
    errors.street = 'Street must be at least 5 characters';
  }
  if (!trimCity || !/^[a-zA-Z\s]+$/.test(trimCity)) {
    errors.city = 'City must contain only letters';
  }
  if (!/^\d{6}$/.test(trimPin)) {
    errors.pincode = 'Pincode must be exactly 6 digits';
  }
  return errors;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LocationPickerModal({ isOpen, onClose, onSave }: LocationPickerModalProps) {
  const { user } = useAuth();
  const { saveAddress } = useAddress();

  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [saveAs, setSaveAs] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Derived: is form valid for submission?
  const isFormValid = useMemo(() => {
    return Object.keys(validate(street, city, pincode)).length === 0;
  }, [street, city, pincode]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStreet('');
      setCity('');
      setPincode('');
      setSaveAs('Home');
      setErrors({});
      setTouched({});
      setSaveSuccess(false);
      setSaveError('');
    }
  }, [isOpen]);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(street, city, pincode));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');

    const validationErrors = validate(street, city, pincode);
    setErrors(validationErrors);
    setTouched({ street: true, city: true, pincode: true });

    if (Object.keys(validationErrors).length > 0) return;
    if (!user || user.uid.startsWith('demo-')) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const fullAddress = buildFullAddress(street, city, pincode);

      if (onSave) {
        await onSave(fullAddress);
      } else {
        await saveAddress({
          id: Date.now().toString(),
          name: saveAs,
          street: titleCase(street.trim()),
          city: titleCase(city.trim()),
          pincode: pincode.trim(),
          state: 'Tamil Nadu',
          fullAddress,
          isDefault: true,
        });
      }

      // Show success state briefly before closing
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (error: any) {
      console.error('Error saving address:', error);
      setSaveError(error?.message || 'Failed to save address. Please try again.');
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
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 mb-2 md:hidden" />

            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Add Address</h2>
                  <p className="text-sm font-medium text-gray-500 mt-1">Enter your delivery address</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                {/* Street & Area */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    Street & Area *
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chinnabatakanapalli, Soolagiri TK"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      onBlur={() => handleBlur('street')}
                      className={cn(
                        "w-full pl-12 pr-4 py-4 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400",
                        touched.street && errors.street
                          ? "border-red-400 bg-red-50/50 focus:border-red-600"
                          : "border-transparent focus:border-red-600 focus:bg-white"
                      )}
                    />
                  </div>
                  {touched.street && errors.street && (
                    <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.street}
                    </p>
                  )}
                </div>

                {/* City */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    City *
                  </label>
                  <div className="relative">
                    <Home className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Krishnagiri"
                      value={city}
                      onChange={(e) => setCity(e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
                      onBlur={() => handleBlur('city')}
                      className={cn(
                        "w-full pl-12 pr-4 py-4 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400",
                        touched.city && errors.city
                          ? "border-red-400 bg-red-50/50 focus:border-red-600"
                          : "border-transparent focus:border-red-600 focus:bg-white"
                      )}
                    />
                  </div>
                  {touched.city && errors.city && (
                    <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.city}
                    </p>
                  )}
                </div>

                {/* Pincode */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                    Pincode *
                  </label>
                  <div className="relative">
                    <Tag className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="e.g. 635119"
                      maxLength={6}
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                      onBlur={() => handleBlur('pincode')}
                      className={cn(
                        "w-full pl-12 pr-4 py-4 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400 tracking-widest",
                        touched.pincode && errors.pincode
                          ? "border-red-400 bg-red-50/50 focus:border-red-600"
                          : "border-transparent focus:border-red-600 focus:bg-white"
                      )}
                    />
                  </div>
                  {touched.pincode && errors.pincode && (
                    <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.pincode}
                    </p>
                  )}
                </div>

                {/* Save As (Home / Work / Other) */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 block">
                    Save As
                  </label>
                  <div className="flex gap-3">
                    {(['Home', 'Work', 'Other'] as const).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSaveAs(tag)}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-2xl border-2 font-bold flex items-center justify-center gap-2 transition-all text-sm",
                          saveAs === tag
                            ? "border-red-600 bg-red-50 text-red-600"
                            : "border-gray-100 text-gray-500 hover:border-gray-200"
                        )}
                      >
                        {tag === 'Home' && <Home className="w-4 h-4" />}
                        {tag === 'Work' && <Briefcase className="w-4 h-4" />}
                        {tag === 'Other' && <MapPin className="w-4 h-4" />}
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview */}
                {street.trim().length >= 5 && city.trim() && /^\d{6}$/.test(pincode.trim()) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-green-50 border border-green-100 rounded-xl p-3"
                  >
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1">Preview</p>
                    <p className="text-sm font-bold text-gray-900">{saveAs}</p>
                    <p className="text-xs text-gray-600">{titleCase(street.trim())}</p>
                    <p className="text-xs text-gray-600">{titleCase(city.trim())} - {pincode.trim()}</p>
                  </motion.div>
                )}

                {/* Save Error */}
                {saveError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs font-bold text-red-600">{saveError}</p>
                  </motion.div>
                )}

                {/* Confirm Button */}
                <div className="pt-2 pb-2">
                  <button
                    type="submit"
                    disabled={saving || saveSuccess || !isFormValid}
                    className={cn(
                      "ripple-btn w-full py-4 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-wide transition-all active:scale-95",
                      saveSuccess
                        ? "bg-green-500 text-white shadow-[0_8px_20px_rgba(34,197,94,0.3)]"
                        : isFormValid
                          ? "bg-premium-gradient text-white shadow-[0_8px_20px_rgba(122,0,0,0.3)] hover:shadow-[0_12px_25px_rgba(122,0,0,0.4)]"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {saveSuccess ? (
                      <><CheckCircle2 className="w-5 h-5" /> Address Saved!</>
                    ) : saving ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
                    ) : (
                      <><span>Confirm Location</span> <ChevronRight className="w-5 h-5" /></>
                    )}
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
