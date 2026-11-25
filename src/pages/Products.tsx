import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import ProductCard from '../components/ProductCard';
import ProductGrid from '../components/ProductGrid';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useCategories } from '../context/CategoriesContext';
import { useAddress } from '../context/AddressContext';
import StoreAvailabilityBar from '../components/location/StoreAvailabilityBar';

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { categories: MAIN_CATEGORIES } = useCategories();
  const { isOutsideSelectedRadius } = useAddress();

  const currentCategory = searchParams.get('category') || 'all';
  const currentSub = searchParams.get('sub') || '';

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    }, err => { console.error('Error fetching products:', err); setLoading(false); });
    return () => unsub();
  }, []);

  // Determine which subcategories are available for the selected main category
  const activeMainCat = MAIN_CATEGORIES.find(c => c.id === currentCategory);
  const subCategoriesForFilter = activeMainCat?.subCategories ?? [];

  // Smart resolve: reroute miscategorized "Others" products by name
  const resolveCategory = (p: Product): string => {
    const raw = p.mainCategory || p.category || '';
    if (raw !== 'Others') return raw;
    const check = ((p.name || '') + ' ' + (p.subCategory || '')).toLowerCase();
    if (check.includes('rabbit') || check.includes('rabit')) return 'Rabbit';
    if (check.includes('quail') || check.includes('kaadai') || check.includes('kadai')) return 'Quail';
    if (check.includes('turkey')) return 'Turkey';
    if (check.includes('duck')) return 'Ducks';
    if (check.includes('pickle')) return 'Pickles';
    if (check.includes('masala')) return 'Masala';
    return raw;
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {

      const resolved = resolveCategory(p);
      const mainMatch =
        currentCategory === 'all' ||
        resolved === currentCategory ||
        (p.mainCategory || p.category || '') === currentCategory ||
        p.category === currentCategory.toLowerCase();

      const subMatch = !currentSub || p.subCategory === currentSub;

      const textMatch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.subCategory || '').toLowerCase().includes(searchQuery.toLowerCase());

      return mainMatch && subMatch && textMatch;
    });
  }, [products, currentCategory, currentSub, searchQuery]);

  const setCategory = (cat: string) => {
    if (cat === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ category: cat });
    }
    setShowFilters(false);
  };

  const setSub = (sub: string) => {
    const params: Record<string, string> = {};
    if (currentCategory !== 'all') params.category = currentCategory;
    if (sub) params.sub = sub;
    setSearchParams(params);
  };

  const clearAll = () => {
    setSearchQuery('');
    setSearchParams({});
  };

  const pageTitle =
    currentCategory === 'all'
      ? 'All Products'
      : currentSub
      ? `${currentCategory} — ${currentSub}`
      : `${currentCategory} Selection`;

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-black text-gray-900">{pageTitle}</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search products..."
              id="product-search"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2.5 rounded-xl border transition-colors md:hidden',
              showFilters ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'
            )}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Store distance & radius availability bar */}
      <StoreAvailabilityBar
        availableProductCount={
          isOutsideSelectedRadius
            ? 0
            : products.filter((p) => p.isAvailable && !p.isComingSoon).length
        }
      />

      {/* Main category chips — desktop */}
      <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-wrap">
        <button
          onClick={() => setCategory('all')}
          className={cn(
            'px-5 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap',
            currentCategory === 'all'
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-red-500 hover:text-red-600'
          )}
        >
          All
        </button>
        {MAIN_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              'px-5 py-2 rounded-full font-bold text-sm transition-all whitespace-nowrap flex items-center gap-1.5',
              currentCategory === cat.id
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-red-500 hover:text-red-600'
            )}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </div>

      {/* Subcategory chips — show only when a main category is selected */}
      <AnimatePresence>
        {currentCategory !== 'all' && subCategoriesForFilter.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
          >
            <button
              onClick={() => setSub('')}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border',
                !currentSub
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-900'
              )}
            >
              All {currentCategory}
            </button>
            {subCategoriesForFilter.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSub(sub.id)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border',
                  currentSub === sub.id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-900'
                )}
              >
                {sub.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile filter drawer */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden flex flex-wrap gap-2 overflow-hidden"
          >
            <button
              onClick={() => setCategory('all')}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-bold transition-all',
                currentCategory === 'all' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              All
            </button>
            {MAIN_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-1',
                  currentCategory === cat.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
                )}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          Showing <span className="font-bold text-gray-900">{filteredProducts.length}</span> products
          {(currentCategory !== 'all' || searchQuery) && (
            <button onClick={clearAll} className="ml-3 text-red-600 font-bold hover:underline text-xs">
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="product-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="bg-gray-100 animate-pulse rounded-2xl aspect-[3/4]" />
          ))}
        </div>
      ) : filteredProducts.length > 0 ? (
        <ProductGrid products={filteredProducts} locationUnavailable={isOutsideSelectedRadius} />
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 text-sm">Try adjusting your search or category filter.</p>
          <button
            onClick={clearAll}
            className="mt-6 text-red-600 font-bold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
