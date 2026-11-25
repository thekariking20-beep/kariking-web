import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  PointingLocation,
  StoreLocation,
  StoreWithDistance,
  SystemSettings,
  UserAddress,
} from '../types';
import {
  buildPrimaryStoreLocation,
  DEFAULT_SYSTEM_SETTINGS,
  mergeSystemSettings,
} from '../lib/storeProfile';
import { evaluateStoresWithinRadius } from '../lib/geo';
import { resolveOfflineCoordinates } from '../config/locationDataset';

// ─── localStorage cache keys ───────────────────────────────────────────────
const CACHE_KEY_ADDRESSES = 'kk_addresses_cache';
const CACHE_KEY_SELECTED = 'kk_selected_address_id';
const CACHE_KEY_POINTING = 'kk_pointing_location';
const CACHE_KEY_SETTINGS = 'kk_system_settings_cache';

/** Read cached addresses from localStorage (instant load, no network) */
function getCachedAddresses(): UserAddress[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_ADDRESSES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Write addresses to localStorage cache */
function setCachedAddresses(addresses: UserAddress[]) {
  try {
    localStorage.setItem(CACHE_KEY_ADDRESSES, JSON.stringify(addresses));
  } catch { /* quota exceeded — non-critical */ }
}

/** Clear user-specific saved addresses cache on logout */
function clearAddressCache() {
  localStorage.removeItem(CACHE_KEY_ADDRESSES);
  localStorage.removeItem(CACHE_KEY_SELECTED);
}

function getCachedPointingLocation(): PointingLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_POINTING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PointingLocation;
    if (
      typeof parsed?.lat === 'number' &&
      Number.isFinite(parsed.lat) &&
      typeof parsed?.lng === 'number' &&
      Number.isFinite(parsed.lng) &&
      parsed?.label
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function getCachedRawSettings(): Partial<SystemSettings> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_SETTINGS);
    return raw ? (JSON.parse(raw) as Partial<SystemSettings>) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve coordinates for any UserAddress:
 * 1) Use stored lat/lng if available
 * 2) Otherwise attempt offline pincode/area/city match
 */
export function resolveAddressCoordinates(
  addr: Partial<UserAddress> | null | undefined
): { lat: number; lng: number; matchedBy: string } | null {
  if (!addr) return null;
  if (typeof addr.lat === 'number' && Number.isFinite(addr.lat) && typeof addr.lng === 'number' && Number.isFinite(addr.lng)) {
    return { lat: addr.lat, lng: addr.lng, matchedBy: addr.locationSource || 'saved' };
  }
  const resolved = resolveOfflineCoordinates({
    street: addr.street,
    city: addr.city,
    pincode: addr.pincode,
  });
  if (resolved) {
    return {
      lat: resolved.lat,
      lng: resolved.lng,
      matchedBy: resolved.matchType,
    };
  }
  return null;
}

interface AddressContextType {
  /** All saved addresses for the current user */
  addresses: UserAddress[];
  /** The currently selected/default saved delivery address */
  selectedAddress: UserAddress | null;
  /** Loading state for user saved addresses */
  loading: boolean;
  /** Set an address as the default */
  setDefaultAddress: (address: UserAddress) => Promise<void>;
  /** Save a new address or update an existing one */
  saveAddress: (address: Omit<UserAddress, 'createdAt'> & { createdAt?: string }) => Promise<void>;
  /** Delete an address */
  deleteAddress: (id: string) => Promise<void>;
  /** Display string for the header — active pointing label or street */
  displayLocation: string;
  /** Sub-display — distance + radius or city + pincode */
  displayCity: string;

  /** Live Admin System Settings (business, orders, delivery) */
  systemSettings: SystemSettings;
  /** Raw Firestore settings doc (used to detect untouched legacy placeholders) */
  rawSystemSettings: Partial<SystemSettings> | null;
  /** Primary store location with resolved coordinates */
  storeLocation: StoreLocation;
  /** Store list evaluated by Haversine (extensible to multiple stores later) */
  storeLocations: StoreLocation[];
  /** Active center location ("pointing address") for radius & product availability */
  pointingLocation: PointingLocation | null;
  /** Effective coordinates used for filtering (pointingLocation, or resolved selectedAddress fallback) */
  activeCenter: PointingLocation | null;
  /** Update the active pointing address */
  setPointingLocation: (loc: PointingLocation) => void;
  /** Clear active pointing address */
  clearPointingLocation: () => void;
  /** Currently chosen search radius in km */
  radiusKm: number;
  /** Update search radius in km */
  setRadiusKm: (km: number) => void;
  /** All active stores evaluated with Haversine distance, sorted nearest to farthest */
  evaluatedStores: StoreWithDistance[];
  /** Subset of evaluatedStores within `radiusKm` */
  matchingStores: StoreWithDistance[];
  /** Nearest store overall (even if outside `radiusKm`) */
  nearestStore: StoreWithDistance | null;
  /** True if browsing is permitted without range block (either no center set yet, or >=1 store in radius) */
  isStoreInRange: boolean;
  /** True ONLY when a center location is set AND zero stores lie within `radiusKm` */
  isOutsideSelectedRadius: boolean;
}

