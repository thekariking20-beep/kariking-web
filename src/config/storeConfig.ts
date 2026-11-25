/**
 * Centralized store configuration for Kari King.
 * Used as fallback when Firestore settings/system has not been configured yet.
 * Update coordinates or business details in Admin -> Settings -> Business Settings,
 * or edit defaults here for fresh deployments.
 */
export const STORE_CONFIG = {
  id: 'primary-store',
  name: 'Kari King',
  tagline: 'Premium Fresh Meat Delivery',
  address: 'Chinnabatakanapalli',
  area: 'Soolagiri TK',
  city: 'Krishnagiri',
  state: 'Tamil Nadu',
  pincode: '635119',
  phone: '+91 94427 35406 / 63808 86374',
  email: 'thekariking20@gmail.com',
  website: 'www.kariking.in',
  gst: '', // Add GST number when available, e.g. '33AABCK1234F1ZP'
  // Approximate coordinates for Chinnabatakanapalli, Soolagiri TK (635119).
  // Admin can fine-tune exact coordinates anytime in Admin Settings via GPS or Radar Picker.
  lat: 12.6695,
  lng: 78.0215,
  defaultMaxRadiusKm: 15,
  defaultDeliveryFee: 40,
  defaultFreeDeliveryThreshold: 1000,
  defaultMinOrderAmount: 500,
} as const;
