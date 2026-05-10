import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { MAIN_CATEGORIES, type MainCategory, type SubCategory } from '../config/categories';

interface CategoriesContextValue {
  /** Active categories sorted by order. Falls back to static MAIN_CATEGORIES. */
  categories: MainCategory[];
  /** All categories (including inactive) for admin views */
  allCategories: MainCategory[];
  /** Whether the initial Firestore fetch is still loading */
  loading: boolean;
  /** Get subcategories for a given main category ID */
  getSubCategories: (mainCategoryId: string) => SubCategory[];
  /** Get a single category by ID */
  getCategory: (id: string) => MainCategory | undefined;
}

const CategoriesContext = createContext<CategoriesContextValue>({
  categories: MAIN_CATEGORIES,
  allCategories: MAIN_CATEGORIES,
  loading: true,
  getSubCategories: (id) => MAIN_CATEGORIES.find(c => c.id === id)?.subCategories ?? [],
  getCategory: (id) => MAIN_CATEGORIES.find(c => c.id === id),
});

// PATCH 8: Cache key for localStorage persistence
const CATEGORIES_CACHE_KEY = 'kk_categories_cache';

function getCachedCategories(): MainCategory[] | null {
  try {
    const raw = localStorage.getItem(CATEGORIES_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  // PATCH 8: Initialize from cache for instant display (no loading flash)
  const cached = getCachedCategories();
  const [allCategories, setAllCategories] = useState<MainCategory[]>(cached || MAIN_CATEGORIES);
  const [loading, setLoading] = useState(!cached); // Skip loading if cache exists

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('orderPriority', 'asc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const cats: MainCategory[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              label: data.name || data.label || doc.id,
              icon: data.icon || '📦',
              color: data.color || 'from-gray-500 to-gray-600',
              isActive: data.isActive !== false, // default true
              type: data.type || 'other',
              orderPriority: data.orderPriority ?? 999,
              subCategories: (data.subCategories || []).map((s: any) => ({
                id: s.id || s.label,
                label: s.label || s.id,
                labelTamil: s.labelTamil,
              })),
            };
          });
          setAllCategories(cats);
          // PATCH 8: Persist to localStorage for instant load on next visit
          try { localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(cats)); } catch { /* quota */ }
        }
        // If Firestore is empty, keep the static MAIN_CATEGORIES fallback
        setLoading(false);
      },
      (error) => {
        console.error('Categories listener error:', error);
        // On error, keep static fallback
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Only active categories for user-facing pages
  const categories = allCategories.filter(c => c.isActive !== false);

  const getSubCategories = (mainCategoryId: string): SubCategory[] => {
    return allCategories.find(c => c.id === mainCategoryId)?.subCategories ?? [];
  };

  const getCategory = (id: string): MainCategory | undefined => {
    return allCategories.find(c => c.id === id);
  };

  return (
    <CategoriesContext.Provider value={{ categories, allCategories, loading, getSubCategories, getCategory }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  return useContext(CategoriesContext);
}
