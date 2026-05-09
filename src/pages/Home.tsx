import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, HomepageContent, Coupon } from '../types';
import ProductCard from '../components/ProductCard';
import ProductGrid from '../components/ProductGrid';
import BannerSlider from '../components/home/BannerSlider';
import OffersRow from '../components/home/OffersRow';
import CountdownStrip from '../components/home/CountdownStrip';
import { motion } from 'motion/react';
import { Star, Clock, ShieldCheck, ChevronRight, Flame, ArrowRight, ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCategories } from '../context/CategoriesContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

// ─── Default CMS content used when Firestore has nothing yet ─────────────────
const DEFAULT_BANNERS: HomepageContent[] = [
  {
    id: 'default-1',
    type: 'banner',
    title: 'Welcome to Kari King 👑',
    subtitle: 'Fresh Organic Meat Delivered to Your Doorstep',
    imageUrl: 'https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=1600&q=80',
    buttonText: 'Order Now',
    redirectLink: '/products',
    badgeLabel: '🔥 Fresh Today',
    badgeColor: 'bg-red-600',
    isActive: true,
    order: 0,
    createdAt: '',
  },
];

const DEFAULT_OFFERS: HomepageContent[] = [
  {
    id: 'default-offer-1',
    type: 'offer',
    title: '₹100 OFF on First Order',
    subtitle: 'Use code at checkout • Min order ₹299',
    couponCode: 'KARI100',
    badgeLabel: '🎉 New User',
    isActive: true,
    order: 0,
    createdAt: '',
  },
  {
    id: 'default-offer-2',
    type: 'offer',
    title: 'Free Delivery above ₹500',
    subtitle: 'Add more to your cart and save on delivery',
    badgeLabel: '🚚 Free Ship',
    isActive: true,
    order: 1,
    createdAt: '',
  },
  {
    id: 'default-offer-3',
    type: 'offer',
    title: '10% OFF on Chicken Today',
    subtitle: 'Only valid on country chicken orders',
    couponCode: 'CHICKEN10',
    badgeLabel: '🍗 Today Only',
    isActive: true,
    order: 2,
    createdAt: '',
  },
];

const features = [
  { icon: ShieldCheck, title: 'Quality Assured', desc: '100% fresh & hygienic', gradient: 'from-emerald-500 to-green-600' },
  { icon: Clock, title: 'Fast Delivery', desc: 'Delivered in 45–60 mins', gradient: 'from-amber-500 to-orange-600' },
  { icon: Star, title: 'Best Prices', desc: 'Direct from farm to door', gradient: 'from-[#8B0000] to-[#DC2626]' },
];