const AddressContext = createContext<AddressContextType | undefined>(undefined);

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Initialize from cache for instant display (no loading flash)
  const [addresses, setAddresses] = useState<UserAddress[]>(() => getCachedAddresses());
  const [loading, setLoading] = useState(true);
  const [rawSystemSettings, setRawSystemSettings] = useState<Partial<SystemSettings> | null>(() =>
    getCachedRawSettings()
  );
  const [pointingLocation, setPointingLocationState] = useState<PointingLocation | null>(() =>
    getCachedPointingLocation()
  );

  // ─── Real-time listener on settings/system (public read allowed in rules) ───
  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'system');
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SystemSettings>;
          setRawSystemSettings(data);
          try {
            localStorage.setItem(CACHE_KEY_SETTINGS, JSON.stringify(data));
          } catch { /* ignore */ }
        }
      },
      (err) => {
        console.warn('System settings listener warning:', err?.code || err);
      }
    );

    return () => unsub();
  }, []);

  // ─── Real-time listener on users/{uid}/addresses ──────────────────────────
  useEffect(() => {
    if (!user || user.uid.startsWith('demo-')) {
      setAddresses([]);
      clearAddressCache();
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/addresses`));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserAddress);

        // Sort: selected first, then by createdAt desc
        data.sort((a, b) => {
          if (a.id === user?.selectedAddressId && b.id !== user?.selectedAddressId) return -1;
          if (a.id !== user?.selectedAddressId && b.id === user?.selectedAddressId) return 1;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        setAddresses(data);
        setCachedAddresses(data);
        setLoading(false);
      },
      (err) => {
        console.error('Address listener error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  // ─── Derived: system settings & stores ────────────────────────────────────
  const systemSettings = useMemo(() => mergeSystemSettings(rawSystemSettings), [rawSystemSettings]);

  const storeLocation = useMemo(
    () => buildPrimaryStoreLocation(systemSettings, rawSystemSettings),
    [systemSettings, rawSystemSettings]
  );

  const storeLocations = useMemo(() => [storeLocation], [storeLocation]);

  // Delivery radius is strictly controlled by Admin -> Delivery Settings
  const radiusKm = systemSettings.delivery.maxRadiusKm || DEFAULT_SYSTEM_SETTINGS.delivery.maxRadiusKm;

  // ─── Derived: selected saved address ──────────────────────────────────────
  const selectedAddress = addresses.find((a) => a.id === user?.selectedAddressId) || addresses[0] || null;

  // ─── Derived: effective pointing center ───────────────────────────────────
  const activeCenter = useMemo<PointingLocation | null>(() => {
    if (pointingLocation) return pointingLocation;
    if (selectedAddress) {
      const coords = resolveAddressCoordinates(selectedAddress);
      if (coords) {
        return {
          label: selectedAddress.street || (selectedAddress.fullAddress || '').split(',')[0].trim() || selectedAddress.name || 'Saved Location',
          city: selectedAddress.city,
          pincode: selectedAddress.pincode,
          lat: coords.lat,
          lng: coords.lng,
          source: 'saved_address',
          matchedBy: coords.matchedBy,
          updatedAt: selectedAddress.createdAt,
        };
      }
    }
    return null;
  }, [pointingLocation, selectedAddress]);

  // ─── Haversine store evaluation ───────────────────────────────────────────
  const evaluatedStores = useMemo<StoreWithDistance[]>(() => {
    if (!activeCenter) return [];
    return evaluateStoresWithinRadius(activeCenter.lat, activeCenter.lng, radiusKm, storeLocations);
  }, [activeCenter, radiusKm, storeLocations]);

  const matchingStores = useMemo(
    () => evaluatedStores.filter((s) => s.inSelectedRadius),
    [evaluatedStores]
  );

  const nearestStore = evaluatedStores[0] || null;
  const isOutsideSelectedRadius = Boolean(activeCenter && matchingStores.length === 0);
  const isStoreInRange = !isOutsideSelectedRadius;

  // ─── Pointing Location & Radius Setters ───────────────────────────────────
  const setPointingLocation = useCallback((loc: PointingLocation) => {
    setPointingLocationState(loc);
    try {
      localStorage.setItem(CACHE_KEY_POINTING, JSON.stringify(loc));
    } catch { /* ignore */ }
  }, []);

  const clearPointingLocation = useCallback(() => {
    setPointingLocationState(null);
    localStorage.removeItem(CACHE_KEY_POINTING);
  }, []);

  const setRadiusKm = useCallback((_km: number) => {
    // Radius is governed by Admin Delivery Settings (`systemSettings.delivery.maxRadiusKm`)
  }, []);

  // ─── Display strings for header ────────────────────────────────────────────
  const displayLocation = activeCenter
    ? activeCenter.label
    : selectedAddress
      ? selectedAddress.street || (selectedAddress.fullAddress || '').split(',')[0].trim() || selectedAddress.name || 'Saved Location'
      : 'Set Location';

  const displayCity = activeCenter
    ? [activeCenter.city, activeCenter.pincode].filter(Boolean).join(' - ') ||
      (selectedAddress ? [selectedAddress.city, selectedAddress.pincode].filter(Boolean).join(' - ') : 'Tamil Nadu')
    : selectedAddress
      ? [selectedAddress.city, selectedAddress.pincode].filter(Boolean).join(' - ') || 'Tamil Nadu'
      : 'Tap to set location';

  // ─── Set default address ───────────────────────────────────────────────────
  const setDefaultAddress = useCallback(async (address: UserAddress) => {
    if (!user || user.uid.startsWith('demo-')) return;

    const coords = resolveAddressCoordinates(address);
    try {
      const userUpdates: Record<string, any> = {
        selectedAddressId: address.id,
        address: address.fullAddress,
      };
      if (coords) {
        userUpdates.locationLat = coords.lat;
        userUpdates.locationLng = coords.lng;
      }

      await updateDoc(doc(db, 'users', user.uid), userUpdates);
      localStorage.setItem(CACHE_KEY_SELECTED, address.id);

      if (coords) {
        setPointingLocation({
          label: address.street || (address.fullAddress || '').split(',')[0].trim() || address.name || 'Saved Location',
          city: address.city,
          pincode: address.pincode,
          lat: coords.lat,
          lng: coords.lng,
          source: 'saved_address',
          matchedBy: coords.matchedBy,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to set default address:', err);
      throw err;
    }
  }, [user, setPointingLocation]);

  // ─── Save address ─────────────────────────────────────────────────────────
  const saveAddress = useCallback(async (address: Omit<UserAddress, 'createdAt'> & { createdAt?: string }) => {
    if (!user || user.uid.startsWith('demo-')) return;

    const refId = address.id || Date.now().toString();
    const isFirst = addresses.length === 0;
    const coords = resolveAddressCoordinates(address);

    const newAddress: UserAddress = {
      ...address,
      id: refId,
      ...(coords ? { lat: coords.lat, lng: coords.lng, locationSource: address.locationSource || 'preset' } : {}),
      createdAt: address.createdAt || new Date().toISOString(),
    };

    // Optimistic update — show in UI immediately
    setAddresses((prev) => {
      const existing = prev.findIndex((a) => a.id === refId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newAddress;
        return updated;
      }
      return [newAddress, ...prev];
    });

    try {
      await setDoc(doc(db, `users/${user.uid}/addresses`, refId), newAddress);

      if (isFirst || address.isDefault) {
        const userUpdates: Record<string, any> = {
          selectedAddressId: refId,
          address: newAddress.fullAddress,
        };
        if (coords) {
          userUpdates.locationLat = coords.lat;
          userUpdates.locationLng = coords.lng;
        }
        await updateDoc(doc(db, 'users', user.uid), userUpdates);
        localStorage.setItem(CACHE_KEY_SELECTED, refId);
      }

      if (coords) {
        setPointingLocation({
          label: newAddress.street || (newAddress.fullAddress || '').split(',')[0].trim() || newAddress.name || 'Saved Location',
          city: newAddress.city,
          pincode: newAddress.pincode,
          lat: coords.lat,
          lng: coords.lng,
          source: address.locationSource || 'saved_address',
          matchedBy: coords.matchedBy,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to save address:', err);
      setAddresses((prev) => prev.filter((a) => a.id !== refId));
      throw err;
    }
  }, [user, addresses, setPointingLocation]);

  // ─── Delete address ───────────────────────────────────────────────────────
  const deleteAddress = useCallback(async (id: string) => {
    if (!user || user.uid.startsWith('demo-')) return;

    const prevAddresses = [...addresses];
    setAddresses((prev) => prev.filter((a) => a.id !== id));

    try {
      await deleteDoc(doc(db, `users/${user.uid}/addresses`, id));

      if (user.selectedAddressId === id) {
        const remaining = prevAddresses.filter((a) => a.id !== id);
        if (remaining.length > 0) {
          await updateDoc(doc(db, 'users', user.uid), {
            selectedAddressId: remaining[0].id,
            address: remaining[0].fullAddress,
          });
        } else {
          await updateDoc(doc(db, 'users', user.uid), {
            selectedAddressId: null,
            address: null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to delete address:', err);
      setAddresses(prevAddresses);
      throw err;
    }
  }, [user, addresses]);

  return (
    <AddressContext.Provider
      value={{
        addresses,
        selectedAddress,
        loading,
        setDefaultAddress,
        saveAddress,
        deleteAddress,
        displayLocation,
        displayCity,
        systemSettings,
        rawSystemSettings,
        storeLocation,
        storeLocations,
        pointingLocation,
        activeCenter,
        setPointingLocation,
        clearPointingLocation,
        radiusKm,
        setRadiusKm,
        evaluatedStores,
        matchingStores,
        nearestStore,
        isStoreInRange,
        isOutsideSelectedRadius,
      }}
    >
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress() {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error('useAddress must be used within AddressProvider');
  return ctx;
}
