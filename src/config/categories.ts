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
  type?: 'meat' | 'masala' | 'pickle' | 'other';
  orderPriority?: number;
  subCategories: SubCategory[];
}

export const MAIN_CATEGORIES: MainCategory[] = [
  {
    id: 'Chicken',
    label: 'Chicken',
    icon: '🍗',
    color: 'from-amber-500 to-orange-500',
    isActive: true,
    type: 'meat',
    orderPriority: 1,
    subCategories: [
      { id: 'Country Chicken', label: 'Country Chicken', labelTamil: 'நாட்டு கோழி' },
      { id: 'Broiler Chicken', label: 'Broiler Chicken' },
      { id: 'Skinless Chicken', label: 'Skinless Chicken' },
      { id: 'Kadaknath Chicken', label: 'Kadaknath Chicken' },
    ],
  },
  {
    id: 'Mutton',
    label: 'Mutton',
    icon: '🥩',
    color: 'from-red-600 to-rose-700',
    isActive: true,
    type: 'meat',
    orderPriority: 2,
    subCategories: [
      { id: 'Goat Curry Cut', label: 'Goat Curry Cut' },
      { id: 'Boneless Mutton', label: 'Boneless Mutton' },
    ],
  },
  {
    id: 'Turkey',
    label: 'Turkey',
    icon: '🦃',
    color: 'from-amber-600 to-amber-800',
    isActive: true,
    type: 'meat',
    orderPriority: 3,
    subCategories: [
      { id: 'Turkey Meat', label: 'Turkey Meat' },
    ],
  },
  {
    id: 'Fish',
    label: 'Fish',
    icon: '🐟',
    color: 'from-blue-500 to-cyan-600',
    isActive: true,
    type: 'meat',
    orderPriority: 4,
    subCategories: [
      { id: 'Nethili', label: 'Nethili' },
      { id: 'Vanjaram', label: 'Vanjaram' },
      { id: 'Sankara', label: 'Sankara' },
    ],
  },
  {
    id: 'Rabbit',
    label: 'Rabbit',
    icon: '🐇',
    color: 'from-stone-500 to-stone-700',
    isActive: true,
    type: 'meat',
    orderPriority: 5,
    subCategories: [
      { id: 'Rabbit Meat', label: 'Rabbit Meat' },
    ],
  },
  {
    id: 'Quail',
    label: 'Quail',
    icon: '🐦',
    color: 'from-teal-500 to-teal-700',
    isActive: true,
    type: 'meat',
    orderPriority: 6,
    subCategories: [
      { id: 'Quail Meat', label: 'Quail Meat' },
      { id: 'Quail Eggs', label: 'Quail Eggs' },
    ],
  },
  {
    id: 'Milk',
    label: 'Milk',
    icon: '🥛',
    color: 'from-sky-400 to-blue-500',
    isActive: true,
    type: 'other',
    orderPriority: 7,
    subCategories: [
      { id: 'Cow Milk', label: 'Cow Milk', labelTamil: 'பசும்பால்' },
      { id: 'Goat Milk', label: 'Goat Milk', labelTamil: 'ஆட்டுப்பால்' },
    ],
  },
  {
    id: 'Eggs',
    label: 'Eggs',
    icon: '🥚',
    color: 'from-yellow-400 to-amber-500',
    isActive: true,
    type: 'other',
    orderPriority: 8,
    subCategories: [
      { id: 'Country Eggs', label: 'Country Eggs' },
      { id: 'Farm Eggs', label: 'Farm Eggs' },
    ],
  },
  {
    id: 'Crab',
    label: 'Crab',
    icon: '🦀',
    color: 'from-orange-500 to-red-500',
    isActive: true,
    type: 'meat',
    orderPriority: 9,
    subCategories: [
      { id: 'Nandu (Crab)', label: 'Nandu (Crab)' },
    ],
  },
  {
    id: 'Ducks',
    label: 'Ducks',
    icon: '🦆',
    color: 'from-emerald-500 to-green-700',
    isActive: true,
    type: 'meat',
    orderPriority: 10,
    subCategories: [
      { id: 'Duck Meat', label: 'Duck Meat' },
      { id: 'Duck Eggs', label: 'Duck Eggs' },
    ],
  },
  {
    id: 'Masala',
    label: 'Masala Powders',
    icon: '🌶️',
    color: 'from-orange-600 to-red-600',
    isActive: true,
    type: 'masala',
    orderPriority: 50,
    subCategories: [
      { id: 'Chicken Masala', label: 'Chicken Masala' },
      { id: 'Mutton Masala', label: 'Mutton Masala' },
      { id: 'Fish Masala', label: 'Fish Masala' },
      { id: 'Biryani Masala', label: 'Biryani Masala' },
      { id: 'Garam Masala', label: 'Garam Masala' },
    ],
  },
  {
    id: 'Pickles',
    label: 'Pickles',
    icon: '🫙',
    color: 'from-green-600 to-emerald-600',
    isActive: true,
    type: 'pickle',
    orderPriority: 60,
    subCategories: [
      { id: 'Chicken Pickle', label: 'Chicken Pickle' },
      { id: 'Mutton Pickle', label: 'Mutton Pickle' },
      { id: 'Fish Pickle', label: 'Fish Pickle' },
      { id: 'Prawn Pickle', label: 'Prawn Pickle' },
      { id: 'Tomato Pickle', label: 'Tomato Pickle' },
      { id: 'Mango Pickle', label: 'Mango Pickle' },
    ],
  },
  {
    id: 'Snacks',
    label: 'Snacks',
    icon: '🍟',
    color: 'from-yellow-500 to-orange-500',
    isActive: true,
    type: 'other',
    orderPriority: 70,
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
    type: 'other',
    orderPriority: 999,
    subCategories: [],
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
