import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { MapPin, ChevronDown, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAddress } from '../context/AddressContext';
import logoImg from '../assets/kariking-logo.jpg';
import LocationPickerModal from './location/LocationPickerModal';

export default function MobileHeader() {
  const { user } = useAuth();
  const { displayLocation, displayCity } = useAddress();
  const navigate = useNavigate();
  const [isLocationOpen, setIsLocationOpen] = useState(false);

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 bg-gradient-to-r from-[#8B0000] via-[#A50000] to-[#C20000] shadow-[0_4px_20px_rgba(139,0,0,0.3)]">
        <div className="flex items-center justify-between px-4 py-2.5">
          {/* LEFT — Profile Avatar */}
          <Link to={user ? '/profile' : '/login'}>
            <motion.div
              whileTap={{ scale: 0.9 }}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 overflow-hidden"
            >
              <User className="w-5 h-5 text-white/90" />
            </motion.div>
          </Link>

          {/* CENTER — Kari [Logo] King */}
          <Link to="/" className="flex items-center justify-center gap-1.5">
            <span className="text-lg font-black text-white/90 tracking-tight drop-shadow-md">Kari</span>
            <img
              src={logoImg}
              alt="Kari King"
              className="h-11 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] rounded-full"
            />
            <span className="text-lg font-black text-amber-300 tracking-tight drop-shadow-md">King</span>
          </Link>

          {/* RIGHT — Location Selector */}
          <button
            onClick={() => setIsLocationOpen(true)}
            className="flex flex-col items-end max-w-[125px]"
          >
            <div className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3 text-amber-300 shrink-0" />
              <span className="text-white font-bold text-xs truncate max-w-[92px]">{displayLocation}</span>
              <ChevronDown className="w-3 h-3 text-white/60 shrink-0" />
            </div>
            <span className="text-[9px] text-white/75 font-medium truncate max-w-[125px]">{displayCity}</span>
          </button>
        </div>
      </header>

      <LocationPickerModal 
        isOpen={isLocationOpen} 
        onClose={() => setIsLocationOpen(false)} 
      />
    </>
  );
}
