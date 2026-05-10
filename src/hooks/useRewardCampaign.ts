import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { RewardCampaign } from '../types';

export function useRewardCampaign() {
  const [activeCampaign, setActiveCampaign] = useState<RewardCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We only care about campaigns that are explicitly marked active.
    // Realtime date filtering requires careful indexing, so we filter dates in-memory for safety and simplicity
    // unless the admin explicitly toggles isActive to false.
    const q = query(
      collection(db, 'rewardCampaigns'),
      where('isActive', '==', true)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setActiveCampaign(null);
        setLoading(false);
        return;
      }

      const now = new Date();
      let found: RewardCampaign | null = null;

      // Find the first campaign that is currently within its active date window
      for (const doc of snap.docs) {
        const campaign = { id: doc.id, ...doc.data() } as RewardCampaign;
        const starts = new Date(campaign.startsAt);
        const ends = new Date(campaign.endsAt);

        if (now >= starts && now <= ends) {
          found = campaign;
          break; // Support one active campaign at a time
        }
      }

      setActiveCampaign(found);
      setLoading(false);
    }, (err) => {
      console.error("Error syncing reward campaign:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { activeCampaign, loading };
}
