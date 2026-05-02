import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, MapPin, Trash2, Home, Briefcase, 
  CheckCircle2 
} from 'lucide-react';
import { useAddress } from '../context/AddressContext';
import LocationPickerModal from '../components/location/LocationPickerModal';
import { cn } from '../lib/utils';

const tagIcons = {
  Home: <Home className="w-5 h-5" />,
  Work: <Briefcase className="w-5 h-5" />,
  Other: <MapPin className="w-5 h-5" />,
};

export default function ManageAddresses() {
  const navigate = useNavigate();
  const { addresses, loading, setDefaultAddress, deleteAddress, selectedAddress } = useAddress();
  const [showLocationModal, setShowLocationModal] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this address?')) return;
    await deleteAddress(id);
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
          onClick={() => setShowLocationModal(true)}
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
                  addr.id === selectedAddress?.id ? "border-[#8B0000]/30 shadow-[#8B0000]/5" : "border-gray-100"
                )}
              >
                {addr.id === selectedAddress?.id && (
                  <div className="absolute top-0 right-0 py-1 pl-3 pr-4 rounded-bl-2xl bg-[#8B0000] text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-sm">
                    <CheckCircle2 className="w-3 h-3" /> Selected
                  </div>
                )}
                
                <div className="flex gap-4">
                  <div className={cn(
                    "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center mt-1",
                    addr.id === selectedAddress?.id ? "bg-red-50 text-[#8B0000]" : "bg-gray-50 text-gray-400"
                  )}>
                    {tagIcons[addr.name] || <MapPin className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-12">
                    <h3 className="font-bold text-gray-900 leading-none mb-1.5">{addr.name}</h3>
                    <p className="text-sm text-gray-700 font-medium leading-snug">{addr.street}</p>
                    <p className="text-sm text-gray-500 leading-snug">{addr.city} - {addr.pincode}</p>
                    
                    <div className="mt-4 flex gap-3">
                      {addr.id !== selectedAddress?.id && (
                        <button onClick={() => setDefaultAddress(addr)} className="text-[11px] font-bold text-[#8B0000] uppercase tracking-wider py-1">Set Selected</button>
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
          />
        )}
      </AnimatePresence>
    </div>
  );
}
