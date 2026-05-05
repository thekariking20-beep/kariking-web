import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { UserAddress } from '../types';

// ─── localStorage cache keys ───────────────────────────────────────────────
const CACHE_KEY_ADDRESSES = 'kk_addresses_cache';
const CACHE_KEY_SELECTED = 'kk_selected_address_id';

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

/** Clear cache on logout */
function clearAddressCache() {
  localStorage.removeItem(CACHE_KEY_ADDRESSES);
  localStorage.removeItem(CACHE_KEY_SELECTED);
}

interface AddressContextType {
  /** All saved addresses for the current user */
  addresses: UserAddress[];
  /** The currently selected/default address */
  selectedAddress: UserAddress | null;
  /** Loading state */
  loading: boolean;
  /** Set an address as the default */
  setDefaultAddress: (address: UserAddress) => Promise<void>;
  /** Save a new address or update an existing one */
  saveAddress: (address: Omit<UserAddress, 'createdAt'> & { createdAt?: string }) => Promise<void>;
  /** Delete an address */
  deleteAddress: (id: string) => Promise<void>;
  /** Display string for the header — first line (street) */
  displayLocation: string;
  /** Sub-display — city + pincode */
  displayCity: string;
}

const AddressContext = createContext<AddressContextType | undefined>(undefined);

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Initialize from cache for instant display (no loading flash)
  const [addresses, setAddresses] = useState<UserAddress[]>(() => getCachedAddresses());
  const [loading, setLoading] = useState(true);

  // ─── Real-time listener on users/{uid}/addresses ──────────────────────────
  useEffect(() => {
    if (!user || user.uid.startsWith('demo-')) {
      setAddresses([]);
      clearAddressCache();
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/addresses`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserAddress);

      // Sort: selected first, then by createdAt desc
      data.sort((a, b) => {
        if (a.id === user?.selectedAddressId && b.id !== user?.selectedAddressId) return -1;
        if (a.id !== user?.selectedAddressId && b.id === user?.selectedAddressId) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });

      setAddresses(data);
      setCachedAddresses(data); // Persist to localStorage
      setLoading(false);
    }, (err) => {
      console.error('Address listener error:', err);
      // Fall back to cached data instead of showing empty
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // ─── Derived: selected address ─────────────────────────────────────────────
  const selectedAddress = addresses.find(a => a.id === user?.selectedAddressId) || addresses[0] || null;

  // ─── Display strings for header ────────────────────────────────────────────
  const displayLocation = selectedAddress
    ? selectedAddress.street || selectedAddress.fullAddress.split(',')[0].trim()
    : 'Set Location';

  const displayCity = selectedAddress
    ? `${selectedAddress.city || ''} - ${selectedAddress.pincode || ''}`.replace(/^ - $/, 'Tamil Nadu')
    : 'Tap to set address';

  // ─── Set default address ───────────────────────────────────────────────────
  const setDefaultAddress = useCallback(async (address: UserAddress) => {
    if (!user || user.uid.startsWith('demo-')) return;

    try {
      // Update selectedAddressId + defaultAddress (single source of truth sync)
      await updateDoc(doc(db, 'users', user.uid), {
        selectedAddressId: address.id,
        address: address.fullAddress,
      });
      // Cache the selection
      localStorage.setItem(CACHE_KEY_SELECTED, address.id);
    } catch (err) {
      console.error('Failed to set default address:', err);
      throw err; // Re-throw so caller can show error
    }
  }, [user]);

  // ─── Save address ─────────────────────────────────────────────────────────
  const saveAddress = useCallback(async (address: Omit<UserAddress, 'createdAt'> & { createdAt?: string }) => {
    if (!user || user.uid.startsWith('demo-')) return;

    const refId = address.id || Date.now().toString();
    const isFirst = addresses.length === 0;

    const newAddress: UserAddress = {
      ...address,
      id: refId,
      createdAt: address.createdAt || new Date().toISOString(),
    };

    // Optimistic update — show in UI immediately
    setAddresses(prev => {
      const existing = prev.findIndex(a => a.id === refId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newAddress;
        return updated;
      }
      return [newAddress, ...prev];
    });

    try {
      // Save to users/{uid}/addresses/{id}
      await setDoc(doc(db, `users/${user.uid}/addresses`, refId), newAddress);

      // If first address or explicitly default, sync to user root doc
      if (isFirst || address.isDefault) {
        await updateDoc(doc(db, 'users', user.uid), {
          selectedAddressId: refId,
          address: newAddress.fullAddress,
        });
        localStorage.setItem(CACHE_KEY_SELECTED, refId);
      }
    } catch (err) {
      console.error('Failed to save address:', err);
      // Rollback optimistic update
      setAddresses(prev => prev.filter(a => a.id !== refId));
      throw err; // Re-throw so caller can show error
    }
  }, [user, addresses]);

  // ─── Delete address ───────────────────────────────────────────────────────
  const deleteAddress = useCallback(async (id: string) => {
    if (!user || user.uid.startsWith('demo-')) return;

    // Optimistic removal
    const prevAddresses = [...addresses];
    setAddresses(prev => prev.filter(a => a.id !== id));

    try {
      await deleteDoc(doc(db, `users/${user.uid}/addresses`, id));

      // Auto fallback if the deleted address was selected
      if (user.selectedAddressId === id) {
        const remaining = prevAddresses.filter(a => a.id !== id);
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
      // Rollback
      setAddresses(prevAddresses);
      throw err;
    }
  }, [user, addresses]);

  return (
    <AddressContext.Provider value={{
      addresses,
      selectedAddress,
      loading,
      setDefaultAddress,
      saveAddress,
      deleteAddress,
      displayLocation,
      displayCity,
    }}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress() {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error('useAddress must be used within AddressProvider');
  return ctx;
}
