import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import logoImg from '../assets/kariking-logo.jpg';

interface FullScreenLoaderProps {
  isVisible: boolean;
}

export default function FullScreenLoader({ isVisible }: FullScreenLoaderProps) {
  const [showFallback, setShowFallback] = useState(false);

  // If the animation takes too long or fails to render smoothly, show a guaranteed fallback spinner
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 2000); // 2 seconds safety fallback
    return () => clearTimeout(timer);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="root-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0b0b0b] overflow-hidden"
        >
          {/* Subtle background glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-64 h-64 bg-red-600/20 blur-[100px] rounded-full"
          />

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
                  className="w-32 md:w-40 h-auto rounded-full drop-shadow-[0_0_20px_rgba(220,38,38,0.4)] border-2 border-red-900/30"
                />
              </motion.div>
            </motion.div>

            {/* Premium Loading Indicator */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-8 flex flex-col items-center gap-3"
            >
              {/* Primary elegant loader line */}
              <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full"
                  initial={{ width: "0%", x: "-100%" }}
                  animate={{ 
                    width: ["0%", "50%", "100%", "50%", "0%"],
                    x: ["-100%", "0%", "100%", "200%", "300%"]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                />
              </div>

              {/* Fallback spinner if stuck */}
              <AnimatePresence>
                {showFallback && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-widest mt-2"
                  >
                    <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    <span>Loading securely...</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
