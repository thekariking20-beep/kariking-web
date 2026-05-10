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
  const expiryDateString = coupon.expiresAt || coupon.validTill;
  if (expiryDateString && expiryDateString.trim()) {
    const tillDate = new Date(expiryDateString);
    if (!isNaN(tillDate.getTime()) && tillDate < now) {
      return fail('This coupon has expired.');
    }
  }

  // ── Minimum order amount ──────────────────────────────────────────────────
  const minOrder = coupon.minimumOrderAmount ?? coupon.minOrder ?? 0;
  if (subtotal < minOrder) {
    return fail(`Minimum order amount is ₹${minOrder} for this coupon.`);
  }

  // ── Global usage limit ────────────────────────────────────────────────────
  const globalLimit = coupon.usageLimit ?? coupon.totalUsageLimit ?? 0;
  if (globalLimit > 0) {
    // Sum all shard counts for accurate total
    let totalUsed = coupon.usedCount || 0; // fallback to legacy field
    try {
      const shardsSnap = await getDocs(collection(db, `coupons/${couponDoc.id}/shards`));
      if (!shardsSnap.empty) {
        totalUsed = 0;
        shardsSnap.forEach(s => { totalUsed += s.data().count || 0; });
      }
    } catch { /* ignore */ }
    if (totalUsed >= globalLimit) {
      return fail('This coupon has reached its usage limit.');
    }
  }

  // ── Per-user usage limit ──────────────────────────────────────────────────
  const perUserLimit = coupon.perUserLimit ?? 0;
  if (perUserLimit > 0) {
    const usedCoupons = user.usedCoupons || [];
    const userUsageCount = usedCoupons.filter(c => c === upperCode).length;
    if (userUsageCount >= perUserLimit) {
      return fail('You have already reached the usage limit for this coupon.');
    }
  }

  // ── New user gate ─────────────────────────────────────────────────────────
  if (coupon.forNewUsers) {
    const usedCoupons = user.usedCoupons || [];
    if (usedCoupons.length > 0) {
      return fail('This coupon is valid for first orders only.');
    }
  }

  // ── Calculate discount ────────────────────────────────────────────────────
  let discount = 0;
  // Support both new `type` and legacy `discountType` for backward compatibility
  const couponType = coupon.type || coupon.discountType;
  const maxDiscount = coupon.maxDiscountAmount ?? coupon.maxDiscount ?? 0;

  if (couponType === 'flat') {
    discount = coupon.discountValue;
  } else if (couponType === 'percentage') {
    discount = Math.round((subtotal * coupon.discountValue) / 100);
    // Apply max discount cap
    if (maxDiscount > 0 && discount > maxDiscount) {
      discount = maxDiscount;
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
