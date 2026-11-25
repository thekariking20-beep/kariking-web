import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { STORE_CONFIG } from '../config/storeConfig';
import { StoreLocation, SystemSettings } from '../types';

export const LEGACY_PLACEHOLDER_ADDRESS = '123 Market Road, City Center';
export const LEGACY_PLACEHOLDER_PHONE = '+91 90000 00000';
export const LEGACY_PLACEHOLDER_EMAIL = 'admin@kariking.in';

export const DEFAULT_STORE_FULL_ADDRESS = `${STORE_CONFIG.address}, ${STORE_CONFIG.area}, ${STORE_CONFIG.city}, ${STORE_CONFIG.state} - ${STORE_CONFIG.pincode}`;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  business: {
    storeName: STORE_CONFIG.name,
    storeAddress: DEFAULT_STORE_FULL_ADDRESS,
    contactNumber: STORE_CONFIG.phone,
    contactEmail: STORE_CONFIG.email,
    openingHours: '07:00 AM - 09:00 PM',
    storeLat: STORE_CONFIG.lat,
    storeLng: STORE_CONFIG.lng,
    gst: STORE_CONFIG.gst,
  },
  orders: {
    minOrderAmount: STORE_CONFIG.defaultMinOrderAmount,
    deliveryFee: STORE_CONFIG.defaultDeliveryFee,
    freeDeliveryThreshold: STORE_CONFIG.defaultFreeDeliveryThreshold,
  },
  delivery: {
    enabled: true,
    maxRadiusKm: STORE_CONFIG.defaultMaxRadiusKm,
    autoAssign: false,
  },
  notifications: {
    newOrderAlerts: true,
    deliveryUpdates: true,
    kycRequests: true,
  },
  security: {
    requireOtp: true,
  },
  updatedAt: new Date().toISOString(),
};

export function hasLegacyPlaceholderBusiness(raw?: Partial<SystemSettings> | null): boolean {
  if (!raw?.business) return false;
  const addr = typeof raw.business.storeAddress === 'string' ? raw.business.storeAddress.trim() : '';
  const phone = typeof raw.business.contactNumber === 'string' ? raw.business.contactNumber.trim() : '';
  const email = typeof raw.business.contactEmail === 'string' ? raw.business.contactEmail.trim() : '';
  return (
    addr === LEGACY_PLACEHOLDER_ADDRESS ||
    phone === LEGACY_PLACEHOLDER_PHONE ||
    email === LEGACY_PLACEHOLDER_EMAIL
  );
}

/**
 * Safely deep-merges a Firestore `settings/system` document with defaults,
 * replacing untouched legacy placeholders with real `STORE_CONFIG` values.
 */
export function mergeSystemSettings(raw?: Partial<SystemSettings> | null): SystemSettings {
  const b = raw?.business;
  const o = raw?.orders;
  const d = raw?.delivery;
  const n = raw?.notifications;
  const s = raw?.security;

  const rawName = typeof b?.storeName === 'string' ? b.storeName.trim() : '';
  const rawAddress = typeof b?.storeAddress === 'string' ? b.storeAddress.trim() : '';
  const rawPhone = typeof b?.contactNumber === 'string' ? b.contactNumber.trim() : '';
  const rawEmail = typeof b?.contactEmail === 'string' ? b.contactEmail.trim() : '';
  const rawHours = typeof b?.openingHours === 'string' ? b.openingHours.trim() : '';

  const validLat = typeof b?.storeLat === 'number' && Number.isFinite(b.storeLat) && b.storeLat !== 0
    ? b.storeLat
    : STORE_CONFIG.lat;
  const validLng = typeof b?.storeLng === 'number' && Number.isFinite(b.storeLng) && b.storeLng !== 0
    ? b.storeLng
    : STORE_CONFIG.lng;

  return {
    business: {
      storeName: rawName || DEFAULT_SYSTEM_SETTINGS.business.storeName,
      storeAddress:
        !rawAddress || rawAddress === LEGACY_PLACEHOLDER_ADDRESS
          ? DEFAULT_SYSTEM_SETTINGS.business.storeAddress
          : rawAddress,
      contactNumber:
        !rawPhone || rawPhone === LEGACY_PLACEHOLDER_PHONE
          ? DEFAULT_SYSTEM_SETTINGS.business.contactNumber
          : rawPhone,
      contactEmail:
        !rawEmail || rawEmail === LEGACY_PLACEHOLDER_EMAIL
          ? DEFAULT_SYSTEM_SETTINGS.business.contactEmail
          : rawEmail,
      openingHours: rawHours || DEFAULT_SYSTEM_SETTINGS.business.openingHours,
      storeLat: validLat,
      storeLng: validLng,
      gst: typeof b?.gst === 'string' ? b.gst.trim() : STORE_CONFIG.gst,
    },
    orders: {
      minOrderAmount:
        typeof o?.minOrderAmount === 'number' && Number.isFinite(o.minOrderAmount)
          ? Math.max(0, o.minOrderAmount)
          : DEFAULT_SYSTEM_SETTINGS.orders.minOrderAmount,
      deliveryFee:
        typeof o?.deliveryFee === 'number' && Number.isFinite(o.deliveryFee)
          ? Math.max(0, o.deliveryFee)
          : DEFAULT_SYSTEM_SETTINGS.orders.deliveryFee,
      freeDeliveryThreshold:
        typeof o?.freeDeliveryThreshold === 'number' && Number.isFinite(o.freeDeliveryThreshold)
          ? Math.max(0, o.freeDeliveryThreshold)
          : DEFAULT_SYSTEM_SETTINGS.orders.freeDeliveryThreshold,
    },
    delivery: {
      enabled: typeof d?.enabled === 'boolean' ? d.enabled : DEFAULT_SYSTEM_SETTINGS.delivery.enabled,
      maxRadiusKm:
        typeof d?.maxRadiusKm === 'number' && Number.isFinite(d.maxRadiusKm) && d.maxRadiusKm > 0
          ? d.maxRadiusKm
          : DEFAULT_SYSTEM_SETTINGS.delivery.maxRadiusKm,
      autoAssign:
        typeof d?.autoAssign === 'boolean' ? d.autoAssign : DEFAULT_SYSTEM_SETTINGS.delivery.autoAssign,
    },
    notifications: {
      newOrderAlerts:
        typeof n?.newOrderAlerts === 'boolean'
          ? n.newOrderAlerts
          : DEFAULT_SYSTEM_SETTINGS.notifications.newOrderAlerts,
      deliveryUpdates:
        typeof n?.deliveryUpdates === 'boolean'
          ? n.deliveryUpdates
          : DEFAULT_SYSTEM_SETTINGS.notifications.deliveryUpdates,
      kycRequests:
        typeof n?.kycRequests === 'boolean'
          ? n.kycRequests
          : DEFAULT_SYSTEM_SETTINGS.notifications.kycRequests,
    },
    security: {
      requireOtp:
        typeof s?.requireOtp === 'boolean'
          ? s.requireOtp
          : DEFAULT_SYSTEM_SETTINGS.security.requireOtp,
    },
    updatedAt: raw?.updatedAt || DEFAULT_SYSTEM_SETTINGS.updatedAt,
  };
}

