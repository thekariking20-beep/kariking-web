// Central category & subcategory configuration for Kari King
// This is the STATIC FALLBACK used when Firestore categories haven't loaded yet.
// The CategoriesContext fetches from Firestore and overrides this at runtime.

export interface SubCategory {
  id: string;
  label: string;
  labelTamil?: string;
}

export interface MainCategory {
  id: string;
  label: string;
  icon: string;       // emoji icon
  color: string;      // tailwind gradient classes
  isActive?: boolean;
  order?: number;
  subCategories: SubCategory[];
}

export const MAIN_CATEGORIES: MainCategory[] = [
  {
    id: 'Chicken',
    label: 'Chicken',
    icon: '🍗',
    color: 'from-amber-500 to-orange-500',
    isActive: true,
    order: 0,
    subCategories: [
      { id: 'Country Chicken', label: 'Country Chicken', labelTamil: 'நாட்டு கோழி' },
      { id: 'Broiler Chicken', label: 'Broiler Chicken' },
      { id: 'Skinless Chicken', label: 'Skinless Chicken' },
    ],
  },
  {
    id: 'Mutton',
    label: 'Mutton',
    icon: '🥩',
    color: 'from-red-600 to-rose-700',
    isActive: true,
    order: 1,
    subCategories: [
      { id: 'Goat Curry Cut', label: 'Goat Curry Cut' },
      { id: 'Boneless Mutton', label: 'Boneless Mutton' },
    ],
  },
  {
    id: 'Fish',
    label: 'Fish',
    icon: '🐟',
    color: 'from-blue-500 to-cyan-600',
    isActive: true,
    order: 2,
    subCategories: [
      { id: 'Nethili', label: 'Nethili' },
      { id: 'Vanjaram', label: 'Vanjaram' },
      { id: 'Sankara', label: 'Sankara' },
    ],
  },
  {
    id: 'Crab',
    label: 'Crab',
    icon: '🦀',
    color: 'from-orange-500 to-red-500',
    isActive: true,
    order: 3,
    subCategories: [
      { id: 'Nandu (Crab)', label: 'Nandu (Crab)' },
    ],
  },
  {
    id: 'Eggs',
    label: 'Eggs',
    icon: '🥚',
    color: 'from-yellow-400 to-amber-500',
    isActive: true,
    order: 4,
    subCategories: [
      { id: 'Country Eggs', label: 'Country Eggs' },
      { id: 'Farm Eggs', label: 'Farm Eggs' },
    ],
  },
  {
    id: 'Masala',
    label: 'Masala Powders',
    icon: '🌶️',
    color: 'from-orange-600 to-red-600',
    isActive: true,
    order: 5,
    subCategories: [
      { id: 'Chicken Masala', label: 'Chicken Masala' },
      { id: 'Mutton Masala', label: 'Mutton Masala' },
      { id: 'Fish Masala', label: 'Fish Masala' },
      { id: 'Biryani Masala', label: 'Biryani Masala' },
      { id: 'Garam Masala', label: 'Garam Masala' },
    ],
  },
  {
    id: 'Snacks',
    label: 'Snacks',
    icon: '🍟',
    color: 'from-yellow-500 to-orange-500',
    isActive: true,
    order: 6,
    subCategories: [
      { id: 'Chips', label: 'Chips' },
      { id: 'Murukku', label: 'Murukku' },
      { id: 'Mixture', label: 'Mixture' },
      { id: 'Sweets', label: 'Sweets' },
    ],
  },
  {
    id: 'Others',
    label: 'Others',
    icon: '🍖',
    color: 'from-purple-500 to-indigo-600',
    isActive: true,
    order: 99,
    subCategories: [], // Handled via custom text input
  },
];

/** Returns the subcategory list for a given main category id */
export function getSubCategories(mainCategoryId: string): SubCategory[] {
  return MAIN_CATEGORIES.find(c => c.id === mainCategoryId)?.subCategories ?? [];
}

/** Returns the MainCategory config object for a given id */
export function getMainCategory(id: string): MainCategory | undefined {
  return MAIN_CATEGORIES.find(c => c.id === id);
}

/** Returns all valid main category ids */
export const MAIN_CATEGORY_IDS = MAIN_CATEGORIES.map(c => c.id);
