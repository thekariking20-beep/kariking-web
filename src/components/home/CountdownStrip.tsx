import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { HomepageContent } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, Copy, Flame, ChevronRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CountdownStripProps {
  campaigns: HomepageContent[];
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

const ZERO: TimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

function calcTimeLeft(endTime: string | undefined): TimeLeft {
  if (!endTime) return ZERO;
  try {
    const end = new Date(endTime).getTime();
    if (isNaN(end)) return ZERO;
    const diff = end - Date.now();
    if (diff <= 0) return ZERO;
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff / 3600000) % 24),
      minutes: Math.floor((diff / 60000) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      total: diff,
    };
  } catch {
    return ZERO;
  }
}

// ── Animated digit with flip effect ─────────────────────────────────────────
const FlipDigit = memo(({ value }: { value: string }) => (
  <motion.span
    key={value}
    initial={{ y: -8, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: 8, opacity: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
    className="inline-block"
  >
    {value}
  </motion.span>
));
FlipDigit.displayName = 'FlipDigit';

// ── Single time unit box ────────────────────────────────────────────────────
const TimeUnit = memo(({ value, label }: { value: number; label: string }) => {
  const display = String(Math.max(0, value)).padStart(2, '0');
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] rounded-xl overflow-hidden">
        {/* Glassmorphism card */}
        <div className="absolute inset-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]" />
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-xl" />
        {/* Digit */}
        <div className="relative z-10 flex items-center justify-center h-full">
          <AnimatePresence mode="popLayout">
            <FlipDigit key={display} value={display} />
          </AnimatePresence>
        </div>
      </div>
      <span className="text-white/50 text-[7px] sm:text-[8px] font-bold uppercase tracking-[0.2em] mt-1.5">{label}</span>
    </div>
  );
});
TimeUnit.displayName = 'TimeUnit';

const TimeSep = () => (
  <span className="text-white/30 text-lg sm:text-xl font-black self-start mt-3.5 sm:mt-4 mx-0.5 select-none">:</span>
);

// ── Single Countdown Campaign Card ──────────────────────────────────────────
function SingleCountdown({ item }: { item: HomepageContent }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(item.countdownEndTime));
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);

    const initial = calcTimeLeft(item.countdownEndTime);
    setTimeLeft(initial);

    if (initial.total <= 0) return;

    intervalRef.current = setInterval(() => {
      const next = calcTimeLeft(item.countdownEndTime);
      setTimeLeft(next);
      if (next.total <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [item.countdownEndTime]);

  const handleCopy = useCallback(() => {
    if (!item.couponCode) return;
    navigator.clipboard.writeText(item.couponCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [item.couponCode]);

  // Don't render if expired or invalid
  if (timeLeft.total <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_8px_40px_rgba(139,0,0,0.3)]"
    >
      {/* Premium gradient background */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, #0a0000 0%, #3d0000 25%, #8B0000 55%, #c41e1e 85%, #D9381E 100%)' }}
      />

      {/* Animated ambient glow */}
      <motion.div
        className="absolute -right-20 -top-20 w-56 h-56 rounded-full bg-orange-500/20 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -left-16 -bottom-16 w-40 h-40 rounded-full bg-amber-400/10 blur-3xl"
        animate={{ scale: [1.1, 0.9, 1.1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Content */}
      <div className="relative z-10 px-5 sm:px-8 py-5 sm:py-7 flex flex-col sm:flex-row items-center gap-5 sm:gap-8">
        {/* Left: Campaign Info */}
        <div className="flex-1 text-center sm:text-left min-w-0">
          {item.badgeLabel && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-amber-300 bg-amber-400/15 border border-amber-400/25 px-3 py-1 rounded-full mb-2.5 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
            >
              <Zap className="w-3 h-3" />
              {item.badgeLabel}
            </motion.span>
          )}

          <h3 className="text-white text-xl sm:text-2xl font-black leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            {item.title}
          </h3>

          {item.subtitle && (
            <p className="text-white/55 text-xs sm:text-sm mt-1.5 leading-relaxed max-w-md">
              {item.subtitle}
            </p>
          )}

          {/* Coupon + CTA row */}
          <div className="flex items-center gap-3 mt-4 justify-center sm:justify-start flex-wrap">
            {item.couponCode && (
              <button
                onClick={handleCopy}
                className="group inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 backdrop-blur-sm rounded-lg px-3.5 py-2 text-white text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] transition-all duration-200"
              >
                <Tag className="w-3.5 h-3.5 opacity-70" />
                {copied ? '✓ Copied!' : item.couponCode}
                {!copied && <Copy className="w-3 h-3 opacity-40 group-hover:opacity-70 transition-opacity" />}
              </button>
            )}
            {item.buttonText && (
              <Link
                to={item.redirectLink || '/products'}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-amber-50 text-red-800 font-black text-[10px] sm:text-xs uppercase tracking-[0.1em] px-5 py-2 rounded-lg transition-all duration-200 shadow-[0_4px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] active:scale-95"
              >
                {item.buttonText}
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Right: Countdown Timer */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <TimeUnit value={timeLeft.days} label="Days" />
          <TimeSep />
          <TimeUnit value={timeLeft.hours} label="Hours" />
          <TimeSep />
          <TimeUnit value={timeLeft.minutes} label="Mins" />
          <TimeSep />
          <TimeUnit value={timeLeft.seconds} label="Secs" />
        </div>
      </div>

      {/* Animated bottom energy bar */}
      <div className="h-1 bg-black/30">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-400"
          animate={{ scaleX: [0.2, 1, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: 'left' }}
        />
      </div>
    </motion.div>
  );
}

// ── Main Countdown Strip ────────────────────────────────────────────────────
export default function CountdownStrip({ campaigns }: CountdownStripProps) {
  const [, setTick] = useState(0);

  // Re-evaluate active campaigns every 30 seconds to auto-hide expired ones
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Filter to only valid, future countdown campaigns
  const active = campaigns.filter(c => {
    if (!c.countdownEndTime) return false;
    try {
      const end = new Date(c.countdownEndTime).getTime();
      return !isNaN(end) && end > Date.now();
    } catch {
      return false;
    }
  });

  if (!active.length) return null;

  return (
    <div className="space-y-4">
      <AnimatePresence mode="popLayout">
        {active.map(item => (
          <SingleCountdown key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}
