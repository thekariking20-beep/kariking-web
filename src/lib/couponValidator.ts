import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Coupon, User } from '../types';

export interface CouponResult {
  valid: boolean;
  discount: number;
  coupon: Coupon | null;
  error: string;
}

/**
 * Validate and calculate discount for a coupon code.
 * All checks are performed: existence, active, date range, min order,
 * usage limits (per-user + global), new-user gate.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  user: User
): Promise<CouponResult> {
  const fail = (error: string): CouponResult => ({ valid: false, discount: 0, coupon: null, error });

  if (!code || !code.trim()) return fail('Please enter a coupon code.');

  const upperCode = code.trim().toUpperCase();

  // ── Fetch coupon by code ──────────────────────────────────────────────────
  const couponsRef = collection(db, 'coupons');
  const q = query(couponsRef, where('code', '==', upperCode));
  const snap = await getDocs(q);

  if (snap.empty) return fail('Invalid coupon code.');

  const couponDoc = snap.docs[0];
  const coupon = { id: couponDoc.id, ...couponDoc.data() } as Coupon;

  // ── Active check ──────────────────────────────────────────────────────────
  if (!coupon.isActive) return fail('This coupon is no longer active.');

  // ── Date range check ──────────────────────────────────────────────────────
  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    return fail('This coupon is not yet valid.');
  }
  if (coupon.validTill && new Date(coupon.validTill) < now) {
    return fail('This coupon has expired.');
  }

  // ── Minimum order check ───────────────────────────────────────────────────
  if (subtotal < coupon.minOrder) {
    return fail(`Minimum order of ₹${coupon.minOrder} required. Add ₹${coupon.minOrder - subtotal} more.`);
  }

  // ── Global usage limit ────────────────────────────────────────────────────
  if (coupon.totalUsageLimit > 0 && coupon.usedCount >= coupon.totalUsageLimit) {
    return fail('This coupon has reached its usage limit.');
  }

  // ── Per-user usage limit ──────────────────────────────────────────────────
  if (coupon.usageLimit > 0) {
    const usedCoupons = user.usedCoupons || [];
    const userUsageCount = usedCoupons.filter(c => c === upperCode).length;
    if (userUsageCount >= coupon.usageLimit) {
      return fail('You have already used this coupon.');
    }
  }

  // ── New user gate ─────────────────────────────────────────────────────────
  if (coupon.forNewUsers) {
    // Check if user has any completed orders
    const ordersRef = collection(db, 'orders');
    const ordersQ = query(
      ordersRef,
      where('userId', '==', user.uid),
      where('status', '==', 'Delivered')
    );
    const ordersSnap = await getDocs(ordersQ);
    if (!ordersSnap.empty) {
      return fail('This coupon is valid for first orders only.');
    }
  }

  // ── Calculate discount ────────────────────────────────────────────────────
  let discount = 0;

  if (coupon.discountType === 'flat') {
    discount = coupon.discountValue;
  } else if (coupon.discountType === 'percentage') {
    discount = Math.round((subtotal * coupon.discountValue) / 100);
    // Apply max discount cap
    if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  }

  // Never discount more than subtotal
  discount = Math.min(discount, subtotal);

  return {
    valid: true,
    discount,
    coupon,
    error: '',
  };
}
