import { StoreLocation, StoreWithDistance } from '../types';

export const RADIUS_PRESETS = [1, 3, 5, 10, 25] as const;

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Exact great-circle distance between two coordinates using the Haversine formula (km).
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity;
  }

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Format a distance in km into a readable label (e.g., "450 m away" or "1.8 km away").
 */
export function formatDistanceKm(distanceKm: number, withSuffix = true): string {
  if (!Number.isFinite(distanceKm)) return 'Distance unknown';
  const suffix = withSuffix ? ' away' : '';
  if (distanceKm < 1) {
    const meters = Math.max(10, Math.round((distanceKm * 1000) / 10) * 10);
    return `${meters} m${suffix}`;
  }
  return `${distanceKm.toFixed(1)} km${suffix}`;
}

/**
 * Compass bearing label from point A to point B (N, NE, E, SE, S, SW, W, NW).
 */
export function getCompassDirection(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): string {
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  const bearingDeg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearingDeg / 45) % 8];
}

/**
 * Compute Haversine distance to every store, check radius eligibility,
 * and sort matching stores strictly from nearest to farthest.
 */
export function evaluateStoresWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  stores: StoreLocation[]
): StoreWithDistance[] {
  const safeRadius = Math.max(0.5, Number.isFinite(radiusKm) ? radiusKm : 10);

  return stores
    .filter((store) => store.isActive)
    .map((store) => {
      const distanceKm = haversineDistanceKm(centerLat, centerLng, store.lat, store.lng);
      return {
        ...store,
        distanceKm,
        inSelectedRadius: distanceKm <= safeRadius,
        inStoreMaxRadius: distanceKm <= store.maxRadiusKm,
        bearing: getCompassDirection(store.lat, store.lng, centerLat, centerLng),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
