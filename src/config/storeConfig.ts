/**
 * Centralized store configuration for Kari King.
 * Used in invoices, footers, and contact sections.
 * Update here to reflect across the entire app.
 */
export const STORE_CONFIG = {
  name: 'Kari King',
  tagline: 'Premium Fresh Meat Delivery',
  address: 'No.212, Chinnasalem Main Road',
  area: 'Krishnagiri',
  city: 'Krishnagiri',
  state: 'Tamil Nadu',
  pincode: '635118',
  phone: '+91 6380886374',
  email: 'thekariking20@gmail.com',
  website: 'www.kariking.in',
  gst: '', // Add GST number when available, e.g. '33AABCK1234F1ZP'
} as const;
