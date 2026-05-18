import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { HomepageContent } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, Copy, ChevronRight, Zap, Clock } from 'lucide-react';
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

// ── Keyframe styles injected once ───────────────────────────────────────────
const COUNTDOWN_STYLES = `
@keyframes kk-cd-glow-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(255,140,0,0.2), 0 0 35px rgba(255,60,0,0.1), inset 0 1px 0 rgba(255,255,255,0.15); }
  50% { box-shadow: 0 0 24px rgba(255,140,0,0.4), 0 0 50px rgba(255,60,0,0.18), inset 0 1px 0 rgba(255,255,255,0.22); }
}
@keyframes kk-cd-urgency {
  0%, 100% { box-shadow: 0 0 18px rgba(255,60,0,0.35), 0 0 45px rgba(255,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.18); }
  50% { box-shadow: 0 0 32px rgba(255,60,0,0.55), 0 0 60px rgba(255,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25); }
}
@keyframes kk-cd-badge-shine {
  0% { transform: translateX(-120%) skewX(-20deg); }
  100% { transform: translateX(200%) skewX(-20deg); }
}
@keyframes kk-cd-btn-sweep {
  0% { transform: translateX(-130%) skewX(-15deg); }
  100% { transform: translateX(250%) skewX(-15deg); }
}
@keyframes kk-cd-colon-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes kk-cd-energy-sweep {
  0% { transform: scaleX(0.15); opacity: 0.6; }
  50% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(0.15); opacity: 0.6; }
}
@keyframes kk-cd-digit-glow {
  0%, 100% { text-shadow: 0 0 8px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.4); }
  50% { text-shadow: 0 0 16px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.4); }
}
`;

// ── Animated digit with flip effect ─────────────────────────────────────────
const FlipDigit = memo(({ value }: { value: string }) => (
  <motion.span
    key={value}
    initial={{ y: -10, opacity: 0, scale: 0.85 }}
    animate={{ y: 0, opacity: 1, scale: 1 }}
    exit={{ y: 10, opacity: 0, scale: 0.85 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    className="inline-block"
  >
    {value}
  </motion.span>
));
FlipDigit.displayName = 'FlipDigit';

// ── Single time unit box — Premium Glassmorphism ────────────────────────────
const TimeUnit = memo(({ value, label, isUrgent }: { value: number; label: string; isUrgent?: boolean }) => {
  const display = String(Math.max(0, value)).padStart(2, '0');
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-[56px] h-[60px] sm:w-[70px] sm:h-[74px] rounded-2xl overflow-hidden"
        style={{
          animation: isUrgent
            ? 'kk-cd-urgency 1.5s ease-in-out infinite'
            : 'kk-cd-glow-pulse 3s ease-in-out infinite',
        }}
      >
        {/* Multi-layer glassmorphism */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0.15) 100%)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            border: '1.5px solid rgba(255,255,255,0.2)',
          }}
        />

        {/* Top highlight edge */}
        <div
          className="absolute inset-x-0 top-0 h-[1px] rounded-t-2xl"
          style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.45) 50%, transparent 95%)' }}
        />

        {/* Inner top glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,200,100,0.12) 0%, transparent 50%)' }}
        />

        {/* Digit */}
        <div
          className="relative z-10 flex items-center justify-center h-full text-[24px] sm:text-[30px] font-black text-white"
          style={{
            fontFamily: "'Poppins', 'Inter', system-ui, sans-serif",
            fontFeatureSettings: '"tnum"',
            fontVariantNumeric: 'tabular-nums',
            animation: 'kk-cd-digit-glow 2s ease-in-out infinite',
            letterSpacing: '0.04em',
          }}
        >
          <AnimatePresence mode="popLayout">
            <FlipDigit key={display} value={display} />
          </AnimatePresence>
        </div>
      </div>

      {/* Label */}
      <span
        className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[0.2em] select-none"
        style={{ color: 'rgba(255,255,255,0.55)' }}
      >
        {label}
      </span>
    </div>
  );
});
TimeUnit.displayName = 'TimeUnit';

// ── Animated colon separator ────────────────────────────────────────────────
const TimeSep = () => (
  <span
    className="text-xl sm:text-2xl font-black self-start mt-4 sm:mt-5 mx-0.5 sm:mx-1 select-none"
    style={{
      color: 'rgba(255,200,100,0.7)',
      animation: 'kk-cd-colon-pulse 1s ease-in-out infinite',
      textShadow: '0 0 12px rgba(255,160,0,0.5)',
    }}
  >
    :
  </span>
);

