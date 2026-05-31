/**
 * Kari King — Centralized Coin Value System
 * 
 * Single source of truth for the coin economy.
 * Import this constant EVERYWHERE instead of hardcoding "20".
 * 
 * Used by: Cart, Checkout, Invoice, Referral page, Cloud Functions, Admin
 */

/** 1 Kari Coin = ₹20 */
export const COIN_VALUE = 20;

/** Minimum order amount to earn coins */
export const COIN_EARN_THRESHOLD = 500;

/** Coins earned per COIN_EARN_THRESHOLD spent */
export const COINS_PER_THRESHOLD = 1;

/** Minimum coins required to request a withdrawal */
export const MIN_WITHDRAWAL_COINS = 100; // 100 coins = ₹2000

/** Format a coin amount to rupee value string */
export function coinToRupee(coins: number): string {
  return `₹${coins * COIN_VALUE}`;
}

/** Format coin usage for display: "5 Coins (₹100 OFF)" */
export function formatCoinUsage(coins: number): string {
  if (coins <= 0) return '';
  return `${coins} Coin${coins > 1 ? 's' : ''} (₹${coins * COIN_VALUE} OFF)`;
}
