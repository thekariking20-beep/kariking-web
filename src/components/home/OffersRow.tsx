import React from 'react';
import { HomepageContent } from '../../types';
import { motion } from 'motion/react';
import { Tag, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

interface OffersRowProps {
  offers: HomepageContent[];
}

const PALETTE = [
  { bg: 'from-red-600 to-rose-500', badge: 'bg-white/20', text: 'text-white' },
  { bg: 'from-orange-500 to-amber-400', badge: 'bg-white/20', text: 'text-white' },
  { bg: 'from-green-600 to-emerald-500', badge: 'bg-white/20', text: 'text-white' },
  { bg: 'from-purple-600 to-indigo-500', badge: 'bg-white/20', text: 'text-white' },
  { bg: 'from-blue-600 to-cyan-500', badge: 'bg-white/20', text: 'text-white' },
];

export default function OffersRow({ offers }: OffersRowProps) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    if (!scrollRef.current || offers.length <= 1) return;

    let timer: ReturnType<typeof setInterval>;

    if (!isPaused) {
      timer = setInterval(() => {
        if (scrollRef.current) {
          const container = scrollRef.current;
          // w-[280px] + gap-4 (16px) = 296
          const cardWidth = 296; 
          const maxScroll = container.scrollWidth - container.clientWidth;

          if (container.scrollLeft >= maxScroll - 10) {
            // Loop back to start smoothly
            container.scrollTo({ left: 0, behavior: 'smooth' });
          } else {
            // Scroll by one card width
            container.scrollBy({ left: cardWidth, behavior: 'smooth' });
          }
        }
      }, 3500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPaused, offers.length]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!offers.length) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <div className="bg-orange-100 p-2 rounded-xl">
          <Tag className="w-4 h-4 text-orange-600" />
        </div>
        <h2 className="text-xl font-black text-gray-900">Offers & Coupons</h2>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x snap-mandatory px-4 md:px-0"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {offers.map((offer, idx) => {
          const palette = PALETTE[idx % PALETTE.length];
          const isCopied = copied === offer.couponCode;

          return (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'snap-center shrink-0 w-[280px] min-h-[130px] rounded-2xl bg-gradient-to-br p-5 flex flex-col justify-between relative overflow-hidden transition-shadow shadow-[0_4px_15px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.12)]',
                palette.bg
              )}
            >
              {/* Decorative circle */}
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -right-2 -bottom-8 w-32 h-32 rounded-full bg-white/10" />
              
              {/* Shine effect */}
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />

              <div className="relative z-10">
                {offer.badgeLabel && (
                  <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 inline-block', palette.badge, palette.text)}>
                    {offer.badgeLabel}
                  </span>
                )}
                <h3 className="text-white font-black text-base leading-tight">{offer.title}</h3>
                {offer.subtitle && (
                  <p className="text-white/75 text-[11px] mt-1 leading-snug">{offer.subtitle}</p>
                )}
              </div>

              {offer.couponCode && (
                <button
                  onClick={() => handleCopy(offer.couponCode!)}
                  className="relative mt-3 flex items-center gap-2 w-fit bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur-sm rounded-lg px-3 py-1.5 text-white text-xs font-black uppercase tracking-widest transition-colors"
                >
                  <Tag className="w-3 h-3" />
                  {isCopied ? 'Copied!' : offer.couponCode}
                  {!isCopied && <Copy className="w-3 h-3 opacity-70" />}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
