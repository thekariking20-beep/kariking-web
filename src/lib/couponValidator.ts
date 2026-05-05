import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
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
  const q = query(couponsRef, where('code', '==', upperCode), limit(1));
  let snap;
  try {
    snap = await getDocs(q);
  } catch (queryErr: any) {
    console.error('Coupon query error:', queryErr);
    return fail('Unable to verify coupon. Please try again.');
  }

  // Fallback: try using the code as the document ID directly
  if (snap.empty) {
    try {
      const directDoc = await getDoc(doc(db, 'coupons', upperCode));
      if (directDoc.exists() && directDoc.data()?.code === upperCode) {
        snap = { empty: false, docs: [directDoc] } as any;
      }
    } catch { /* ignore fallback errors */ }
  }

  if (snap.empty) return fail('Invalid coupon code.');

  const couponDoc = snap.docs[0];
  const coupon = { id: couponDoc.id, ...couponDoc.data() } as Coupon;

  // ── Active check ──────────────────────────────────────────────────────────
  if (!coupon.isActive) return fail('This coupon is no longer active.');

  // ── Date range check ──────────────────────────────────────────────────────
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom.trim()) {
    const fromDate = new Date(coupon.validFrom);
    if (!isNaN(fromDate.getTime()) && fromDate > now) {
      return fail('This coupon is not yet valid.');
    }
  }
  if (coupon.validTill && coupon.validTill.trim()) {
    const tillDate = new Date(coupon.validTill);
    if (!isNaN(tillDate.getTime()) && tillDate < now) {
      return fail('This coupon has expired.');
    }
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
    // Use the user's usedCoupons array or order count from their profile
    // This avoids a compound Firestore query that requires a composite index
    const usedCoupons = user.usedCoupons || [];
    if (usedCoupons.length > 0) {
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
