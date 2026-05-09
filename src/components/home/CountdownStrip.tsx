import React, { useState, useEffect, useCallback, memo } from 'react';
import { HomepageContent } from '../../types';
import { motion } from 'motion/react';
import { Tag, Copy, Clock, Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
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

function calcTimeLeft(endTime: string): TimeLeft {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    total: diff,
  };
}

const TimeUnit = memo(({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center">
    <div className="relative w-12 h-12 sm:w-14 sm:h-14 bg-white/15 backdrop-blur-md rounded-xl border border-white/20 flex items-center justify-center shadow-lg">
      <span className="text-white text-xl sm:text-2xl font-black tabular-nums leading-none">
        {String(value).padStart(2, '0')}
      </span>
    </div>
    <span className="text-white/60 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest mt-1.5">{label}</span>
  </div>
));
TimeUnit.displayName = 'TimeUnit';

const Separator = () => (
  <span className="text-white/50 text-xl sm:text-2xl font-black self-start mt-2.5 sm:mt-3 mx-0.5">:</span>
);

function SingleCountdown({ item }: { item: HomepageContent }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(item.countdownEndTime!));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (timeLeft.total <= 0) return;
    const id = setInterval(() => {
      const next = calcTimeLeft(item.countdownEndTime!);
      setTimeLeft(next);
      if (next.total <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [item.countdownEndTime, timeLeft.total]);

  const handleCopy = useCallback(() => {
    if (!item.couponCode) return;
    navigator.clipboard.writeText(item.couponCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [item.couponCode]);

  // Don't render expired campaigns
  if (timeLeft.total <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_8px_30px_rgba(139,0,0,0.25)]"
      style={{ background: 'linear-gradient(135deg, #1a0000 0%, #8B0000 40%, #D9381E 100%)' }}
    >
      {/* Animated glow */}
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-orange-500/15 blur-3xl animate-pulse" />
      <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-red-400/10 blur-3xl" />

      <div className="relative z-10 px-5 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
        {/* Left: Info */}
        <div className="flex-1 text-center sm:text-left min-w-0">
          {item.badgeLabel && (
            <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-400/15 border border-amber-400/20 px-2.5 py-1 rounded-full mb-2">
              <Flame className="w-3 h-3" />
              {item.badgeLabel}
            </span>
          )}
          <h3 className="text-white text-lg sm:text-xl font-black leading-tight">{item.title}</h3>
          {item.subtitle && (
            <p className="text-white/60 text-xs sm:text-sm mt-1 leading-relaxed max-w-md">{item.subtitle}</p>
          )}

          {/* Coupon + CTA row */}
          <div className="flex items-center gap-3 mt-3 justify-center sm:justify-start flex-wrap">
            {item.couponCode && (
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest transition-colors"
              >
                <Tag className="w-3 h-3" />
                {copied ? 'Copied!' : item.couponCode}
                {!copied && <Copy className="w-3 h-3 opacity-60" />}
              </button>
            )}
            {item.buttonText && (
              <Link
                to={item.redirectLink || '/products'}
                className="inline-flex items-center gap-1.5 bg-white text-red-800 font-black text-[10px] sm:text-xs uppercase tracking-widest px-4 py-1.5 rounded-lg hover:bg-amber-50 transition-colors shadow-md"
              >
                {item.buttonText}
              </Link>
            )}
          </div>
        </div>

        {/* Right: Timer */}
        <div className="flex items-center gap-1 shrink-0">
          <TimeUnit value={timeLeft.days} label="Days" />
          <Separator />
          <TimeUnit value={timeLeft.hours} label="Hrs" />
          <Separator />
          <TimeUnit value={timeLeft.minutes} label="Min" />
          <Separator />
          <TimeUnit value={timeLeft.seconds} label="Sec" />
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="h-1 bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500"
          animate={{ scaleX: [0.3, 1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: 'left' }}
        />
      </div>
    </motion.div>
  );
}

export default function CountdownStrip({ campaigns }: CountdownStripProps) {
  // Only render campaigns with valid future countdown end times
  const active = campaigns.filter(c => {
    if (!c.countdownEndTime) return false;
    return new Date(c.countdownEndTime).getTime() > Date.now();
  });

  if (!active.length) return null;

  return (
    <div className="space-y-4">
      {active.map(item => (
        <SingleCountdown key={item.id} item={item} />
      ))}
    </div>
  );
}
