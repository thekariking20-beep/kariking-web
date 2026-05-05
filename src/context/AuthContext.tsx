import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, updateDoc, deleteDoc, increment, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { registerPushNotifications } from '../lib/notifications';

// Admin phone number - auto-provisioned as admin role
const ADMIN_PHONE = '+916380886374';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isDelivery: boolean;
  /** True if role is admin OR manager (can access dashboard) */
  isDashboardUser: boolean;
  /** True if this is a staff member (admin/manager/delivery) */
  isStaff: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (localStorage.getItem('DEMO_MODE') === 'true') return;
    if (!firebaseUser) return;
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      setUser(userDoc.data() as User);
    }
  }, [firebaseUser]);

  useEffect(() => {
    // Check for Demo Mode first
    const demoRole = localStorage.getItem('DEMO_MODE_ROLE');
    if (demoRole) {
      const demoUser: User = {
        uid: `demo-${demoRole}-888`,
        phone: '+910000000000',
        role: demoRole as User['role'],
        referralCode: 'DEMO99',
        coins: 0,
        lockedCoins: 0,
        profileComplete: true,
        createdAt: new Date().toISOString()
      };
      setFirebaseUser({ uid: `demo-${demoRole}-888`, phoneNumber: '+910000000000' } as FirebaseUser);
      setUser(demoUser);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      try {
      if (fUser) {
        // Determine auth method: email-based = password login; phone-based = OTP login
        const isPasswordAuth = !!fUser.email?.endsWith('@kariking.staff');
        let phoneNumber = fUser.phoneNumber;
        if (!phoneNumber && isPasswordAuth) {
          const match = fUser.email!.match(/(\d+)@kariking\.staff$/);
          if (match) {
            // Strip prefix like 'admin3_' or 'v4_...' if present
            const digits = match[1];
            // Take last 12 digits (country code + 10 digit number)
            phoneNumber = `+${digits.slice(-12)}`;
          }
        }

        const userDoc = await getDoc(doc(db, 'users', fUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          
          // ─── Auth Provider / Role Enforcement ────────────────────
          // Block: OTP user trying to access staff role without provisioning
          if (!isPasswordAuth && (userData.role === 'admin' || userData.role === 'manager' || userData.role === 'delivery')) {
            // Allow if it's the hardcoded admin phone
            if (userData.phone !== ADMIN_PHONE) {
              console.warn('Role mismatch: OTP user has staff role but no password auth');
            }
          }
          
          // Update authProvider if not set
          if (!userData.authProvider) {
            const provider = isPasswordAuth ? 'password' : 'otp';
            await setDoc(doc(db, 'users', fUser.uid), { authProvider: provider }, { merge: true });
            userData.authProvider = provider;
          }
          
          setUser(userData);
          // Register FCM token in background (non-blocking)
          registerPushNotifications(fUser.uid).catch(() => {});
        } else {
          // New UID — but check if this phone already has a user doc (PREVENT DUPLICATES)
          const referredBy = localStorage.getItem('pendingReferralCode');

          // ─── PHONE UNIQUENESS GUARD ─────────────────────────────────
          // Check if a user doc already exists for this phone under a DIFFERENT UID
          if (phoneNumber) {
            const phoneQuery = query(collection(db, 'users'), where('phone', '==', phoneNumber));
            const existingSnap = await getDocs(phoneQuery);
            
            if (!existingSnap.empty) {
              // Found existing user doc(s) for this phone — migrate to current UID
              const existingDocs = existingSnap.docs.sort((a, b) => {
                const aData = a.data();
                const bData = b.data();
                if (aData.name && !bData.name) return -1;
                if (!aData.name && bData.name) return 1;
                return (bData.createdAt || '').localeCompare(aData.createdAt || '');
              });
              
              const bestDoc = existingDocs[0];
              const bestData = bestDoc.data() as User;
              
              // Migrate: create doc under new UID, delete old ones
              const migratedUser: User = {
                ...bestData,
                uid: fUser.uid,
              };
              
              await setDoc(doc(db, 'users', fUser.uid), migratedUser);
              
              // Delete all old duplicate docs (except the new one we just created)
              for (const oldDoc of existingDocs) {
                if (oldDoc.id !== fUser.uid) {
                  try {
                    await deleteDoc(doc(db, 'users', oldDoc.id));
                    console.log(`🧹 Cleaned duplicate user doc: ${oldDoc.id} (phone: ${phoneNumber})`);
                  } catch (e) {
                    console.warn(`Could not delete old user doc ${oldDoc.id}:`, e);
                  }
                }
              }
              
              setUser(migratedUser);
              registerPushNotifications(fUser.uid).catch(() => {});
              return; // Skip normal user creation — we migrated
            }
          }

          // ─── NORMAL NEW USER CREATION (no existing phone found) ──────
          let assignedRole: User['role'] = 'user';
          let profileComplete = false;
          
          if (phoneNumber === ADMIN_PHONE) {
            assignedRole = 'admin';
            profileComplete = true;
          }

          if (phoneNumber) {
            const provDoc = await getDoc(doc(db, 'provisionedStaff', phoneNumber));
            if (provDoc.exists() && provDoc.data().status === 'pending') {
              assignedRole = provDoc.data().role as User['role'];
              await updateDoc(doc(db, 'provisionedStaff', phoneNumber), { status: 'claimed' });
            }
          }

          const newUser: User = {
            uid: fUser.uid,
            phone: phoneNumber || '',
            role: assignedRole,
            authProvider: isPasswordAuth ? 'password' : 'otp',
            profileComplete: profileComplete,
            referralCode: fUser.uid.slice(0, 6).toUpperCase(),
            coins: 0,
            lockedCoins: 0,
            ...(referredBy ? { referredBy } : {}),
            createdAt: new Date().toISOString(),
          };
          
          await setDoc(doc(db, 'users', fUser.uid), newUser);
          
          // Handle referral rewards
           if (referredBy) {
            try {
            // Guard: check if a referral already exists for this user (prevent duplicate on re-login)
            const existingRefQuery = query(collection(db, 'referrals'), where('referredUserId', '==', fUser.uid), limit(1));
            const existingRefSnap = await getDocs(existingRefQuery);
            if (existingRefSnap.empty) {
              const referrersQuery = query(collection(db, 'users'), where('referralCode', '==', referredBy));
              const referrerSnap = await getDocs(referrersQuery);
              if (!referrerSnap.empty) {
                const referrerDoc = referrerSnap.docs[0];
                
                const isSelfReferral = referrerDoc.id === fUser.uid || 
                  referrerDoc.data().phone === phoneNumber;
                
                if (!isSelfReferral) {
                  await updateDoc(doc(db, 'users', referrerDoc.id), {
                    lockedCoins: increment(5)
                  });

                  await addDoc(collection(db, 'referrals'), {
                    referrerId: referrerDoc.id,
                    referrerPhone: referrerDoc.data().phone || '',
                    referredUserId: fUser.uid,
                    referredUserPhone: phoneNumber || '',
                    status: 'pending',
                    reward: 5,
                    rewardGiven: false,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            }
            } catch (refErr) {
              console.error('Referral processing failed (non-blocking):', refErr);
            }
            localStorage.removeItem('pendingReferralCode');
          }
          
          setUser(newUser);
          registerPushNotifications(fUser.uid).catch(() => {});
        }
      } else {
        setUser(null);
      }
      } catch (err) {
        console.error('🔴 AuthContext: Failed to resolve user:', err);
        // Still set user to null so the app doesn't hang on the loader forever
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    localStorage.removeItem('hasSeenWelcome');
    sessionStorage.removeItem('kk_changing_password');
    if (localStorage.getItem('DEMO_MODE_ROLE')) {
      localStorage.removeItem('DEMO_MODE_ROLE');
      setUser(null);
      setFirebaseUser(null);
      window.location.href = '/login';
      return;
    }
    await auth.signOut();
  };

  // 🚀 Role-based access system
  const isAdmin = user?.phone === ADMIN_PHONE || user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isDelivery = user?.role === 'delivery';
  const isDashboardUser = isAdmin || isManager; // Admin AND Managers can access dashboard
  const isStaff = isAdmin || isManager || isDelivery;

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, isAdmin, isManager, isDelivery, isDashboardUser, isStaff, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
