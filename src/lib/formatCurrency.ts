/**
 * Centralized currency formatter for the Kari King platform.
 * Uses Intl.NumberFormat with Indian locale for proper ₹ symbol and comma grouping.
 *
 * Examples:
 *   formatCurrency(1299)    → "₹1,299.00"
 *   formatCurrency(250.5)   → "₹250.50"
 *   formatCurrency(0)       → "₹0.00"
 */
export function formatCurrency(amount: number | undefined | null): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Math.round(safe));
}

/**
 * Compact currency string for PDFs (no trailing .00 for whole numbers).
 *   formatCurrencyCompact(1299)  → "₹1,299"
 *   formatCurrencyCompact(250.5) → "₹251"
 */
export function formatCurrencyCompact(amount: number | undefined | null): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? Math.round(amount) : 0;
  return '₹' + new Intl.NumberFormat('en-IN').format(safe);
}
