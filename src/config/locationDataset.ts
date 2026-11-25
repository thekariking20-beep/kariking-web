import { OfflineLocationEntry } from '../types';
import { haversineDistanceKm } from '../lib/geo';

/**
 * Self-contained offline lookup dataset of areas, towns, and pincodes
 * around Kari King's service region (zero external APIs or geocoding keys).
 *
 * How to add a new pointing area/pincode:
 * Append an entry to `OFFLINE_LOCATIONS` below with a unique `id`, `name`,
 * `area`, `city`, 6-digit `pincode`, `state`, and decimal `lat` / `lng`.
 */
export const OFFLINE_LOCATIONS: OfflineLocationEntry[] = [
  {
    id: 'chinnabatakanapalli-635119',
    name: 'Chinnabatakanapalli (Store Area)',
    area: 'Chinnabatakanapalli, Soolagiri TK',
    city: 'Krishnagiri',
    pincode: '635119',
    state: 'Tamil Nadu',
    lat: 12.6695,
    lng: 78.0215,
    aliases: ['chinnabatakanapalli', 'chinna batanapalli', 'kariking', 'store'],
  },
  {
    id: 'soolagiri-635117',
    name: 'Soolagiri / Shoolagiri',
    area: 'Soolagiri Bus Stand & NH-44',
    city: 'Krishnagiri',
    pincode: '635117',
    state: 'Tamil Nadu',
    lat: 12.6650,
    lng: 78.0120,
    aliases: ['soolagiri', 'shoolagiri', 'sulagiri'],
  },
  {
    id: 'koneripalli-635117',
    name: 'Koneripalli',
    area: 'Koneripalli, Soolagiri TK',
    city: 'Krishnagiri',
    pincode: '635117',
    state: 'Tamil Nadu',
    lat: 12.6815,
    lng: 78.0480,
    aliases: ['koneripalli', 'koneripally'],
  },
  {
    id: 'athimugam-635105',
    name: 'Athimugam',
    area: 'Athimugam, Soolagiri TK',
    city: 'Krishnagiri',
    pincode: '635105',
    state: 'Tamil Nadu',
    lat: 12.7140,
    lng: 78.0360,
    aliases: ['athimugam', 'attimugam'],
  },
  {
    id: 'uddanapalli-635119',
    name: 'Uddanapalli',
    area: 'Uddanapalli, Soolagiri TK',
    city: 'Krishnagiri',
    pincode: '635119',
    state: 'Tamil Nadu',
    lat: 12.6340,
    lng: 77.9680,
    aliases: ['uddanapalli', 'udhanapalli', 'udanapalli'],
  },
  {
    id: 'kamandoddi-635109',
    name: 'Kamandoddi',
    area: 'Kamandoddi, NH-44',
    city: 'Krishnagiri',
    pincode: '635109',
    state: 'Tamil Nadu',
    lat: 12.6910,
    lng: 77.9520,
    aliases: ['kamandoddi', 'kamanthotti'],
  },
  {
    id: 'perandapalli-635109',
    name: 'Perandapalli',
    area: 'Perandapalli Forest Checkpost',
    city: 'Hosur',
    pincode: '635109',
    state: 'Tamil Nadu',
    lat: 12.7040,
    lng: 77.9020,
    aliases: ['perandapalli', 'perandapally'],
  },
  {
    id: 'berigai-635105',
    name: 'Berigai',
    area: 'Berigai Town',
    city: 'Krishnagiri',
    pincode: '635105',
    state: 'Tamil Nadu',
    lat: 12.7710,
    lng: 78.0460,
    aliases: ['berigai', 'berikai'],
  },
  {
    id: 'kelamangalam-635113',
    name: 'Kelamangalam',
    area: 'Kelamangalam Town',
    city: 'Krishnagiri',
    pincode: '635113',
    state: 'Tamil Nadu',
    lat: 12.6010,
    lng: 77.8540,
    aliases: ['kelamangalam', 'kelamangalam road'],
  },
  {
    id: 'gurubarapalli-635115',
    name: 'Gurubarapalli',
    area: 'Gurubarapalli, NH-44',
    city: 'Krishnagiri',
    pincode: '635115',
    state: 'Tamil Nadu',
    lat: 12.5910,
    lng: 78.1320,
    aliases: ['gurubarapalli', 'guruparapalli'],
  },
  {
    id: 'veppanapalli-635121',
    name: 'Veppanapalli',
    area: 'Veppanapalli Town',
    city: 'Krishnagiri',
    pincode: '635121',
    state: 'Tamil Nadu',
    lat: 12.7030,
    lng: 78.1790,
    aliases: ['veppanapalli', 'veppanapally'],
  },
  {
    id: 'rayakottai-635116',
    name: 'Rayakottai',
    area: 'Rayakottai Town',
    city: 'Krishnagiri',
    pincode: '635116',
    state: 'Tamil Nadu',
    lat: 12.5170,
    lng: 77.9430,
    aliases: ['rayakottai', 'royakottai'],
  },
  {
    id: 'hosur-635109',
    name: 'Hosur Town',
    area: 'Hosur Bus Stand & M.G. Road',
    city: 'Hosur',
    pincode: '635109',
    state: 'Tamil Nadu',
    lat: 12.7409,
    lng: 77.8253,
    aliases: ['hosur', 'hosur town', 'mg road'],
  },
  {
    id: 'mathigiri-635110',
    name: 'Mathigiri',
    area: 'Mathigiri, Hosur',
    city: 'Hosur',
    pincode: '635110',
    state: 'Tamil Nadu',
    lat: 12.7070,
    lng: 77.8120,
    aliases: ['mathigiri', 'madhigiri'],
  },
  {
    id: 'sipcot-hosur-635126',
    name: 'SIPCOT Hosur',
    area: 'SIPCOT Phase 1 & 2, Hosur',
    city: 'Hosur',
    pincode: '635126',
    state: 'Tamil Nadu',
    lat: 12.7685,
    lng: 77.7980,
    aliases: ['sipcot', 'hosur sipcot', 'mookandapalli'],
  },
  {
    id: 'zuzuvadi-635126',
    name: 'Zuzuvadi',
    area: 'Zuzuvadi Border, Hosur',
    city: 'Hosur',
    pincode: '635126',
    state: 'Tamil Nadu',
    lat: 12.7760,
    lng: 77.7790,
    aliases: ['zuzuvadi', 'jujuwadi'],
  },
  {
    id: 'bagalur-635103',
    name: 'Bagalur',
    area: 'Bagalur Town, Hosur TK',
    city: 'Hosur',
    pincode: '635103',
    state: 'Tamil Nadu',
    lat: 12.8380,
    lng: 77.8780,
    aliases: ['bagalur', 'bagalur road'],
  },
  {
    id: 'denkanikottai-635107',
    name: 'Denkanikottai',
    area: 'Denkanikottai Town',
    city: 'Krishnagiri',
    pincode: '635107',
    state: 'Tamil Nadu',
    lat: 12.5260,
    lng: 77.7850,
    aliases: ['denkanikottai', 'thenkanikottai'],
  },
  {
    id: 'krishnagiri-635001',
    name: 'Krishnagiri Town',
    area: 'Krishnagiri New Bus Stand',
    city: 'Krishnagiri',
    pincode: '635001',
    state: 'Tamil Nadu',
    lat: 12.5186,
    lng: 78.2137,
    aliases: ['krishnagiri', 'krishnagiri town'],
  },
  {
    id: 'kaveripattinam-635112',
    name: 'Kaveripattinam',
    area: 'Kaveripattinam Town',
    city: 'Krishnagiri',
    pincode: '635112',
    state: 'Tamil Nadu',
    lat: 12.4230,
    lng: 78.2150,
    aliases: ['kaveripattinam', 'kaveripatnam'],
  },
  {
    id: 'bargur-635104',
    name: 'Bargur',
    area: 'Bargur Town',
    city: 'Krishnagiri',
    pincode: '635104',
    state: 'Tamil Nadu',
    lat: 12.5440,
    lng: 78.3610,
    aliases: ['bargur'],
  },
];

