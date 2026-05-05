/**
 * Referral Reward Engine
 * 
 * Triggered when an order status changes to "Delivered".
 * Checks if this is the user's FIRST completed order.
 * If yes, and they have a pending referral → complete the referral and reward both parties.
 * 
 * Reward structure:
 *   Referrer:  lockedCoins → coins (unlock 5 coins = ₹100)
 *   Referred:  coins += 2 (welcome bonus)
 * 
 * Fraud prevention (5 layers):
 *   1. referral.rewardGiven flag — prevents double-rewarding on referral doc
 *   2. user.referredRewardGiven flag — prevents double-rewarding on user doc
 *   3. Only the FIRST delivered order triggers rewards
 *   4. One referral per user (checked by referredUserId)
 *   5. All mutations wrapped in a Firestore transaction — no partial writes
 */

import {
  collection, query, where, getDocs, doc, increment, addDoc, orderBy, limit,
  runTransaction, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const REFERRER_COIN_REWARD = 5;     // 5 coins = ₹100
const REFERRED_COIN_REWARD = 2;     // 2 coins = ₹40 (welcome bonus)

export async function processReferralReward(userId: string, orderId: string): Promise<void> {
  try {
    // ─── GATE 1: Check user-level flag FIRST (cheapest check) ──────────
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    if (userSnap.data().referredRewardGiven) return; // Already rewarded — bail

    // ─── GATE 2: Check if user has a pending referral ──────────────────
    const referralQuery = query(
      collection(db, 'referrals'),
      where('referredUserId', '==', userId),
      where('status', '==', 'pending')
    );
    const referralSnap = await getDocs(referralQuery);
    if (referralSnap.empty) return; // No pending referral

    const referralDocSnap = referralSnap.docs[0];
    const referral = referralDocSnap.data();

    // ─── GATE 3: If reward was already given on referral doc, skip ─────
    if (referral.rewardGiven) return;

    // ─── GATE 4: Check if this is truly the user's FIRST delivered order
    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      where('status', '==', 'Delivered'),
      orderBy('createdAt', 'asc'),
      limit(2)
    );
    const ordersSnap = await getDocs(ordersQuery);
    if (ordersSnap.size > 1) return; // Not first order — skip

    // ─── ALL GATES PASSED → Award via Transaction ─────────────────────
    const referrerId = referral.referrerId;
    const referralRef = doc(db, 'referrals', referralDocSnap.id);
    const referrerRef = doc(db, 'users', referrerId);
    const now = new Date().toISOString();

    await runTransaction(db, async (transaction) => {
      // Re-read inside transaction for consistency
      const [refSnap, referrerSnap, referredSnap] = await Promise.all([
        transaction.get(referralRef),
        transaction.get(referrerRef),
        transaction.get(userRef),
      ]);

      // Double-check flags inside transaction (race condition guard)
      if (!refSnap.exists() || refSnap.data().rewardGiven) return;
      if (referredSnap.exists() && referredSnap.data().referredRewardGiven) return;

      // 1. Mark referral as completed
      transaction.update(referralRef, {
        status: 'completed',
        rewardGiven: true,
        completedAt: now,
        completedOrderId: orderId,
      });

      // 2. Reward referrer: unlock lockedCoins → coins
      if (referrerSnap.exists()) {
        const currentLocked = referrerSnap.data().lockedCoins || 0;
        const safeDecrement = Math.min(REFERRER_COIN_REWARD, currentLocked);
        transaction.update(referrerRef, {
          coins: increment(REFERRER_COIN_REWARD),
          lockedCoins: increment(-safeDecrement),
        });
      }

      // 3. Reward referred user + set the user-level duplicate guard
      transaction.update(userRef, {
        coins: increment(REFERRED_COIN_REWARD),
        referredRewardGiven: true,
      });
    });

    // ─── Audit logs (outside transaction — non-blocking) ──────────────
    await Promise.allSettled([
      addDoc(collection(db, 'coinTransactions'), {
        userId: referrerId,
        amount: REFERRER_COIN_REWARD,
        type: 'earning',
        source: `Referral reward — ${referral.referredUserPhone || userId} completed first order`,
        referralId: referralDocSnap.id,
        createdAt: now,
      }),
      addDoc(collection(db, 'coinTransactions'), {
        userId: userId,
        amount: REFERRED_COIN_REWARD,
        type: 'earning',
        source: 'Welcome bonus — first order completed!',
        referralId: referralDocSnap.id,
        createdAt: now,
      }),
    ]);

    console.log(`✅ Referral reward processed: referrer=${referrerId}, referred=${userId}`);
  } catch (error) {
    console.error('Referral reward processing failed:', error);
    // Non-blocking — don't crash the order flow
  }
}
