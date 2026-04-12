import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { HomepageContent } from '../../types';
import { Link } from 'react-router-dom';

interface BannerSliderProps {
  banners: HomepageContent[];
}

export default function BannerSlider({ banners }: BannerSliderProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((idx: number, dir?: number) => {
    setDirection(dir ?? (idx > current ? 1 : -1));
    setCurrent(idx);
  }, [current]);

  const next = useCallback(() => {
    const nextIdx = (current + 1) % banners.length;
    goTo(nextIdx, 1);
  }, [current, banners.length, goTo]);

  const prev = () => {
    const prevIdx = (current - 1 + banners.length) % banners.length;
    goTo(prevIdx, -1);
  };

  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(next, 3500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [next, banners.length]);

  const pauseTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const resumeTimer = () => {
    if (banners.length > 1) timerRef.current = setInterval(next, 3500);
  };

  const handleDragEnd = (e: any, { offset, velocity }: any) => {
    const swipe = Math.abs(offset.x) * velocity.x;
    if (swipe < -100) {
      next();
    } else if (swipe > 100) {
      prev();
    }
  };

  if (!banners.length) return null;

  const banner = banners[current];

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <div
      className="relative w-full h-[260px] md:h-[380px] rounded-3xl overflow-hidden select-none shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <AnimatePresence custom={direction} mode="popLayout">
        <motion.div
          key={current}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
        >
          {/* Background with Zoom Animation (Ken Burns effect) */}
          <motion.div
             initial={{ scale: 1 }}
             animate={{ scale: 1.1 }}
             transition={{ duration: 10, ease: "linear", repeat: Infinity, repeatType: "reverse" }}
             className="absolute inset-0"
          >
            {banner.imageUrl ? (
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-premium-gradient" />
            )}
          </motion.div>

          {/* Premium dark overlay with depth blur for luxury feel */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Content */}
          <div className="relative h-full flex flex-col justify-center px-8 md:px-14 max-w-2xl">
            {banner.badgeLabel && (
              <motion.span 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, y: [0, -3, 0] }}
                transition={{ delay: 0.2, y: { duration: 2, repeat: Infinity, ease: "easeInOut" } }}
                className={`inline-flex items-center w-fit text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4 shadow-lg border border-white/20 ${banner.badgeColor && banner.badgeColor !== 'bg-red-600' ? banner.badgeColor : 'bg-premium-gradient'}`}
              >
                {banner.badgeLabel}
              </motion.span>
            )}
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-white text-2xl md:text-4xl font-black leading-tight mb-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            >
              {banner.title}
            </motion.h2>
            {banner.subtitle && (
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-white/80 text-sm md:text-base mb-6 max-w-sm leading-relaxed"
              >
                {banner.subtitle}
              </motion.p>
            )}
            {banner.buttonText && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Link
                  to={banner.redirectLink || '/products'}
                  className="ripple-btn inline-flex items-center gap-2 w-fit bg-premium-gradient text-white font-black text-sm px-8 py-4 rounded-xl hover:shadow-[0_0_30px_rgba(122,0,0,0.6)] transition-all shadow-lg border border-white/20 active:scale-95"
                >
                  {banner.buttonText}
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Prev / Next arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/15 hover:bg-white/30 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-all z-10 border border-white/20"
            aria-label="Previous banner"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/15 hover:bg-white/30 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-all z-10 border border-white/20"
            aria-label="Next banner"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`transition-all rounded-full ${
                i === current ? 'w-7 h-2.5 bg-gradient-to-r from-red-600 to-amber-400 shadow-[0_0_10px_rgba(255,215,0,0.5)] pointer-events-auto' : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/60 pointer-events-auto'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
