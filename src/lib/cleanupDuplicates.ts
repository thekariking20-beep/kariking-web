import { collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';

export interface CleanupReport {
  totalUsers: number;
  uniquePhones: number;
  duplicatesFound: number;
  duplicatesDeleted: number;
  mergedUsers: string[]; // phone numbers that had data merged
  errors: string[];
}

/**
 * Scan the entire users collection for duplicate phone numbers.
 * For each phone with multiple docs:
 *   1. Keep the "best" doc (has name > no name, most recent createdAt)
 *   2. Merge important fields (coins, lockedCoins, referralCode, name, etc.)
 *   3. Delete all other duplicate docs
 * 
 * Returns a cleanup report.
 */
export async function cleanupDuplicateUsers(): Promise<CleanupReport> {
  const report: CleanupReport = {
    totalUsers: 0,
    uniquePhones: 0,
    duplicatesFound: 0,
    duplicatesDeleted: 0,
    mergedUsers: [],
    errors: [],
  };

  try {
    // 1. Fetch ALL users
    const snapshot = await getDocs(collection(db, 'users'));
    report.totalUsers = snapshot.size;

    // 2. Group by phone number
    const phoneMap = new Map<string, { id: string; data: User }[]>();
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as User;
      const phone = data.phone || docSnap.id; // fallback to doc ID if no phone
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push({ id: docSnap.id, data });
    });

    report.uniquePhones = phoneMap.size;

    // 3. Process each phone group
    for (const [phone, group] of phoneMap.entries()) {
      if (group.length <= 1) continue; // No duplicates for this phone

      report.duplicatesFound += group.length - 1;

      // Sort to find the "best" doc to keep
      group.sort((a, b) => {
        // Prefer docs with a name
        if (a.data.name && !b.data.name) return -1;
        if (!a.data.name && b.data.name) return 1;
        // Prefer docs with more coins
        const aCoins = (a.data.coins || 0) + (a.data.lockedCoins || 0);
        const bCoins = (b.data.coins || 0) + (b.data.lockedCoins || 0);
        if (aCoins !== bCoins) return bCoins - aCoins;
        // Prefer most recent
        return (b.data.createdAt || '').localeCompare(a.data.createdAt || '');
      });

      const keeper = group[0];
      const duplicates = group.slice(1);

      // Merge important fields from duplicates into the keeper
      let mergedCoins = keeper.data.coins || 0;
      let mergedLockedCoins = keeper.data.lockedCoins || 0;
      let mergedName = keeper.data.name;
      let mergedEmail = keeper.data.email;
      let mergedAddress = keeper.data.address;
      let mergedReferralCode = keeper.data.referralCode;
      let mergedProfileComplete = keeper.data.profileComplete;

      for (const dup of duplicates) {
        // Take the max coins (don't double-count, just keep highest)
        if ((dup.data.coins || 0) > mergedCoins) mergedCoins = dup.data.coins;
        if ((dup.data.lockedCoins || 0) > mergedLockedCoins) mergedLockedCoins = dup.data.lockedCoins;
        // Take name/email/address if keeper doesn't have it
        if (!mergedName && dup.data.name) mergedName = dup.data.name;
        if (!mergedEmail && dup.data.email) mergedEmail = dup.data.email;
        if (!mergedAddress && dup.data.address) mergedAddress = dup.data.address;
        if (!mergedReferralCode && dup.data.referralCode) mergedReferralCode = dup.data.referralCode;
        if (!mergedProfileComplete && dup.data.profileComplete) mergedProfileComplete = true;
      }

      // Update the keeper doc with merged data
      try {
        await setDoc(doc(db, 'users', keeper.id), {
          ...keeper.data,
          coins: mergedCoins,
          lockedCoins: mergedLockedCoins,
          ...(mergedName ? { name: mergedName } : {}),
          ...(mergedEmail ? { email: mergedEmail } : {}),
          ...(mergedAddress ? { address: mergedAddress } : {}),
          ...(mergedReferralCode ? { referralCode: mergedReferralCode } : {}),
          profileComplete: mergedProfileComplete,
        }, { merge: true });

        report.mergedUsers.push(phone);
      } catch (e: any) {
        report.errors.push(`Failed to merge data for ${phone}: ${e.message}`);
      }

      // Delete all duplicate docs
      for (const dup of duplicates) {
        try {
          await deleteDoc(doc(db, 'users', dup.id));
          report.duplicatesDeleted++;
          console.log(`🧹 Deleted duplicate: ${dup.id} (phone: ${phone})`);
        } catch (e: any) {
          report.errors.push(`Failed to delete ${dup.id}: ${e.message}`);
        }
      }
    }
  } catch (e: any) {
    report.errors.push(`Fatal error: ${e.message}`);
  }

  return report;
}
