import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, MapPin, Trash2, Home, Briefcase, 
  MapPin as OtherIcon, CheckCircle2 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { UserAddress } from '../types';
import LocationPickerModal from '../components/location/LocationPickerModal';
import { cn } from '../lib/utils';

export default function ManageAddresses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);

  // Use onSnapshot to read exactly from addresses/{uid}/userAddresses as requested
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `addresses/${user.uid}/userAddresses`));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as UserAddress);
      setAddresses(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleSetDefault = async (address: UserAddress) => {
    if (!user) return;
    // 1. Remove default from others in subcollection
    for (const a of addresses) {
      if (a.isDefault && a.id !== address.id) {
        await updateDoc(doc(db, `addresses/${user.uid}/userAddresses`, a.id), { isDefault: false });
      }
    }
    // 2. Set new default
    await updateDoc(doc(db, `addresses/${user.uid}/userAddresses`, address.id), { isDefault: true });
    // 3. Fallback sync to user doc for backwards Cart functionality
    await updateDoc(doc(db, 'users', user.uid), {
      address: address.fullAddress,
      locationLat: address.locationLat || null,
      locationLng: address.locationLng || null
    });
  };

  const handleDelete = async (id: string) => {
    if (!user || !window.confirm('Delete this address?')) return;
    await deleteDoc(doc(db, `addresses/${user.uid}/userAddresses`, id));
  };

  const handleSaveLocation = async (addressString: string, lat?: number, lng?: number) => {
    if (!user) return;
    try {
      const refId = editingAddress ? editingAddress.id : Date.now().toString();
      const isFirst = addresses.length === 0;

      const newAddress: UserAddress = {
        id: refId,
        tag: 'home',
        fullAddress: addressString,
        locationLat: lat || undefined,
        locationLng: lng || undefined,
        isDefault: editingAddress ? editingAddress.isDefault : isFirst,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, `addresses/${user.uid}/userAddresses`, refId), newAddress);
      
      if (newAddress.isDefault) {
        await handleSetDefault(newAddress);
      }
      
    } catch (e) {
      console.error(e);
      alert('Failed to save address.');
    }
  };

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-80px)] pb-24">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-20 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-50 text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-black text-gray-900 leading-none">Manage Addresses</h1>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => { setEditingAddress(null); setShowLocationModal(true); }}
          className="w-full bg-white border-2 border-dashed border-[#8B0000]/30 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-[#8B0000] hover:bg-red-50/50 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-bold text-sm tracking-wide">Add New Address</span>
        </motion.button>

        {loading ? (
          <p className="text-center text-gray-400 py-10 font-bold text-sm">Loading addresses...</p>
        ) : (
          <AnimatePresence>
            {addresses.map(addr => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={addr.id}
                className={cn(
                  "bg-white rounded-2xl p-5 border relative overflow-hidden transition-all shadow-sm",
                  addr.isDefault ? "border-[#8B0000]/30 shadow-[#8B0000]/5" : "border-gray-100"
                )}
              >
                {addr.isDefault && (
                  <div className="absolute top-0 right-0 py-1 pl-3 pr-4 rounded-bl-2xl bg-[#8B0000] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                    <CheckCircle2 className="w-3 h-3" /> Default
                  </div>
                )}
                
                <div className="flex gap-4">
                  <div className={cn(
                    "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center mt-1",
                    addr.isDefault ? "bg-red-50 text-[#8B0000]" : "bg-gray-50 text-gray-400"
                  )}>
                    {addr.tag === 'home' ? <Home className="w-5 h-5"/> : addr.tag === 'work' ? <Briefcase className="w-5 h-5"/> : <OtherIcon className="w-5 h-5"/>}
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-12">
                    <h3 className="font-bold text-gray-900 capitalize leading-none mb-1.5">{addr.tag} Address</h3>
                    <p className="text-sm text-gray-500 leading-snug break-words pr-2">{addr.fullAddress}</p>
                    
                    <div className="mt-4 flex gap-3">
                      {!addr.isDefault && (
                        <button onClick={() => handleSetDefault(addr)} className="text-[11px] font-bold text-[#8B0000] uppercase tracking-wider py-1">Set Default</button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-5 right-4 flex items-center gap-2">
                  <button onClick={() => handleDelete(addr.id)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {showLocationModal && (
          <LocationPickerModal
            isOpen={true}
            onClose={() => setShowLocationModal(false)}
            onSave={handleSaveLocation}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