export default function Home() {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const { categories: MAIN_CATEGORIES } = useCategories();

  const [products, setProducts] = useState<Product[]>(() => {
    // Instant load from cache
    try {
      const cached = sessionStorage.getItem('kk_products_cache');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [cmsContent, setCmsContent] = useState<HomepageContent[]>([]);
  const [firestoreCoupons, setFirestoreCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(() => !sessionStorage.getItem('kk_products_cache'));
  const [cmsLoading, setCmsLoading] = useState(true);
  const [favorites, setFavorites] = useState<Product[]>([]);

  // ─── Real-time products listener ───────────────────────────────────────────
  useEffect(() => {
    // Fetch all products (shows Available, Sold Out, and Coming Soon)
    const q = query(collection(db, 'products'));
    const unsub = onSnapshot(q, snap => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(prods);
      // Persist to sessionStorage for instant future loads
      try { sessionStorage.setItem('kk_products_cache', JSON.stringify(prods)); } catch {}
      if (user && prods.length > 0) {
        setFavorites([prods[0], prods[prods.length > 1 ? 1 : 0]]);
      }
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, [user]);

  // ─── Real-time CMS listener ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'homepageContent'), where('isActive', '==', true), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setCmsContent(snap.empty ? [] : snap.docs.map(d => ({ id: d.id, ...d.data() } as HomepageContent)));
      setCmsLoading(false);
    }, (err) => {
      console.error('[CMS] listener error:', err.code);
      setCmsContent([]);
      setCmsLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Real-time coupons listener ─────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'coupons'),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      const now = new Date();
      const activeCoupons = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Coupon))
        .filter(c => {
          // Hide expired coupons
          if (c.validTill) {
            const expiry = new Date(c.validTill);
            if (expiry < now) return false;
          }
          // Hide fully used coupons
          if (c.totalUsageLimit > 0 && c.usedCount >= c.totalUsageLimit) return false;
          return true;
        });
      setFirestoreCoupons(activeCoupons);
    }, err => {
      console.error('Coupons listener error:', err);
    });
    return () => unsub();
  }, []);

  // ─── Derived CMS slices ──────────────────────────────────────────────────────
  // Schedule-aware: filter out items not yet visible or already expired
  const visibleCms = useMemo(() => {
    const now = Date.now();
    return cmsContent.filter(c => {
      try {
        if (c.visibleFrom) {
          const from = new Date(c.visibleFrom).getTime();
          if (!isNaN(from) && from > now) return false;
        }
        if (c.visibleUntil) {
          const until = new Date(c.visibleUntil).getTime();
          if (!isNaN(until) && until < now) return false;
        }
      } catch { /* pass through on invalid dates */ }
      return true;
    });
  }, [cmsContent]);

  const banners = useMemo(() => {
    const fromCms = visibleCms.filter(c => c.type === 'banner');
    return fromCms.length ? fromCms : DEFAULT_BANNERS;
  }, [visibleCms]);

  const countdownCampaigns = useMemo(() => {
    return visibleCms.filter(c => {
      if (c.type !== 'countdown' && c.type !== 'seasonal') return false;
      if (!c.countdownEnabled || !c.countdownEndTime) return false;
      // Validate the date is parseable and in the future
      try {
        const end = new Date(c.countdownEndTime).getTime();
        return !isNaN(end) && end > Date.now();
      } catch { return false; }
    });
  }, [visibleCms]);

  // Seasonal campaigns (type: 'seasonal' without countdown, or with expired countdown)
  const seasonalCampaigns = useMemo(() => {
    return visibleCms.filter(c => 
      c.type === 'seasonal' && 
      (!c.countdownEnabled || !c.countdownEndTime)
    );
  }, [visibleCms]);

  // Convert Firestore coupons to OffersRow-compatible HomepageContent format
  const offers = useMemo(() => {
    const BADGE_LABELS = ['🔥 Hot Deal', '💰 Save Big', '🎉 Special', '⭐ Limited', '🏷️ Offer'];

    const couponOffers: HomepageContent[] = firestoreCoupons.map((c, idx) => ({
      id: `coupon-${c.id}`,
      type: 'offer' as const,
      title: c.discountType === 'flat' 
        ? `₹${c.discountValue} OFF` 
        : `${c.discountValue}% OFF`,
      subtitle: c.minOrder > 0 
        ? `Use code at checkout • Min order ₹${c.minOrder}` 
        : 'Use code at checkout',
      couponCode: c.code,
      badgeLabel: BADGE_LABELS[idx % BADGE_LABELS.length],
      isActive: true,
      order: idx,
      createdAt: c.createdAt,
    }));

    // Also include CMS-managed offers (from homepageContent collection)
    const cmsOffers = visibleCms.filter(c => c.type === 'offer');

    // Always show: Firestore coupons + CMS offers + default promos
    return [...couponOffers, ...cmsOffers, ...DEFAULT_OFFERS];
  }, [firestoreCoupons, visibleCms]);

  // ─── Product grouping ────────────────────────────────────────────────────────
  // Smart resolve: if product is in "Others" but name/sub matches a known category, reroute it
  const resolveCategory = (p: Product): string => {
    const raw = p.mainCategory || p.category || 'Others';
    if (raw !== 'Others') return raw;
    const name = (p.name || '').toLowerCase();
    const sub = (p.subCategory || '').toLowerCase();
    const check = name + ' ' + sub;
    if (check.includes('rabbit') || check.includes('rabit')) return 'Rabbit';
    if (check.includes('quail') || check.includes('kaadai') || check.includes('kadai')) return 'Quail';
    if (check.includes('turkey')) return 'Turkey';
    if (check.includes('duck')) return 'Ducks';
    if (check.includes('pickle')) return 'Pickles';
    if (check.includes('masala')) return 'Masala';
    return raw;
  };

  const grouped = useMemo(() => {
    const map: Record<string, Record<string, Product[]>> = {};
    products.forEach(p => {
      const resolved = resolveCategory(p);
      // Case-insensitive match against MAIN_CATEGORIES to prevent missing categories
      const matchingCat = MAIN_CATEGORIES.find(c => c.id.toLowerCase() === resolved.toLowerCase() || c.label.toLowerCase() === resolved.toLowerCase());
      const main = matchingCat ? matchingCat.id : resolved;

      const sub = p.subCategory || 'General';
      if (!map[main]) map[main] = {};
      if (!map[main][sub]) map[main][sub] = [];
      map[main][sub].push(p);
    });
    return map as Record<string, Record<string, Product[]>>;
  }, [products, MAIN_CATEGORIES]);

  const activeMains = useMemo(() => {
    const mains: any[] = [];
    Object.keys(grouped).forEach(mainId => {
      // Find category config if it exists, otherwise create a fallback
      const catConfig = MAIN_CATEGORIES.find(c => c.id === mainId) || {
        id: mainId,
        label: mainId,
        icon: '📦',
        color: 'from-gray-500 to-gray-600',
        type: 'other',
        orderPriority: 999
      };
      mains.push(catConfig);
    });
    // Sort by Priority
    return mains.sort((a, b) => (a.orderPriority ?? 999) - (b.orderPriority ?? 999));
  }, [grouped, MAIN_CATEGORIES]);

  return (
    <div className="space-y-8">
      {/* ─── PERSONALIZATION TOP ──────────────────────────────────────────────── */}
      <div className="px-1">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {user ? `Hey ${user.name ? user.name.split(' ')[0] : 'there'} 👋` : 'Welcome to Kari King ✨'}
        </h1>
        <p className="text-gray-500 text-sm font-medium mt-0.5">Let's crave something fresh today.</p>
      </div>

      {/* ─── BANNER SLIDER ──────────────────────────────────────────────────── */}
      {cmsLoading ? (
        <div className="w-full h-[260px] md:h-[380px] rounded-3xl bg-gray-100 animate-pulse" />
      ) : (
        <BannerSlider banners={banners} />
      )}

      {/* ─── TRUST FEATURES ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-3 gap-3">
        {features.map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="bg-white p-3 rounded-2xl border border-gray-100/80 flex flex-col items-center text-center gap-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)] premium-card"
          >
            <div className={`bg-gradient-to-br ${f.gradient} p-2.5 rounded-xl text-white shadow-md`}>
              <f.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xs leading-tight">{f.title}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* ─── COUNTDOWN CAMPAIGNS ──────────────────────────────────────────── */}
      {countdownCampaigns.length > 0 && (
        <CountdownStrip campaigns={countdownCampaigns} />
      )}

      {/* ─── SEASONAL CAMPAIGNS ──────────────────────────────────────────── */}
      {seasonalCampaigns.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-emerald-100 p-2 rounded-xl">
              <Flame className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900">Special Deals</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {seasonalCampaigns.map((item, idx) => {
              const SEASONAL_GRADIENTS = [
                'from-emerald-600 to-teal-500',
                'from-violet-600 to-purple-500',
                'from-amber-500 to-orange-500',
                'from-rose-600 to-pink-500',
              ];
              const grad = SEASONAL_GRADIENTS[idx % SEASONAL_GRADIENTS.length];
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 sm:p-6 shadow-lg`}
                >
                  <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
                  <div className="absolute -left-6 -bottom-10 w-28 h-28 rounded-full bg-white/5" />
                  <div className="relative z-10">
                    {item.badgeLabel && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/90 bg-white/20 px-2 py-0.5 rounded-full mb-2 inline-block">
                        {item.badgeLabel}
                      </span>
                    )}
                    <h3 className="text-white font-black text-lg leading-tight">{item.title}</h3>
                    {item.subtitle && (
                      <p className="text-white/70 text-xs mt-1 leading-relaxed max-w-sm">{item.subtitle}</p>
                    )}
                    {item.buttonText && (
                      <Link
                        to={item.redirectLink || '/products'}
                        className="inline-flex items-center gap-1.5 mt-3 bg-white/20 hover:bg-white/30 border border-white/30 text-white text-xs font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-colors"
                      >
                        {item.buttonText} <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── OFFERS & COUPONS ───────────────────────────────────────────────── */}
      {cmsLoading ? (
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map(i => <div key={i} className="w-[280px] h-[130px] shrink-0 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : (
        <OffersRow offers={offers} />
      )}

      {/* ─── CATEGORY QUICK-NAV ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-black text-gray-900 mb-4">Shop by Category</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
          {activeMains.map((cat, i) => (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                to={`/products?category=${cat.id}`}
                className={`snap-start shrink-0 flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-br ${cat.color} text-white min-w-[100px] hover:scale-105 transition-transform shadow-lg premium-card`}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{cat.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── GROUPED PRODUCT SECTIONS ───────────────────────────────────────── */}
      {/* FAVORITES (If authenticated) */}
      {user && favorites.length > 0 && !loading && (
        <section className="bg-premium-gradient -mx-4 px-4 py-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <h2 className="text-xl font-black text-white mb-4 relative z-10 flex items-center gap-2"> Reorder Favorites <Star className="w-5 h-5 text-amber-300 fill-amber-300"/></h2>
          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none snap-x relative z-10">
            {favorites.map(product => (
              <div key={`fav-${product.id}`} className="snap-start shrink-0 w-[220px] bg-white rounded-3xl p-3 shadow-lg flex items-center gap-3">
                 <div className="relative">
                   <img src={product.image} className="w-14 h-14 rounded-2xl object-cover shadow-sm bg-gray-50" />
                   {product.discountPercentage ? (
                     <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full shadow-sm leading-none">
                       {product.discountPercentage}%
                     </span>
                   ) : null}
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 line-clamp-1">{product.name}</p>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-[13px] font-black text-gray-900">₹{product.sellingPrice}</span>
                      {product.mrpPrice > product.sellingPrice && (
                        <span className="text-[10px] text-gray-400 line-through">₹{product.mrpPrice}</span>
                      )}
                    </div>
                 </div>
                 <button className="ripple-btn bg-gray-100 p-2 rounded-xl text-[#7A0000] hover:bg-red-50 transition-colors" onClick={() => addToCart(product)}>
                   <ShoppingCart className="w-4 h-4" />
                 </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="space-y-10">
          {[1, 2].map(i => (
            <div key={i} className="space-y-4">
              <div className="h-8 w-40 bg-gray-200 animate-pulse rounded-xl" />
              <div className="product-grid">
                {[1, 2, 3, 4].map(j => (
                  <div key={j} className="bg-gray-100 rounded-2xl shadow-sm relative overflow-hidden aspect-[3/4]">
                     <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : activeMains.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200 shadow-sm">
          <p className="text-4xl mb-3">🥩</p>
          <p className="text-gray-600 font-bold">No products yet.</p>
          <p className="text-gray-400 text-sm mt-1">Add products from the Admin panel to get started.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {activeMains.map((mainCat, mainIdx) => {
            const subGroups = grouped[mainCat.id] as Record<string, Product[]>;
            const totalCount = (Object.values(subGroups) as Product[][]).flat().length;

            return (
              <motion.section
                key={mainCat.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: mainIdx * 0.04 }}
              >
                {/* Section header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mainCat.color} flex items-center justify-center text-xl shadow-md`}>
                      {mainCat.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900">{mainCat.label}</h2>
                      <p className="text-[11px] text-gray-400 font-medium">{totalCount} {totalCount === 1 ? 'product' : 'products'}</p>
                    </div>
                  </div>
                  <Link to={`/products?category=${mainCat.id}`} className="flex items-center gap-1 text-sm font-bold text-[#8B0000] hover:underline">
                    View All <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* All products in one grid */}
                <ProductGrid products={(Object.values(subGroups) as Product[][]).flat()} />
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
}
