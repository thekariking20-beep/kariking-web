/**
 * Referral Reward Engine
 * 
 * Triggered when an order status changes to "Delivered".
 * Checks if this is the user's FIRST completed order.
 * If yes, and they have a pending referral → complete the referral and reward both parties.
 * 
 * Reward structure:
 *   Referrer:  lockedCoins → coins (unlock 5 coins = ₹100)
 *   Referred:  coins += 50 (bonus for first order)
 * 
 * Fraud prevention:
 *   - Only the FIRST delivered order triggers rewards
 *   - rewardGiven flag prevents double-rewarding
 *   - One referral per user (checked by referredUserId)
 */

import {
  collection, query, where, getDocs, updateDoc, doc, increment, addDoc, orderBy, limit
} from 'firebase/firestore';
import { db } from '../firebase';

const REFERRER_COIN_REWARD = 5;     // 5 coins = ₹100
const REFERRED_COIN_REWARD = 2;     // 2 coins = ₹40 (welcome bonus)

export async function processReferralReward(userId: string, orderId: string): Promise<void> {
  try {
    // 1. Check if user has a pending referral
    const referralQuery = query(
      collection(db, 'referrals'),
      where('referredUserId', '==', userId),
      where('status', '==', 'pending')
    );
    const referralSnap = await getDocs(referralQuery);

    if (referralSnap.empty) return; // No pending referral

    const referralDoc = referralSnap.docs[0];
    const referral = referralDoc.data();

    // 2. Fraud check: If reward was already given, skip
    if (referral.rewardGiven) return;

    // 3. Check if this is truly the user's FIRST delivered order
    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      where('status', '==', 'Delivered'),
      orderBy('createdAt', 'asc'),
      limit(2) // We only need to know if there's more than one
    );
    const ordersSnap = await getDocs(ordersQuery);

    // Only proceed if this is the first (or only) delivered order
    if (ordersSnap.size > 1) return; // Not first order — skip

    // 4. Complete the referral
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'referrals', referralDoc.id), {
      status: 'completed',
      rewardGiven: true,
      completedAt: now,
      completedOrderId: orderId,
    });

    // 5. Reward referrer: unlock locked coins → available coins
    const referrerId = referral.referrerId;
    await updateDoc(doc(db, 'users', referrerId), {
      coins: increment(REFERRER_COIN_REWARD),
      lockedCoins: increment(-REFERRER_COIN_REWARD),
    });

    // Log referrer coin transaction
    await addDoc(collection(db, 'coinTransactions'), {
      userId: referrerId,
      amount: REFERRER_COIN_REWARD,
      type: 'earning',
      source: `Referral reward — ${referral.referredUserPhone || userId} completed first order`,
      referralId: referralDoc.id,
      createdAt: now,
    });

    // 6. Reward referred user: bonus coins
    await updateDoc(doc(db, 'users', userId), {
      coins: increment(REFERRED_COIN_REWARD),
    });

    // Log referred user coin transaction
    await addDoc(collection(db, 'coinTransactions'), {
      userId: userId,
      amount: REFERRED_COIN_REWARD,
      type: 'earning',
      source: 'Welcome bonus — first order completed!',
      referralId: referralDoc.id,
      createdAt: now,
    });

    console.log(`✅ Referral reward processed: referrer=${referrerId}, referred=${userId}`);
  } catch (error) {
    console.error('Referral reward processing failed:', error);
    // Non-blocking — don't crash the order flow
  }
}
