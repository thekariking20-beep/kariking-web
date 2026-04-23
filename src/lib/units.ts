/**
 * Centralized unit formatting for Kari King.
 * 
 * Products in Firestore can have unitType: 'kg' | 'gram' | 'piece' | 'litre'
 * This module normalizes display labels and quantity formatting everywhere.
 */

/** Human-readable short label for a unit type */
export function unitLabel(unitType?: string): string {
  switch (unitType) {
    case 'kg':    return 'kg';
    case 'gram':  return 'g';
    case 'piece': return 'pcs';
    case 'litre': return 'L';
    default:      return 'kg'; // safe fallback for meat products
  }
}

/** Price suffix label (e.g. "/kg", "/pcs") — for price display next to ₹ */
export function unitPriceSuffix(unitType?: string): string {
  switch (unitType) {
    case 'kg':    return '/kg';
    case 'gram':  return '/kg';   // gram products are priced per kg
    case 'piece': return '/pc';
    case 'litre': return '/L';
    default:      return '/kg';
  }
}

/**
 * Format a quantity + unit for display.
 * Handles gram→kg conversion automatically.
 * 
 * Examples:
 *   formatQty(500, 'gram')  → "500g"
 *   formatQty(1000, 'gram') → "1kg"
 *   formatQty(2, 'kg')      → "2kg"
 *   formatQty(6, 'piece')   → "6 pcs"
 *   formatQty(1.5, 'litre') → "1.5L"
 */
export function formatQty(qty: number, unitType?: string): string {
  switch (unitType) {
    case 'gram':
      if (qty >= 1000 && qty % 1000 === 0) return `${qty / 1000}kg`;
      if (qty >= 1000) return `${(qty / 1000).toFixed(1)}kg`;
      return `${qty}g`;
    case 'kg':
      return `${qty}kg`;
    case 'piece':
      return `${qty} pcs`;
    case 'litre':
      return `${qty}L`;
    default:
      return `${qty}kg`;
  }
}

/**
 * Get the step size for quantity increments based on unit type.
 * Uses product-level stepSize if available, otherwise applies sensible defaults.
 */
export function getStepSize(unitType?: string, productStepSize?: number): number {
  if (productStepSize && productStepSize > 0) return productStepSize;
  switch (unitType) {
    case 'gram':  return 250;  // 250g increments
    case 'kg':    return 1;    // 1kg increments
    case 'piece': return 1;    // 1 piece at a time
    case 'litre': return 1;    // 1L at a time
    default:      return 1;
  }
}

/**
 * Get the minimum order quantity based on unit type.
 * Uses product-level minOrderQty if available.
 */
export function getMinQty(unitType?: string, productMinQty?: number): number {
  if (productMinQty && productMinQty > 0) return productMinQty;
  switch (unitType) {
    case 'gram':  return 250;
    case 'kg':    return 1;
    case 'piece': return 1;
    case 'litre': return 1;
    default:      return 1;
  }
}
