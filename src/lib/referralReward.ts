/**
 * Referral Reward Engine
 * 
 * Triggered when an order status changes to "Delivered".
 * Checks if this is the user's FIRST completed order.
 * If yes, and they have a pending referral → complete the referral and reward both parties.
 * 
 * Reward structure (base):
 *   Referrer:  lockedCoins → coins (unlock 5 coins = ₹100)
 *   Referred:  coins += 2 (welcome bonus)
 * 
 * Double Coins:
 *   If a reward campaign is active, the multiplier is applied to both rewards.
 *   e.g. 2x event → Referrer gets 10 coins, Referred gets 4 coins.
 * 
 * Fraud prevention (5 layers):
 *   1. referral.rewardGiven flag — prevents double-rewarding on referral doc
 *   2. user.referredRewardGiven flag — prevents double-rewarding on user doc
 *   3. Only the FIRST delivered order triggers rewards
 *   4. One referral per user (checked by referredUserId)
 *   5. All mutations wrapped in a Firestore transaction — no partial writes
 */

import {
  collection, query, where, getDocs, doc, increment, orderBy, limit,
  runTransaction, getDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const BASE_REFERRER_REWARD = 5;     // 5 coins = ₹100
const BASE_REFERRED_REWARD = 2;     // 2 coins = ₹40 (welcome bonus)

/**
 * Check for an active reward campaign and return the multiplier.
 */
async function getActiveMultiplier(): Promise<{ multiplier: number; campaignId: string | null }> {
  try {
    const q = query(collection(db, 'rewardCampaigns'), where('isActive', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return { multiplier: 1, campaignId: null };

    const now = Date.now();
    for (const d of snap.docs) {
      const camp = d.data();
      const starts = new Date(camp.startsAt).getTime();
      const ends = new Date(camp.endsAt).getTime();
      if (now >= starts && now <= ends) {
        return { multiplier: camp.multiplier || 1, campaignId: d.id };
      }
    }
  } catch { /* non-blocking */ }
  return { multiplier: 1, campaignId: null };
}

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

    // ─── Check for active reward campaign (double coins) ──────────────
    const { multiplier } = await getActiveMultiplier();
    const REFERRER_COIN_REWARD = BASE_REFERRER_REWARD * multiplier;
    const REFERRED_COIN_REWARD = BASE_REFERRED_REWARD * multiplier;

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
        multiplierApplied: multiplier,
      });

      // 2. Reward referrer: unlock lockedCoins → coins
      if (referrerSnap.exists()) {
        const currentLocked = referrerSnap.data().lockedCoins || 0;
        const safeDecrement = Math.min(BASE_REFERRER_REWARD, currentLocked);
        transaction.update(referrerRef, {
          coins: increment(REFERRER_COIN_REWARD),
          lockedCoins: increment(-safeDecrement),
          totalCoinsEarned: increment(REFERRER_COIN_REWARD),
        });
      }

      // 3. Reward referred user + set the user-level duplicate guard
      transaction.update(userRef, {
        coins: increment(REFERRED_COIN_REWARD),
        referredRewardGiven: true,
        totalCoinsEarned: increment(REFERRED_COIN_REWARD),
      });
    });

    // Audit logs are now written server-side in onOrderStatusChange (Cloud Function)
    // Server SDK bypasses Firestore rules, ensuring logs always persist.

    console.log(`✅ Referral reward processed (${multiplier}x): referrer=${referrerId} (+${REFERRER_COIN_REWARD}), referred=${userId} (+${REFERRED_COIN_REWARD})`);
  } catch (error) {
    console.error('Referral reward processing failed:', error);
    // Non-blocking — don't crash the order flow
  }
}

// ─── Customer Name Resolver (async — call BEFORE download) ───────────────────
export async function resolveCustomerName(userId: string): Promise<string> {
  if (!userId) return 'Customer';
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) return userSnap.data().name || 'Customer';
  } catch { /* ignore */ }
  return 'Customer';
}
