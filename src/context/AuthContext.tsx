import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, updateDoc, increment, addDoc } from 'firebase/firestore';
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
          // New user — create their document
          const referredBy = localStorage.getItem('pendingReferralCode');

          // Check for provisioning (staff pre-registered by admin)
          let assignedRole: User['role'] = 'user';
          let profileComplete = false; // ALL new users must complete onboarding
          
          // Check if this is the hardcoded admin phone
          if (phoneNumber === ADMIN_PHONE) {
            assignedRole = 'admin';
            profileComplete = true; // Admin bypasses onboarding
          }

          // Check provisionedStaff collection
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
            const referrersQuery = query(collection(db, 'users'), where('referralCode', '==', referredBy));
            const referrerSnap = await getDocs(referrersQuery);
            if (!referrerSnap.empty) {
              const referrerDoc = referrerSnap.docs[0];
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
            localStorage.removeItem('pendingReferralCode');
          }
          
          setUser(newUser);
          // Register FCM token for new user
          registerPushNotifications(fUser.uid).catch(() => {});
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    localStorage.removeItem('hasSeenWelcome');
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