/**
 * Convert merged SystemSettings into a StoreLocation object for Haversine calculations.
 */
export function buildPrimaryStoreLocation(
  settings: SystemSettings,
  rawDoc?: Partial<SystemSettings> | null
): StoreLocation {
  const hasConfiguredCoordinates =
    typeof rawDoc?.business?.storeLat === 'number' &&
    Number.isFinite(rawDoc.business.storeLat) &&
    typeof rawDoc?.business?.storeLng === 'number' &&
    Number.isFinite(rawDoc.business.storeLng);

  return {
    id: STORE_CONFIG.id,
    name: settings.business.storeName || STORE_CONFIG.name,
    address: settings.business.storeAddress || DEFAULT_STORE_FULL_ADDRESS,
    phone: settings.business.contactNumber || STORE_CONFIG.phone,
    email: settings.business.contactEmail || STORE_CONFIG.email,
    lat: settings.business.storeLat ?? STORE_CONFIG.lat,
    lng: settings.business.storeLng ?? STORE_CONFIG.lng,
    maxRadiusKm: settings.delivery.maxRadiusKm || STORE_CONFIG.defaultMaxRadiusKm,
    isActive: true,
    hasConfiguredCoordinates,
  };
}

export interface DynamicStoreProfile {
  storeName: string;
  tagline: string;
  storeAddress: string;
  phone: string;
  email: string;
  website: string;
  gst: string;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  minOrderAmount: number;
}

/**
 * Fetch the latest store profile & order settings from Firestore `settings/system`
 * (falling back cleanly to local cache or `STORE_CONFIG` if offline).
 * Used by PDF invoice & quotation generators.
 */
export async function getDynamicStoreProfile(): Promise<DynamicStoreProfile> {
  let raw: Partial<SystemSettings> | null = null;

  try {
    const snap = await getDoc(doc(db, 'settings', 'system'));
    if (snap.exists()) {
      raw = snap.data() as Partial<SystemSettings>;
      try {
        localStorage.setItem('kk_system_settings_cache', JSON.stringify(raw));
      } catch {
        /* ignore storage quota */
      }
    }
  } catch {
    // Offline fallback: read last cached settings if available
    try {
      const cached = localStorage.getItem('kk_system_settings_cache');
      if (cached) raw = JSON.parse(cached);
    } catch {
      /* ignore parse error */
    }
  }

  const merged = mergeSystemSettings(raw);
  return {
    storeName: merged.business.storeName,
    tagline: STORE_CONFIG.tagline,
    storeAddress: merged.business.storeAddress,
    phone: merged.business.contactNumber,
    email: merged.business.contactEmail,
    website: STORE_CONFIG.website,
    gst: merged.business.gst || '',
    deliveryFee: merged.orders.deliveryFee,
    freeDeliveryThreshold: merged.orders.freeDeliveryThreshold,
    minOrderAmount: merged.orders.minOrderAmount,
  };
}
