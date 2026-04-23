import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { UserAddress } from '../types';

interface AddressContextType {
  /** All saved addresses for the current user */
  addresses: UserAddress[];
  /** The currently selected/default address */
  selectedAddress: UserAddress | null;
  /** Loading state */
  loading: boolean;
  /** Set an address as the default (updates Firestore + user doc + local state) */
  setDefaultAddress: (address: UserAddress) => Promise<void>;
  /** Save a new address or update an existing one */
  saveAddress: (address: Omit<UserAddress, 'createdAt'> & { createdAt?: string }) => Promise<void>;
  /** Delete an address */
  deleteAddress: (id: string) => Promise<void>;
  /** Display string for the header */
  displayLocation: string;
  /** Sub-display for city */
  displayCity: string;
}

const AddressContext = createContext<AddressContextType | undefined>(undefined);

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Real-time listener on addresses subcollection ─────────────────────────
  useEffect(() => {
    if (!user || user.uid.startsWith('demo-')) {
      setAddresses([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, `addresses/${user.uid}/userAddresses`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserAddress);

      // Inject legacy root address if the subcollection is completely empty but root user profile has one
      if (data.length === 0 && user?.address) {
        data.push({
          id: user.selectedAddressId || 'legacy-address',
          tag: 'other',
          fullAddress: user.address,
          locationLat: user.locationLat,
          locationLng: user.locationLng,
          createdAt: new Date().toISOString(),
          isDefault: true // Just type compliance
        });
      }

      // Sort: selected first, then by createdAt desc
      data.sort((a, b) => {
        if (a.id === user?.selectedAddressId && b.id !== user?.selectedAddressId) return -1;
        if (a.id !== user?.selectedAddressId && b.id === user?.selectedAddressId) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      setAddresses(data);
      setLoading(false);
    }, (err) => {
      console.error('Address listener error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // ─── Derived: selected address ─────────────────────────────────────────────
  const selectedAddress = addresses.find(a => a.id === user?.selectedAddressId) || addresses[0] || null;

  // ─── Display strings for header ────────────────────────────────────────────
  const displayLocation = selectedAddress
    ? selectedAddress.fullAddress.split(',')[0].trim()
    : user?.address
    ? user.address.split(',')[0].trim()
    : 'Set Location';

  const displayCity = selectedAddress
    ? selectedAddress.fullAddress.split(',').slice(1).join(',').trim() || 'Tamil Nadu'
    : user?.address
    ? user.address.split(',').slice(1).join(',').trim() || 'Tamil Nadu'
    : 'Tap to set address';

  // ─── Set default address ───────────────────────────────────────────────────
  const setDefaultAddress = useCallback(async (address: UserAddress) => {
    if (!user || user.uid.startsWith('demo-')) return;

    // Direct single source of truth dispatch -> updates user doc, triggering live UI rerenders
    await updateDoc(doc(db, 'users', user.uid), {
      selectedAddressId: address.id,
    });

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

    await setDoc(doc(db, `addresses/${user.uid}/userAddresses`, refId), newAddress);

    // If this is the user's first address, or explicitly requested to be default, select it instantly
    if (isFirst || address.isDefault) {
      await updateDoc(doc(db, 'users', user.uid), { selectedAddressId: refId });
    }
  }, [user, addresses]);

  // ─── Delete address ───────────────────────────────────────────────────────
  const deleteAddress = useCallback(async (id: string) => {
    if (!user || user.uid.startsWith('demo-')) return;
    await deleteDoc(doc(db, `addresses/${user.uid}/userAddresses`, id));
    
    // Auto fallback -> if the deleted address was selected, wipe selectedAddressId so standard fallback applies
    if (user.selectedAddressId === id) {
      const remaining = addresses.filter(a => a.id !== id);
      if (remaining.length > 0) {
        await updateDoc(doc(db, 'users', user.uid), { selectedAddressId: remaining[0].id });
      } else {
        await updateDoc(doc(db, 'users', user.uid), { selectedAddressId: null });
      }
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
