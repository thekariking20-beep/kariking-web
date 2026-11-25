import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin,
  X,
  Home,
  Briefcase,
  ChevronRight,
  AlertCircle,
  Tag,
  CheckCircle2,
  Loader2,
  Navigation,
  Search,
  Crosshair,
  Bookmark,
  Radar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resolveAddressCoordinates, useAddress } from '../../context/AddressContext';
import {
  findNearestOfflineLocation,
  resolveOfflineCoordinates,
  searchOfflineLocations,
} from '../../config/locationDataset';
import { formatDistanceKm, haversineDistanceKm, RADIUS_PRESETS } from '../../lib/geo';
import { OfflineLocationEntry, PointingLocationSource } from '../../types';
import { cn } from '../../lib/utils';
import LocalRadarPicker from './LocalRadarPicker';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional override callback — if provided, saves delivery address via callback */
  onSave?: (fullAddress: string) => Promise<void>;
  /** Initial tab when opening modal */
  initialTab?: 'pointing' | 'address';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function titleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFullAddress(street: string, city: string, pincode: string): string {
  return `${titleCase(street)}, ${titleCase(city)} - ${pincode}`;
}

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

export default function LocationPickerModal({
  isOpen,
  onClose,
  onSave,
  initialTab = 'pointing',
}: LocationPickerModalProps) {
  const { user } = useAuth();
  const {
    addresses,
    selectedAddress,
    saveAddress,
    setDefaultAddress,
    storeLocation,
    activeCenter,
    setPointingLocation,
    radiusKm,
    setRadiusKm,
  } = useAddress();

  const [modeTab, setModeTab] = useState<'pointing' | 'address'>(initialTab);

  // ─── Pointing Location Draft State ────────────────────────────────────────
  const [areaSearch, setAreaSearch] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftPincode, setDraftPincode] = useState('');
  const [draftLat, setDraftLat] = useState<number>(storeLocation.lat);
  const [draftLng, setDraftLng] = useState<number>(storeLocation.lng);
  const [draftSource, setDraftSource] = useState<PointingLocationSource>('preset');
  const [draftRadiusKm, setDraftRadiusKm] = useState<number>(radiusKm);
  const [showRadar, setShowRadar] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  // ─── Save Delivery Address Form State ─────────────────────────────────────
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [saveAs, setSaveAs] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [addrLat, setAddrLat] = useState<number | undefined>(undefined);
  const [addrLng, setAddrLng] = useState<number | undefined>(undefined);
  const [addrSource, setAddrSource] = useState<PointingLocationSource>('preset');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Sync draft state ONLY when modal transitions from closed -> open
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    setModeTab(onSave ? 'address' : initialTab);
    setAreaSearch('');
    setDraftRadiusKm(radiusKm);
    setShowRadar(false);
    setGpsMessage(null);

    if (activeCenter) {
      setDraftLabel(activeCenter.label);
      setDraftCity(activeCenter.city || '');
      setDraftPincode(activeCenter.pincode || '');
      setDraftLat(activeCenter.lat);
      setDraftLng(activeCenter.lng);
      setDraftSource(activeCenter.source);
    } else {
      setDraftLabel('Chinnabatakanapalli (Store Area)');
      setDraftCity('Krishnagiri');
      setDraftPincode('635119');
      setDraftLat(storeLocation.lat);
      setDraftLng(storeLocation.lng);
      setDraftSource('preset');
    }

    // Reset address form
    setStreet('');
    setCity('');
    setPincode('');
    setSaveAs('Home');
    setAddrLat(undefined);
    setAddrLng(undefined);
    setAddrSource('preset');
    setErrors({});
    setTouched({});
    setSaveSuccess(false);
    setSaveError('');
  }, [isOpen, initialTab, onSave, radiusKm, activeCenter, storeLocation.lat, storeLocation.lng]);

  // ─── Derived values ───────────────────────────────────────────────────────
  const searchResults = useMemo(() => searchOfflineLocations(areaSearch), [areaSearch]);

  const draftDistanceKm = useMemo(
    () => haversineDistanceKm(draftLat, draftLng, storeLocation.lat, storeLocation.lng),
    [draftLat, draftLng, storeLocation.lat, storeLocation.lng]
  );

  const isDraftInRange = draftDistanceKm <= draftRadiusKm;

  const isFormValid = useMemo(() => {
    return Object.keys(validate(street, city, pincode)).length === 0;
  }, [street, city, pincode]);

  const resolvedAddressPreview = useMemo(() => {
    if (typeof addrLat === 'number' && typeof addrLng === 'number') {
      return {
        lat: addrLat,
        lng: addrLng,
        matchLabel: addrSource === 'gps' ? 'GPS pin' : addrSource === 'pin' ? 'Radar pin' : 'Selected area',
      };
    }
    const resolved = resolveOfflineCoordinates({ street, city, pincode });
    if (resolved) {
      return {
        lat: resolved.lat,
        lng: resolved.lng,
        matchLabel: `Matched by ${resolved.matchType} (${resolved.matchedEntry.name})`,
      };
    }
    return null;
  }, [addrLat, addrLng, addrSource, street, city, pincode]);

  // ─── Handlers: Pointing Location Tab ──────────────────────────────────────

  const selectOfflinePreset = (entry: OfflineLocationEntry) => {
    setDraftLabel(entry.name.split('(')[0].trim());
    setDraftCity(entry.city);
    setDraftPincode(entry.pincode);
    setDraftLat(entry.lat);
    setDraftLng(entry.lng);
    setDraftSource('preset');
    setGpsMessage(null);
  };

  const handleUseCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setGpsMessage({
        type: 'error',
        text: 'GPS geolocation is not supported on this browser. Please select an area or use the Radar picker.',
      });
      return;
    }

    setGpsLoading(true);
    setGpsMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const nearest = findNearestOfflineLocation(lat, lng);

        setDraftLat(lat);
        setDraftLng(lng);
        setDraftSource('gps');
        setDraftCity(nearest.entry.city);
        setDraftPincode(nearest.entry.pincode);
        setDraftLabel(
          nearest.distanceKm <= 2
            ? `${nearest.entry.name.split('(')[0].trim()} (GPS)`
            : `Near ${nearest.entry.name.split('(')[0].trim()}`
        );
        setGpsMessage({
          type: 'info',
          text: `GPS locked (±${Math.round(pos.coords.accuracy)}m) near ${nearest.entry.name.split('(')[0].trim()}.`,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Pick an area below or drop a pin on the Radar.'
            : err.code === err.TIMEOUT
              ? 'GPS timed out. Pick an area below or use the Radar picker.'
              : 'Unable to detect GPS coordinates right now. Pick an area below or use the Radar picker.';
        setGpsMessage({ type: 'error', text: msg });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleRadarChange = (newLat: number, newLng: number) => {
    const nearest = findNearestOfflineLocation(newLat, newLng);
    setDraftLat(newLat);
    setDraftLng(newLng);
    setDraftSource('pin');
    setDraftCity(nearest.entry.city);
    setDraftPincode(nearest.entry.pincode);
    setDraftLabel(
      nearest.distanceKm <= 1.5
        ? `${nearest.entry.name.split('(')[0].trim()} (Pin)`
        : `Pin near ${nearest.entry.name.split('(')[0].trim()}`
    );
  };

  const handleApplyPointingLocation = () => {
    setRadiusKm(draftRadiusKm);
    setPointingLocation({
      label: draftLabel || 'Pinned Location',
      city: draftCity,
      pincode: draftPincode,
      lat: draftLat,
      lng: draftLng,
      source: draftSource,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  const handleSwitchToSaveAddress = () => {
    if (!street.trim() && draftLabel) {
      setStreet(draftLabel.replace(/\s*\((GPS|Pin|Store Area)\)\s*/g, ''));
    }
    if (!city.trim() && draftCity) setCity(draftCity);
    if (!pincode.trim() && draftPincode) setPincode(draftPincode);
    setAddrLat(draftLat);
    setAddrLng(draftLng);
    setAddrSource(draftSource);
    setModeTab('address');
  };

  // ─── Handlers: Save Delivery Address Tab ──────────────────────────────────

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(street, city, pincode));
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');

    const validationErrors = validate(street, city, pincode);
    setErrors(validationErrors);
    setTouched({ street: true, city: true, pincode: true });

    if (Object.keys(validationErrors).length > 0) return;

    if (!user || user.uid.startsWith('demo-')) {
      // Allow pointing even if guest, but inform clearly about saving delivery addresses
      const fallback = resolvedAddressPreview;
      if (fallback) {
        setPointingLocation({
          label: titleCase(street.trim()),
          city: titleCase(city.trim()),
          pincode: pincode.trim(),
          lat: fallback.lat,
          lng: fallback.lng,
          source: addrSource,
          updatedAt: new Date().toISOString(),
        });
      }
      onClose();
      return;
    }

    setSaving(true);
    try {
      const fullAddress = buildFullAddress(street, city, pincode);
      const resolved = resolvedAddressPreview;

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
          ...(resolved ? { lat: resolved.lat, lng: resolved.lng, locationSource: addrSource } : {}),
          isDefault: true,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
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
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] md:max-w-lg md:mx-auto md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />

            {/* Modal Header */}
            <div className="px-6 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">
                    {modeTab === 'pointing' ? 'Set Pointing Location' : 'Save Delivery Address'}
                  </h2>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">
                    {modeTab === 'pointing'
                      ? 'Point your area & radius to check store distance and stock offline'
                      : 'Save a full delivery address for checkout'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setModeTab('pointing')}
                  className={cn(
                    'py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                    modeTab === 'pointing'
                      ? 'bg-white text-[#8B0000] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  Point Location
                </button>
                <button
                  type="button"
                  onClick={() => setModeTab('address')}
                  className={cn(
                    'py-2 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                    modeTab === 'address'
                      ? 'bg-white text-[#8B0000] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save Address
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {modeTab === 'pointing' ? (
                <>
                  {/* GPS + Radar Action Row */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={gpsLoading}
                      className="py-3 px-3 rounded-xl border-2 border-red-100 bg-red-50/70 hover:bg-red-50 text-[#8B0000] font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                    >
                      {gpsLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Navigation className="w-4 h-4" />
                      )}
                      {gpsLoading ? 'Locating...' : 'Use Current GPS'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRadar(!showRadar)}
                      className={cn(
                        'py-3 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95',
                        showRadar
                          ? 'border-[#8B0000] bg-[#8B0000] text-white'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800'
                      )}
                    >
                      <Radar className="w-4 h-4" />
                      {showRadar ? 'Hide Radar Pin' : 'Radar & Coords'}
                    </button>
                  </div>

                  {/* GPS Status Message */}
                  {gpsMessage && (
                    <div
                      className={cn(
                        'rounded-xl p-3 text-xs font-bold flex items-start gap-2 border',
                        gpsMessage.type === 'error'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-green-50 border-green-200 text-green-700'
                      )}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{gpsMessage.text}</span>
                    </div>
                  )}

                  {/* Optional Local Radar Picker */}
                  {showRadar && (
                    <LocalRadarPicker
                      storeLat={storeLocation.lat}
                      storeLng={storeLocation.lng}
                      storeName={storeLocation.name}
                      maxRadiusKm={storeLocation.maxRadiusKm}
                      radiusKm={draftRadiusKm}
                      lat={draftLat}
                      lng={draftLng}
                      onChange={handleRadarChange}
                      mode="customer"
                    />
                  )}

                  {/* Radius Pills */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        Search Radius
                      </label>
                      <span className="text-[10px] font-bold text-gray-500">
                        Store standard range: {storeLocation.maxRadiusKm} km
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {RADIUS_PRESETS.map((km) => (
                        <button
                          key={km}
                          type="button"
                          onClick={() => setDraftRadiusKm(km)}
                          className={cn(
                            'px-3.5 py-2 rounded-xl text-xs font-black transition-all border',
                            draftRadiusKm === km
                              ? 'bg-[#8B0000] text-white border-[#8B0000] shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                          )}
                        >
                          {km} km
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Saved Addresses Quick Pick */}
                  {user && addresses.length > 0 && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                        Your Saved Addresses
                      </label>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {addresses.map((addr) => {
                          const resolved = resolveAddressCoordinates(addr);
                          const dist = resolved
                            ? haversineDistanceKm(resolved.lat, resolved.lng, storeLocation.lat, storeLocation.lng)
                            : null;
                          const isSelected = selectedAddress?.id === addr.id;
                          return (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={async () => {
                                if (resolved) {
                                  setDraftLabel(addr.street || addr.name);
                                  setDraftCity(addr.city);
                                  setDraftPincode(addr.pincode);
                                  setDraftLat(resolved.lat);
                                  setDraftLng(resolved.lng);
                                  setDraftSource('saved_address');
                                  try {
                                    await setDefaultAddress(addr);
                                  } catch {
                                    /* non-blocking */
                                  }
                                } else {
                                  setGpsMessage({
                                    type: 'error',
                                    text: 'This saved address does not have coordinates yet. Pick an area or tap the Radar to set its pin.',
                                  });
                                }
                              }}
                              className={cn(
                                'shrink-0 px-3 py-2 rounded-xl border text-left transition-all max-w-[200px]',
                                isSelected
                                  ? 'border-red-300 bg-red-50/70'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase text-[#8B0000]">
                                  {addr.name}
                                </span>
                                {dist !== null && (
                                  <span className="text-[10px] font-bold text-gray-500">
                                    • {formatDistanceKm(dist, false)}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-gray-900 truncate mt-0.5">
                                {addr.street}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Offline Searchable Area / Pincode List */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                      Search Area, Town or Pincode (Offline)
                    </label>
                    <div className="relative mb-2.5">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="e.g. Soolagiri, 635119, Hosur, Rayakottai..."
                        value={areaSearch}
                        onChange={(e) => setAreaSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 outline-none focus:bg-white focus:border-[#8B0000]"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-2xl divide-y divide-gray-100 bg-white">
                      {searchResults.length === 0 ? (
                        <p className="p-4 text-xs text-gray-500 text-center font-medium">
                          No preset area matched. Open &ldquo;Radar &amp; Coords&rdquo; above or switch to &ldquo;Save Address&rdquo;.
                        </p>
                      ) : (
                        searchResults.map((entry) => {
                          const dist = haversineDistanceKm(
                            entry.lat,
                            entry.lng,
                            storeLocation.lat,
                            storeLocation.lng
                          );
                          const isSelected =
                            Math.abs(draftLat - entry.lat) < 0.0002 &&
                            Math.abs(draftLng - entry.lng) < 0.0002;
                          const inRad = dist <= draftRadiusKm;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => selectOfflinePreset(entry)}
                              className={cn(
                                'w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors',
                                isSelected ? 'bg-red-50/70' : 'hover:bg-gray-50'
                              )}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-900 truncate">
                                  {entry.name}
                                </p>
                                <p className="text-[10px] text-gray-500 truncate">
                                  {entry.area} • {entry.pincode}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  'shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full',
                                  inRad
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-500'
                                )}
                              >
                                {formatDistanceKm(dist, false)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Live Selection Summary */}
                  <div
                    className={cn(
                      'rounded-2xl p-3.5 border flex items-center justify-between gap-3',
                      isDraftInRange
                        ? 'bg-green-50 border-green-200'
                        : 'bg-amber-50 border-amber-200'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Active Pointing Center
                      </p>
                      <p className="text-sm font-black text-gray-900 truncate">
                        {draftLabel || 'Custom Pin'}
                      </p>
                      <p
                        className={cn(
                          'text-xs font-bold mt-0.5',
                          isDraftInRange ? 'text-green-700' : 'text-amber-800'
                        )}
                      >
                        {storeLocation.name}: {formatDistanceKm(draftDistanceKm)} •{' '}
                        {isDraftInRange
                          ? `Available within ${draftRadiusKm} km`
                          : `Outside ${draftRadiusKm} km radius`}
                      </p>
                    </div>
                    {user && (
                      <button
                        type="button"
                        onClick={handleSwitchToSaveAddress}
                        className="shrink-0 text-[10px] font-black uppercase tracking-wider bg-white border border-gray-200 hover:border-red-300 text-gray-700 px-2.5 py-2 rounded-xl"
                      >
                        Save Addr
                      </button>
                    )}
                  </div>

                  {/* Confirm Pointing Location */}
                  <button
                    type="button"
                    onClick={handleApplyPointingLocation}
                    className="ripple-btn w-full py-4 rounded-xl bg-premium-gradient text-white font-black uppercase tracking-wide flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(122,0,0,0.3)] active:scale-95 transition-all"
                  >
                    <span>Apply Location &amp; {draftRadiusKm} km Radius</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <form onSubmit={handleSaveAddress} className="space-y-4">
                  {/* Quick fill from offline dataset */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">
                      Quick-Fill Area (Optional)
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = searchOfflineLocations('').find((l) => l.id === e.target.value);
                        if (!chosen) return;
                        setStreet(chosen.area);
                        setCity(chosen.city);
                        setPincode(chosen.pincode);
                        setAddrLat(chosen.lat);
                        setAddrLng(chosen.lng);
                        setAddrSource('preset');
                      }}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-red-600"
                    >
                      <option value="">Choose nearby area/town to prefill...</option>
                      {searchOfflineLocations('').map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} — {loc.pincode}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Street & Area */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                      Street &amp; Area *
                    </label>
                    <div className="relative">
                      <MapPin className="w-5 h-5 text-red-600 absolute left-4 top-1/2 -translate-y-1/2 opacity-70" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Chinnabatakanapalli, Soolagiri TK"
                        value={street}
                        onChange={(e) => {
                          setStreet(e.target.value);
                          if (addrSource !== 'gps' && addrSource !== 'pin') {
                            setAddrLat(undefined);
                            setAddrLng(undefined);
                          }
                        }}
                        onBlur={() => handleBlur('street')}
                        className={cn(
                          'w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400',
                          touched.street && errors.street
                            ? 'border-red-400 bg-red-50/50 focus:border-red-600'
                            : 'border-transparent focus:border-red-600 focus:bg-white'
                        )}
                      />
                    </div>
                    {touched.street && errors.street && (
                      <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errors.street}
                      </p>
                    )}
                  </div>

                  {/* City & Pincode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          onChange={(e) => {
                            setCity(e.target.value.replace(/[^a-zA-Z\s]/g, ''));
                            if (addrSource !== 'gps' && addrSource !== 'pin') {
                              setAddrLat(undefined);
                              setAddrLng(undefined);
                            }
                          }}
                          onBlur={() => handleBlur('city')}
                          className={cn(
                            'w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400',
                            touched.city && errors.city
                              ? 'border-red-400 bg-red-50/50 focus:border-red-600'
                              : 'border-transparent focus:border-red-600 focus:bg-white'
                          )}
                        />
                      </div>
                      {touched.city && errors.city && (
                        <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errors.city}
                        </p>
                      )}
                    </div>

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
                          onChange={(e) => {
                            setPincode(e.target.value.replace(/\D/g, ''));
                            if (addrSource !== 'gps' && addrSource !== 'pin') {
                              setAddrLat(undefined);
                              setAddrLng(undefined);
                            }
                          }}
                          onBlur={() => handleBlur('pincode')}
                          className={cn(
                            'w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-2xl outline-none transition-all font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-400 tracking-widest',
                            touched.pincode && errors.pincode
                              ? 'border-red-400 bg-red-50/50 focus:border-red-600'
                              : 'border-transparent focus:border-red-600 focus:bg-white'
                          )}
                        />
                      </div>
                      {touched.pincode && errors.pincode && (
                        <p className="text-[11px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {errors.pincode}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Resolved Coordinate Info */}
                  {resolvedAddressPreview && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-blue-900 truncate">{resolvedAddressPreview.matchLabel}</p>
                        <p className="text-[10px] text-blue-700 font-medium">
                          Distance to {storeLocation.name}:{' '}
                          {formatDistanceKm(
                            haversineDistanceKm(
                              resolvedAddressPreview.lat,
                              resolvedAddressPreview.lng,
                              storeLocation.lat,
                              storeLocation.lng
                            )
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {typeof addrLat === 'number' && (addrSource === 'gps' || addrSource === 'pin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddrLat(undefined);
                              setAddrLng(undefined);
                              setAddrSource('preset');
                            }}
                            className="text-[10px] font-black uppercase text-gray-500 hover:text-gray-700 hover:underline"
                          >
                            Clear Pin
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setModeTab('pointing')}
                          className="text-[10px] font-black uppercase text-blue-700 hover:underline shrink-0"
                        >
                          Adjust Pin
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Save As */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">
                      Save As
                    </label>
                    <div className="flex gap-3">
                      {(['Home', 'Work', 'Other'] as const).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSaveAs(tag)}
                          className={cn(
                            'flex-1 py-2.5 px-3 rounded-2xl border-2 font-bold flex items-center justify-center gap-2 transition-all text-xs',
                            saveAs === tag
                              ? 'border-red-600 bg-red-50 text-red-600'
                              : 'border-gray-100 text-gray-500 hover:border-gray-200'
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
                  <div className="pt-1 pb-1">
                    <button
                      type="submit"
                      disabled={saving || saveSuccess || !isFormValid}
                      className={cn(
                        'ripple-btn w-full py-4 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-wide transition-all active:scale-95',
                        saveSuccess
                          ? 'bg-green-500 text-white shadow-[0_8px_20px_rgba(34,197,94,0.3)]'
                          : isFormValid
                            ? 'bg-premium-gradient text-white shadow-[0_8px_20px_rgba(122,0,0,0.3)] hover:shadow-[0_12px_25px_rgba(122,0,0,0.4)]'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      {saveSuccess ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" /> Address Saved!
                        </>
                      ) : saving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <span>Confirm Delivery Address</span> <ChevronRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