/**
 * Filter local dataset by name, area, city, alias, or pincode prefix.
 */
export function searchOfflineLocations(query: string): OfflineLocationEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return OFFLINE_LOCATIONS;

  return OFFLINE_LOCATIONS.filter((entry) => {
    const haystack = [
      entry.name,
      entry.area,
      entry.city,
      entry.pincode,
      ...(entry.aliases || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Resolve offline coordinates from free-text address fields (`pincode`, `street`, `city`).
 * Used both for custom address entry and backward-compatible resolution of legacy saved addresses.
 */
export function resolveOfflineCoordinates(params: {
  street?: string;
  city?: string;
  pincode?: string;
}): {
  lat: number;
  lng: number;
  matchedEntry: OfflineLocationEntry;
  matchType: 'area' | 'pincode' | 'city';
} | null {
  const street = (params.street || '').trim().toLowerCase();
  const city = (params.city || '').trim().toLowerCase();
  const pincode = (params.pincode || '').trim();

  // 1. Most specific: check if street text mentions a known locality or alias
  if (street) {
    const areaMatch = OFFLINE_LOCATIONS.find((entry) => {
      const tokens = [entry.name.split('(')[0].trim().toLowerCase(), ...(entry.aliases || [])];
      return tokens.some((token) => token.length >= 4 && street.includes(token.toLowerCase()));
    });
    if (areaMatch) {
      return {
        lat: areaMatch.lat,
        lng: areaMatch.lng,
        matchedEntry: areaMatch,
        matchType: 'area',
      };
    }
  }

  // 2. Match exact 6-digit pincode
  if (/^\d{6}$/.test(pincode)) {
    const pinMatch = OFFLINE_LOCATIONS.find((entry) => entry.pincode === pincode);
    if (pinMatch) {
      return {
        lat: pinMatch.lat,
        lng: pinMatch.lng,
        matchedEntry: pinMatch,
        matchType: 'pincode',
      };
    }
  }

  // 3. Fallback: prefer exact town/city entry before sub-localities with matching city field
  const combined = `${city} ${street}`.trim();
  if (combined) {
    const cityMatch =
      (city
        ? OFFLINE_LOCATIONS.find((entry) => {
            const baseName = entry.name.split('(')[0].trim().toLowerCase();
            return baseName === city || baseName.startsWith(`${city} `);
          }) ||
          OFFLINE_LOCATIONS.find((entry) =>
            (entry.aliases || []).some((a) => a.toLowerCase() === city)
          )
        : undefined) ||
      OFFLINE_LOCATIONS.find((entry) => {
        const entryCity = entry.city.toLowerCase();
        return (
          (city && entryCity === city) ||
          combined.includes(entry.name.split('(')[0].trim().toLowerCase()) ||
          (city && entry.name.toLowerCase().includes(city))
        );
      });
    if (cityMatch) {
      return {
        lat: cityMatch.lat,
        lng: cityMatch.lng,
        matchedEntry: cityMatch,
        matchType: 'city',
      };
    }
  }

  return null;
}

/**
 * Find the closest known locality from the offline dataset to label GPS or radar-picked coordinates.
 */
export function findNearestOfflineLocation(
  lat: number,
  lng: number
): { entry: OfflineLocationEntry; distanceKm: number } {
  let bestEntry = OFFLINE_LOCATIONS[0];
  let bestDistance = Infinity;

  for (const entry of OFFLINE_LOCATIONS) {
    const dist = haversineDistanceKm(lat, lng, entry.lat, entry.lng);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestEntry = entry;
    }
  }

  return { entry: bestEntry, distanceKm: bestDistance };
}