// ── Single Countdown Campaign Card ──────────────────────────────────────────
const SingleCountdown: React.FC<{ item: HomepageContent }> = ({ item }) => {
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

  // Urgency mode: less than 1 hour remaining
  const isUrgent = timeLeft.total < 3600000;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[20px] sm:rounded-[24px]"
      style={{
        boxShadow: isUrgent
          ? '0 12px 50px rgba(200,0,0,0.35), 0 4px 20px rgba(0,0,0,0.25)'
          : '0 10px 45px rgba(139,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      {/* ── Cinematic layered background ────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: isUrgent
            ? 'linear-gradient(140deg, #1a0000 0%, #4a0000 20%, #8B0000 45%, #c41e1e 70%, #e63946 90%, #ff6b35 100%)'
            : 'linear-gradient(140deg, #0a0000 0%, #1a0505 15%, #3d0000 30%, #8B0000 55%, #b91c1c 75%, #D9381E 90%, #e85d3a 100%)',
        }}
      />

      {/* Noise texture overlay for depth */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Animated ambient glow orbs */}
      <motion.div
        className="absolute -right-16 -top-16 w-52 h-52 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,140,0,0.25) 0%, rgba(255,100,0,0.08) 50%, transparent 70%)', filter: 'blur(30px)' }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -left-12 -bottom-12 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,193,7,0.12) 0%, transparent 60%)', filter: 'blur(25px)' }}
        animate={{ scale: [1.15, 0.9, 1.15], opacity: [0.1, 0.22, 0.1] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Center highlight streak */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[60%] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 100%)',
        }}
      />

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-5 sm:px-8 pt-5 sm:pt-7 pb-4 sm:pb-6">
        {/* Top section: badge + clock icon */}
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          {/* Badge */}
          {item.badgeLabel && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] overflow-hidden rounded-full"
              style={{
                color: '#ffd700',
                background: 'linear-gradient(135deg, rgba(255,215,0,0.18) 0%, rgba(255,160,0,0.12) 100%)',
                border: '1px solid rgba(255,215,0,0.25)',
                padding: '5px 12px 5px 10px',
                boxShadow: '0 0 18px rgba(255,215,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <Zap className="w-3 h-3" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.5))' }} />
              {item.badgeLabel}
              {/* Animated shine sweep */}
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.25) 45%, transparent 55%)',
                  animation: 'kk-cd-badge-shine 3s ease-in-out 1.5s infinite',
                }}
              />
            </motion.span>
          )}

          {/* Clock icon */}
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Clock className="w-4 h-4 text-white/50" />
          </div>
        </div>

        {/* Title */}
        <h3
          className="text-[22px] sm:text-[26px] font-black leading-[1.15] tracking-[-0.01em]"
          style={{
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 30px rgba(255,80,0,0.1)',
          }}
        >
          {item.title}
        </h3>

        {/* Subtitle */}
        {item.subtitle && (
          <p
            className="text-xs sm:text-[13px] mt-1.5 sm:mt-2 leading-relaxed max-w-md font-medium"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {item.subtitle}
          </p>
        )}

        {/* Coupon + CTA row */}
        <div className="flex items-center gap-2.5 sm:gap-3 mt-4 sm:mt-5 flex-wrap">
          {item.couponCode && (
            <button
              onClick={handleCopy}
              className="group inline-flex items-center gap-1.5 rounded-xl px-3.5 sm:px-4 py-2 sm:py-2.5 transition-all duration-250 active:scale-95"
              style={{
                background: copied
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(34,197,94,0.1) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)',
                border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              }}
            >
              <Tag className="w-3.5 h-3.5 text-white/60" />
              <span
                className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em]"
                style={{ color: copied ? '#4ade80' : '#fff' }}
              >
                {copied ? '✓ Copied!' : item.couponCode}
              </span>
              {!copied && <Copy className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-opacity" />}
            </button>
          )}
          {item.buttonText && (
            <Link
              to={item.redirectLink || '/products'}
              className="group relative inline-flex items-center gap-1.5 font-black text-[10px] sm:text-[11px] uppercase tracking-[0.12em] px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all duration-250 active:scale-95 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
                color: '#7a0000',
                boxShadow: '0 4px 18px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1), 0 0 25px rgba(255,255,255,0.08)',
              }}
            >
              {item.buttonText}
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              {/* Sweep highlight */}
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(139,0,0,0.08) 48%, transparent 56%)',
                  animation: 'kk-cd-btn-sweep 3.5s ease-in-out 2s infinite',
                }}
              />
            </Link>
          )}
        </div>

        {/* ── Timer Section — Dark Panel ─────────────────────────────── */}
        <div
          className="mt-5 sm:mt-6 rounded-2xl px-3 sm:px-6 py-4 sm:py-5"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2), 0 -1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex items-start justify-center gap-1.5 sm:gap-2.5">
            <TimeUnit value={timeLeft.days} label="Days" isUrgent={isUrgent} />
            <TimeSep />
            <TimeUnit value={timeLeft.hours} label="Hours" isUrgent={isUrgent} />
            <TimeSep />
            <TimeUnit value={timeLeft.minutes} label="Mins" isUrgent={isUrgent} />
            <TimeSep />
            <TimeUnit value={timeLeft.seconds} label="Secs" isUrgent={isUrgent} />
          </div>
        </div>
      </div>

      {/* ── Bottom energy bar ──────────────────────────────────────── */}
      <div className="h-[3px]" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div
          className="h-full"
          style={{
            background: isUrgent
              ? 'linear-gradient(90deg, #ff4444, #ff8800, #ffcc00, #ff8800, #ff4444)'
              : 'linear-gradient(90deg, #fbbf24, #f97316, #ef4444, #f97316, #fbbf24)',
            animation: 'kk-cd-energy-sweep 3s ease-in-out infinite',
            transformOrigin: 'left',
          }}
        />
      </div>

      {/* Inject keyframes */}
      <style>{COUNTDOWN_STYLES}</style>
    </motion.div>
  );
};

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
