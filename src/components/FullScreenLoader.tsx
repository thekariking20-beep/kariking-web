import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import logoImg from '../assets/kariking-logo.jpg';

interface FullScreenLoaderProps {
  isVisible: boolean;
}

export default function FullScreenLoader({ isVisible }: FullScreenLoaderProps) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="root-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f8f8f8] overflow-hidden"
        >
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo with pulse animation */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <img 
                  src={logoImg} 
                  alt="Kari King Loading" 
                  className="w-28 md:w-36 h-auto rounded-full shadow-xl border-2 border-red-100"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </motion.div>
            </motion.div>

            {/* Loading Indicator */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-8 flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 border-4 border-gray-200 border-t-red-600 rounded-full animate-spin" />

              <AnimatePresence>
                {showFallback && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-2"
                  >
                    Loading securely...
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

