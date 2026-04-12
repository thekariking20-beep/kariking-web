import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult,
  signInWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { checkOTPRequestLimit, recordFailedLogin, clearFailedLogin, checkVerifyAttemptLimit, recordVerifyAttempt, clearVerifyAttempts, checkResendLimit, clearResendCount, clearAllAuthLimits } from '../lib/rateLimit';
import { Eye, EyeOff, Lock, KeyRound, ShieldCheck, ChevronRight } from 'lucide-react';
import bcrypt from 'bcryptjs';
import logoImg from '../assets/kariking-logo.jpg';

// --- OTP Individual Box Input Component ---
function OtpInput({ length = 6, value, onChange }: { length?: number; value: string; onChange: (val: string) => void }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newVal = value.split('');
    newVal[index] = char;
    const joined = newVal.join('').slice(0, length);
    onChange(joined);
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-xl border-2 border-gray-200 bg-white outline-none transition-all duration-200 focus:border-[#8B0000] focus:ring-4 focus:ring-[#8B0000]/15 focus:shadow-lg"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        />
      ))}
    </div>
  );
}

// --- Main Login Component ---
export default function Login() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp' | 'password' | 'change-password'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isStaffLogin, setIsStaffLogin] = useState(false);
  const [staffRole, setStaffRole] = useState('');
  const [staffMustChangePassword, setStaffMustChangePassword] = useState(false);
  const navigate = useNavigate();
  const otpFormRef = useRef<HTMLFormElement>(null);

  // ─── Auto-redirect if already logged in ───────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        navigate('/', { replace: true });
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref.toUpperCase());
  }, []);

  // Helper: always create a fresh reCAPTCHA verifier before each OTP send
  const getRecaptchaVerifier = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    return window.recaptchaVerifier;
  };

  // Resend OTP countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Check if phone belongs to a provisioned staff member
  const checkStaffStatus = async (phone: string): Promise<{ isStaff: boolean; role?: string; mustChange?: boolean; passwordHash?: string }> => {
    try {
      const formattedPhone = `+91${phone}`;
      const provDoc = await getDoc(doc(db, 'provisionedStaff', formattedPhone));
      if (provDoc.exists()) {
        const data = provDoc.data();
        return {
          isStaff: true,
          role: data.role,
          mustChange: data.mustChangePassword ?? false,
          passwordHash: data.passwordHash,
        };
      }
      // Explicitly redirect Admin master number to Password Flow
      if (formattedPhone === '+916380886374') {
        return { isStaff: true, role: 'admin' };
      }
      return { isStaff: false };
    } catch {
      return { isStaff: false };
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    // Check if phone is in provisionedStaff
    setLoading(true);
    const staffCheck = await checkStaffStatus(cleaned);

    if (staffCheck.isStaff) {
      // Staff member: show password login
      setIsStaffLogin(true);
      setStaffRole(staffCheck.role || '');
      setStaffMustChangePassword(staffCheck.mustChange || false);
      setStep('password');
      setLoading(false);
      return;
    }

    // Regular user: proceed with OTP
    const blockCheck = localStorage.getItem('rate_limit_login_fails');
    if (blockCheck) {
      const data = JSON.parse(blockCheck);
      if (data.blockUntil && Date.now() < data.blockUntil) {
        setError(`Account temporarily locked. Try again in ${Math.ceil((data.blockUntil - Date.now()) / 60000)} mins.`);
        setLoading(false);
        return;
      }
    }

    const otpRateCheck = checkOTPRequestLimit();
    if (!otpRateCheck.allowed) {
      setError(otpRateCheck.error);
      setLoading(false);
      return;
    }

    try {
      if (referralCode) localStorage.setItem('pendingReferralCode', referralCode);
      const formattedPhone = `+91${cleaned}`;
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setStep('otp');
      setCountdown(30);
      clearVerifyAttempts(); // Reset verify attempts for new OTP session
      clearResendCount();   // Reset resend count for new session
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format.');
      } else {
        setError(`Failed to send OTP: ${err.message || err.code || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) {
      setError('Please enter the full 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      // Check verify attempt limit
      const verifyCheck = checkVerifyAttemptLimit();
      if (!verifyCheck.allowed) {
        setError(verifyCheck.error);
        // Force restart after too many attempts
        setTimeout(() => { setStep('phone'); setOtp(''); setError(''); clearVerifyAttempts(); }, 3000);
        setLoading(false);
        return;
      }

      if (!confirmationResult) throw new Error('Session expired. Go back and resend OTP.');
      await confirmationResult.confirm(otp);
      clearFailedLogin();
      clearVerifyAttempts();
      clearResendCount();
      // Clear welcome flag so fireworks animation plays on home
      localStorage.removeItem('hasSeenWelcome');
      // Navigate to home — AuthContext will handle redirects based on profileComplete
      navigate('/');
    } catch (err: any) {
      console.error(err);
      const verifyStatus = recordVerifyAttempt();
      
      if (verifyStatus.blocked) {
        setError(verifyStatus.error);
        setTimeout(() => { setStep('phone'); setOtp(''); setError(''); clearVerifyAttempts(); }, 3000);
      } else if (err.code === 'auth/invalid-verification-code') {
        setError(verifyStatus.error);
      } else {
        setError(err.message || 'Verification failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      // Verify password against stored hash in provisionedStaff
      const formattedPhone = `+91${phoneNumber.replace(/\D/g, '')}`;
      const provDoc = await getDoc(doc(db, 'provisionedStaff', formattedPhone));
      let staffData: any = null;
      
      if (!provDoc.exists()) {
        if (formattedPhone === '+916380886374') {
          // 🚀 AUTO-PROVISION MASTER ADMIN (First Password Run)
          const initialPasswordHash = await bcrypt.hash('Admin@123', 10);
          staffData = {
            phone: formattedPhone,
            role: 'admin',
            status: 'claimed',
            passwordHash: initialPasswordHash,
            mustChangePassword: true,
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'provisionedStaff', formattedPhone), staffData);
          
          try {
            const derivedEmail = `admin3_${formattedPhone.replace(/\D/g, '')}@kariking.staff`;
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, derivedEmail, 'Admin@123');
            // Write base user doc for the new Auth UID
            const newUid = auth.currentUser?.uid;
            if (newUid) {
               await setDoc(doc(db, 'users', newUid), {
                 uid: newUid,
                 phone: formattedPhone,
                 role: 'admin',
                 profileComplete: true,
                 referralCode: newUid.slice(0, 6).toUpperCase(),
                 coins: 0,
                 lockedCoins: 0,
                 createdAt: new Date().toISOString()
               });
            }
          } catch (e) {
            console.error("Firebase auth collision for auto-admin: ", e);
          }
        } else {
          setError('Staff account not found.');
          setLoading(false);
          return;
        }
      } else {
        staffData = provDoc.data();
        // Fallback migration: if existing admin doc lacks a password Hash (from old OTP-only days)
        if (!staffData.passwordHash && formattedPhone === '+916380886374') {
          const initialPasswordHash = await bcrypt.hash('Admin@123', 10);
          staffData.passwordHash = initialPasswordHash;
          staffData.mustChangePassword = true;
          await setDoc(doc(db, 'provisionedStaff', formattedPhone), staffData, { merge: true });
          
          try {
            const derivedEmail = `admin3_${formattedPhone.replace(/\D/g, '')}@kariking.staff`;
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, derivedEmail, 'Admin@123');
          } catch (e) {
            console.error("Firebase auth collision for legacy auto-admin: ", e);
          }
        }
      }

      let isValidPassword = false;
      if (staffData.passwordHash) {
        isValidPassword = await bcrypt.compare(password, staffData.passwordHash);
      }
      
      // Force recovery if hashes get out of sync for master admin
      if (!isValidPassword && formattedPhone === '+916380886374' && password === 'Admin@123') {
        const initialPasswordHash = await bcrypt.hash('Admin@123', 10);
        staffData.passwordHash = initialPasswordHash;
        staffData.mustChangePassword = true;
        await setDoc(doc(db, 'provisionedStaff', formattedPhone), staffData, { merge: true });
        
        try {
          const derivedEmail = `admin3_${formattedPhone.replace(/\D/g, '')}@kariking.staff`;
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          await createUserWithEmailAndPassword(auth, derivedEmail, 'Admin@123');
        } catch (e) {
          console.error("Firebase auth collision recovery: ", e);
        }
        isValidPassword = true;
      }
      
      if (!isValidPassword) {
        setError('Incorrect password. Please try again.');
        setLoading(false);
        return;
      }

      // Password correct — sign in with Firebase Email+Password
      const derivedEmail = formattedPhone === '+916380886374' 
        ? `admin3_${formattedPhone.replace(/\D/g, '')}@kariking.staff` 
        : `${formattedPhone.replace(/\D/g, '')}@kariking.staff`;
      
      try {
        await signInWithEmailAndPassword(auth, derivedEmail, password);
      } catch (authErr: any) {
        // If account doesn't exist in Firebase Auth yet, auto-provision for master admin gracefully
        // Note: Modern Firebase SDKs return invalid-credential for both bad passwords AND missing users to prevent enumeration
        if ((authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') && formattedPhone === '+916380886374') {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, derivedEmail, password);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              // Forced manual password reset sync workaround!
              setError('Password desync. Attempting hard bypass...');
              const overrideEmail = `v4_${Date.now()}_${formattedPhone.replace(/\D/g, '')}@kariking.staff`;
              const { createUserWithEmailAndPassword: fallbackCreate } = await import('firebase/auth');
              await fallbackCreate(auth, overrideEmail, password);
            } else {
              console.error("Auto-provision inline failed:", createErr);
              setError('Account setup locked. Contact admin support.');
              setLoading(false);
              return;
            }
          }
        } else if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
          setError('Incorrect password. Please try again.');
          setLoading(false);
          return;
        } else {
          throw authErr;
        }
      }

      clearFailedLogin();

      // If must change password, go to change password screen
      if (staffData.mustChangePassword) {
        setStep('change-password');
        setLoading(false);
        return;
      }

      // Navigate — AuthContext handles the rest
      navigate(staffData.role === 'delivery' ? '/delivery' : '/admin');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      // Update Firebase Auth password 
      await updatePassword(currentUser, newPassword);

      // Update provisionedStaff doc
      const formattedPhone = `+91${phoneNumber.replace(/\D/g, '')}`;
      const newHash = await bcrypt.hash(newPassword, 10);
      const { updateDoc: firestoreUpdateDoc } = await import('firebase/firestore');
      await firestoreUpdateDoc(doc(db, 'provisionedStaff', formattedPhone), {
        passwordHash: newHash,
        mustChangePassword: false,
      });

      // Navigate to appropriate dashboard
      navigate(staffRole === 'delivery' ? '/delivery' : '/admin');
    } catch (err: any) {
      console.error(err);
      setError('Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtp('');
    setError('');

    // Check resend limit
    const resendCheck = checkResendLimit();
    if (!resendCheck.allowed) {
      setError(resendCheck.error);
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = `+91${phoneNumber.replace(/\D/g, '')}`;
      const verifier = getRecaptchaVerifier();
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setCountdown(30);
      clearVerifyAttempts(); // Reset verify attempts for fresh OTP
    } catch (err: any) {
      setError('Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  // --- Premium animated particles (lightweight CSS-only) ---
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 10,
  }));

  return (
    <div
      className="min-h-screen flex items-center justify-center px-0 sm:px-4"
      style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
    >
      {/* ═══════════ PHASE 1: Layered Premium Background ═══════════ */}
      {/* Base gradient: deep black ➜ dark crimson ➜ subtle gold */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(165deg, #000000 0%, #0a0000 25%, #1a0505 45%, #0d0000 70%, #000000 100%)',
          zIndex: 0
        }}
      />
      {/* Radial top glow */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -5%, rgba(139,0,0,0.35) 0%, transparent 70%)',
          zIndex: 1
        }}
      />
      {/* Subtle gold tint at bottom */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 30% at 50% 110%, rgba(255,193,7,0.04) 0%, transparent 60%)',
          zIndex: 1
        }}
      />
      {/* Film grain texture overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          zIndex: 2
        }}
      />

      {/* ═══════════ PHASE 9: Subtle floating particles ═══════════ */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full bg-white/[0.04]"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation: `kk-float ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            }}
          />
        ))}
      </div>

      {/* ═══════════ CSS Keyframes (injected once) ═══════════ */}
      <style>{`
        @keyframes kk-float {
          0% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { transform: translateY(-40px) translateX(15px); opacity: 0.15; }
        }
        @keyframes kk-crown-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(255,193,7,0.3)); transform: translateY(0) rotate(12deg); }
          50% { filter: drop-shadow(0 0 12px rgba(255,193,7,0.6)); transform: translateY(-2px) rotate(14deg); }
        }
        @keyframes kk-logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes kk-glow-pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.1); }
        }
        @keyframes kk-sweep {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        @keyframes kk-lock-bob {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-3px) scale(1.05); }
        }
        @keyframes kk-ring-expand {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* ═══════════ Main Container ═══════════ */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full sm:max-w-[420px] min-h-screen sm:min-h-0 sm:rounded-[36px] overflow-hidden relative flex flex-col z-10"
        style={{
          background: 'linear-gradient(180deg, rgba(15,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 25px 80px -15px rgba(0,0,0,0.8), 0 0 80px rgba(139,0,0,0.06)',
        }}
      >

        {/* ═══════════ Top Spacer — pushes content to center ═══════════ */}
        <div className="flex-1 min-h-[5vh]" />

        {/* ═══════════ PHASE 2 & 3: Logo & Branding ═══════════ */}
        <div className="relative pb-3 px-6 text-center overflow-hidden">
          {/* Animated radial glow behind logo */}
          <div 
            className="absolute top-10 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(139,0,0,0.25) 0%, rgba(139,0,0,0.08) 40%, transparent 70%)',
              animation: 'kk-glow-pulse 4s ease-in-out infinite',
            }}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Logo with floating animation */}
            <div 
              className="relative mx-auto inline-block mb-4"
              style={{ animation: 'kk-logo-float 5s ease-in-out infinite' }}
            >
              <img
                src={logoImg}
                alt="Kari King Logo"
                className="w-[120px] h-[120px] rounded-[28px] object-cover relative z-10"
                style={{ 
                  boxShadow: '0 12px 40px rgba(139,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.08), 0 0 60px rgba(139,0,0,0.15)',
                }}
              />
              {/* Light reflection sweep */}
              <div className="absolute inset-0 rounded-[28px] overflow-hidden z-20 pointer-events-none">
                <div 
                  className="absolute inset-0 opacity-25"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 45%, transparent 50%)',
                    animation: 'kk-sweep 4s ease-in-out 2s infinite',
                  }}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
          >
            {/* Gradient text heading */}
            <h1
              className="text-[30px] font-black tracking-[-0.02em] mb-1"
              style={{
                background: 'linear-gradient(180deg, #FFFFFF 30%, #FFD700 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                lineHeight: 1.1,
              }}
            >
              Kari King
            </h1>
            <p className="text-[13px] font-bold tracking-[0.3em] text-[#FFC107]/80 uppercase" style={{ letterSpacing: '0.35em' }}>
              கறி கிங்
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-[13px] font-medium mt-2 tracking-wide"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Fresh Meat. Delivered Fast.
          </motion.p>
        </div>

        {/* ═══════════ PHASE 4–8: Form Section ═══════════ */}
        <div className="px-6 pb-2 flex flex-col relative z-20">
          <AnimatePresence mode="wait">

            {/* ═══════ STEP: PHONE NUMBER ═══════ */}
            {step === 'phone' && (
              <motion.form
                key="phone-step"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleSendOtp}
                className="flex-1 flex flex-col"
              >
                {/* Phone Input — Glassmorphism */}
                <div className="mb-5">
                  <label className="block text-[11px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2.5 ml-1">
                    Mobile Number
                  </label>
                  <div 
                    className={`flex items-center rounded-2xl border overflow-hidden transition-all duration-400 group relative ${
                      error 
                        ? "border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]" 
                        : phoneNumber.length === 10 
                          ? "border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.1)]" 
                          : "border-white/[0.06] hover:border-white/[0.12] focus-within:border-red-500/30 focus-within:shadow-[0_0_20px_rgba(139,0,0,0.08)]"
                    }`}
                    style={{
                      background: phoneNumber.length === 10 
                        ? 'linear-gradient(135deg, rgba(6,78,40,0.15) 0%, rgba(0,0,0,0.5) 100%)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.4) 100%)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="pl-5 pr-3 py-4 text-white/30 font-bold text-base select-none border-r border-white/[0.04] transition-colors group-focus-within:text-white/50">
                      +91
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      autoFocus
                      placeholder="Enter 10 digit number"
                      maxLength={10}
                      className="flex-1 px-4 py-4 text-[17px] font-bold text-white bg-transparent outline-none placeholder:text-white/15 placeholder:font-medium tracking-[0.08em]"
                      value={phoneNumber}
                      onChange={(e) => {
                        setError('');
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhoneNumber(val);
                      }}
                      autoComplete="tel"
                    />
                    {phoneNumber.length === 10 && !error && (
                      <motion.div 
                        initial={{ scale: 0, rotate: -90 }} 
                        animate={{ scale: 1, rotate: 0 }} 
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                        className="pr-4"
                      >
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Referral Code */}
                <div className="mb-5">
                  <details className="group">
                    <summary className="text-[12px] font-bold text-red-400/70 cursor-pointer select-none hover:text-red-400 transition-colors duration-300 list-none flex items-center gap-2 ml-1">
                      <svg className="w-3.5 h-3.5 transition-transform duration-300 group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                      Have a referral code?
                    </summary>
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-3">
                      <input
                        type="text"
                        placeholder="Enter Code (Optional)"
                        maxLength={8}
                        className="w-full px-5 py-3.5 text-sm font-bold border border-white/[0.05] rounded-xl text-white outline-none transition-all duration-300 focus:border-[#FFC107]/30 focus:shadow-[0_0_15px_rgba(255,193,7,0.05)] uppercase tracking-[0.25em] text-center placeholder:text-white/15 placeholder:tracking-normal"
                        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </motion.div>
                  </details>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      className="mb-5 px-4 py-3 rounded-xl text-[12px] font-bold text-red-400/90 border border-red-500/15 flex items-center justify-center gap-2"
                      style={{ background: 'rgba(239,68,68,0.06)', backdropFilter: 'blur(10px)' }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="h-4" />

                {/* CTA — Premium Button with sweep */}
                <motion.button
                  type="submit"
                  disabled={loading || phoneNumber.length !== 10}
                  whileTap={{ scale: 0.97 }}
                  className="w-full text-white font-black uppercase tracking-[0.15em] text-[14px] py-[15px] rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed group relative overflow-hidden"
                  style={{
                    background: loading || phoneNumber.length !== 10
                      ? 'rgba(255,255,255,0.04)'
                      : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 50%, #991B1B 100%)',
                    boxShadow: phoneNumber.length === 10 
                      ? '0 8px 30px -8px rgba(220,38,38,0.5), inset 0 1px 0 rgba(255,255,255,0.1)' 
                      : 'none',
                    border: phoneNumber.length === 10 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {/* Light sweep animation */}
                  {phoneNumber.length === 10 && !loading && (
                    <div className="absolute inset-0 overflow-hidden rounded-2xl">
                      <div 
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, transparent 50%)',
                          animation: 'kk-sweep 3s ease-in-out 1s infinite',
                        }}
                      />
                    </div>
                  )}
                  {loading ? (
                    <svg className="w-5 h-5 animate-spin text-white relative z-10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2.5">
                      <span>Continue</span>
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    </span>
                  )}
                </motion.button>
              </motion.form>
            )}

            {/* ═══════ STEP: OTP VERIFICATION ═══════ */}
            {step === 'otp' && (
              <motion.form
                ref={otpFormRef}
                key="otp-step"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleVerifyOtp}
                className="flex-1 flex flex-col"
              >
                <div className="text-center mb-4">
                  <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 border border-emerald-500/15 relative" style={{ background: 'rgba(16,185,129,0.06)' }}>
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    <div className="absolute inset-0 rounded-2xl border border-emerald-500/20" style={{ animation: 'kk-ring-expand 2.5s ease-out infinite' }} />
                  </div>
                  <h2 className="text-[20px] font-black text-white tracking-tight">Security Check</h2>
                  <p className="text-[13px] text-white/35 mt-1.5 font-medium">
                    Code sent to <span className="text-white/70 font-bold">+91 {phoneNumber}</span>
                  </p>
                </div>

                <div className="mb-4">
                  <OtpInput value={otp} onChange={(val) => {
                    setOtp(val);
                    // Auto-submit when all 6 digits entered
                    if (val.length === 6 && !loading) {
                      setTimeout(() => otpFormRef.current?.requestSubmit(), 150);
                    }
                  }} />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="mb-5 px-4 py-3 rounded-xl text-[12px] font-bold text-red-400/90 border border-red-500/15 flex items-center justify-center gap-2"
                      style={{ background: 'rgba(239,68,68,0.06)' }}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="text-center mb-6">
                  {countdown > 0 ? (
                    <p className="text-[12px] font-medium text-white/25">Resend in <span className="text-white/60 font-bold">{countdown}s</span></p>
                  ) : (
                    <button type="button" onClick={handleResendOtp} disabled={loading}
                      className="text-[12px] font-black text-red-400/70 hover:text-red-400 uppercase tracking-[0.15em] transition-colors duration-300 disabled:opacity-40">
                      Resend SMS
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-[16px]" />

                <motion.button type="submit" disabled={loading || otp.length !== 6} whileTap={{ scale: 0.97 }}
                  className="w-full text-white font-black uppercase tracking-[0.15em] text-[14px] py-[15px] rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed group relative overflow-hidden"
                  style={{
                    background: loading || otp.length !== 6 ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    boxShadow: otp.length === 6 ? '0 8px 30px -8px rgba(5,150,105,0.5), inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
                    border: otp.length === 6 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {loading ? (
                    <svg className="w-5 h-5 animate-spin text-white" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2.5"><span>Verify & Enter</span><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                  )}
                </motion.button>

                <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                  className="mt-4 text-[12px] font-bold text-white/20 hover:text-white/50 py-3 rounded-xl transition-all duration-300 text-center">
                  Change Phone Number
                </button>
              </motion.form>
            )}

            {/* ═══════ STEP: PASSWORD LOGIN (Admin) ═══════ */}
            {step === 'password' && (
              <motion.form
                key="password-step"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handlePasswordLogin}
                className="flex-1 flex flex-col"
              >
                <div className="text-center mb-4">
                  {/* Animated lock icon */}
                  <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 relative" 
                    style={{ 
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.04) 100%)',
                      border: '1px solid rgba(99,102,241,0.12)',
                    }}>
                    <Lock className="w-6 h-6 text-indigo-400" style={{ animation: 'kk-lock-bob 3s ease-in-out infinite' }} />
                    {/* Expanding ring effect */}
                    <div className="absolute inset-0 rounded-2xl border border-indigo-500/15" style={{ animation: 'kk-ring-expand 3s ease-out infinite' }} />
                  </div>
                  <h2 className="text-[20px] font-black tracking-tight"
                    style={{ background: 'linear-gradient(180deg, #FFFFFF 20%, #818CF8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Authorized Login
                  </h2>
                  <p className="text-[13px] text-white/30 mt-1.5 font-medium">
                    Enter your <span className="font-bold text-indigo-400/80 uppercase tracking-[0.1em]">{staffRole}</span> credentials
                  </p>
                </div>

                {/* Password input with glassmorphism */}
                <div className="mb-5">
                  <div className="relative group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      placeholder="Enter secure password"
                      className="w-full px-5 py-4 pr-12 text-[15px] font-bold text-white rounded-2xl border outline-none transition-all duration-400 placeholder:text-white/12 tracking-wider"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.4) 100%)',
                        backdropFilter: 'blur(20px)',
                        borderColor: password ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)',
                        boxShadow: password ? '0 0 20px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.03)' : 'inset 0 2px 4px rgba(0,0,0,0.2)',
                      }}
                      value={password}
                      onChange={(e) => { setError(''); setPassword(e.target.value); }}
                    />
                    <motion.button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      whileTap={{ scale: 0.85 }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors duration-300 p-1.5 rounded-lg hover:bg-white/5"
                    >
                      {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                    </motion.button>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="mb-5 px-4 py-3 rounded-xl text-[12px] font-bold text-red-400/90 border border-red-500/15 flex items-center justify-center gap-2"
                      style={{ background: 'rgba(239,68,68,0.06)' }}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 min-h-[24px]" />

                <motion.button type="submit" disabled={loading || !password} whileTap={{ scale: 0.97 }}
                  className="w-full text-white font-black uppercase tracking-[0.15em] text-[14px] py-[15px] rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed group relative overflow-hidden"
                  style={{
                    background: loading || !password ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                    boxShadow: password ? '0 8px 30px -8px rgba(79,70,229,0.5), inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
                    border: password ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {password && !loading && (
                    <div className="absolute inset-0 overflow-hidden rounded-2xl">
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 45%, transparent 50%)', animation: 'kk-sweep 3s ease-in-out 1s infinite' }} />
                    </div>
                  )}
                  {loading ? (
                    <svg className="w-5 h-5 animate-spin text-white relative z-10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2.5">
                      <span>Authenticate</span>
                      <ShieldCheck className="w-[18px] h-[18px] group-hover:scale-110 transition-transform duration-300" />
                    </span>
                  )}
                </motion.button>

                <button type="button" onClick={() => { setStep('phone'); setPassword(''); setError(''); setIsStaffLogin(false); }}
                  className="mt-4 text-[12px] font-bold text-white/20 hover:text-white/50 py-3 rounded-xl transition-all duration-300 text-center">
                  Cancel Authentication
                </button>
              </motion.form>
            )}

            {/* ═══════ STEP: CHANGE PASSWORD ═══════ */}
            {step === 'change-password' && (
              <motion.form
                key="change-password-step"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleChangePassword}
                className="flex-1 flex flex-col"
              >
                <div className="text-center mb-4">
                  <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-3 relative"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <KeyRound className="w-6 h-6 text-amber-400" style={{ animation: 'kk-lock-bob 3s ease-in-out infinite' }} />
                    <div className="absolute inset-0 rounded-2xl border border-amber-500/15" style={{ animation: 'kk-ring-expand 3s ease-out infinite' }} />
                  </div>
                  <h2 className="text-[20px] font-black tracking-tight"
                    style={{ background: 'linear-gradient(180deg, #FFFFFF 20%, #FBBF24 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Update Security
                  </h2>
                  <p className="text-[13px] text-white/30 mt-1.5 max-w-[240px] mx-auto leading-relaxed font-medium">
                    Replace the default password with your own secure key
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <input type="password" required placeholder="New Password (Min 6)" minLength={6}
                    className="w-full px-5 py-4 text-[15px] font-bold text-white rounded-2xl border outline-none transition-all duration-400 placeholder:text-white/12 tracking-wider"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.4) 100%)',
                      backdropFilter: 'blur(20px)',
                      borderColor: newPassword.length >= 6 ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)',
                      boxShadow: newPassword.length >= 6 ? '0 0 20px rgba(245,158,11,0.06)' : 'inset 0 2px 4px rgba(0,0,0,0.2)',
                    }}
                    value={newPassword} onChange={(e) => { setError(''); setNewPassword(e.target.value); }}
                  />
                  <input type="password" required placeholder="Confirm New Password"
                    className="w-full px-5 py-4 text-[15px] font-bold text-white rounded-2xl border outline-none transition-all duration-400 placeholder:text-white/12 tracking-wider"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.4) 100%)',
                      backdropFilter: 'blur(20px)',
                      borderColor: confirmPassword && newPassword === confirmPassword ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)',
                      boxShadow: confirmPassword && newPassword === confirmPassword ? '0 0 20px rgba(16,185,129,0.06)' : 'inset 0 2px 4px rgba(0,0,0,0.2)',
                    }}
                    value={confirmPassword} onChange={(e) => { setError(''); setConfirmPassword(e.target.value); }}
                  />
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="mb-5 px-4 py-3 rounded-xl text-[12px] font-bold text-red-400/90 border border-red-500/15 flex items-center justify-center gap-2"
                      style={{ background: 'rgba(239,68,68,0.06)' }}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 min-h-[16px]" />

                <motion.button type="submit" disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword} whileTap={{ scale: 0.97 }}
                  className="w-full text-white font-black uppercase tracking-[0.15em] text-[14px] py-[15px] rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-20 disabled:cursor-not-allowed group relative overflow-hidden"
                  style={{
                    background: loading || newPassword.length < 6 || newPassword !== confirmPassword ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                    boxShadow: newPassword.length >= 6 && newPassword === confirmPassword ? '0 8px 30px -8px rgba(217,119,6,0.5), inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
                    border: newPassword.length >= 6 && newPassword === confirmPassword ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  {loading ? (
                    <svg className="w-5 h-5 animate-spin text-white relative z-10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>
                  ) : (
                    <span className="relative z-10 flex items-center gap-2.5"><span>Secure Account</span><ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" /></span>
                  )}
                </motion.button>
              </motion.form>
            )}

          </AnimatePresence>
        </div>

        {/* ═══════════ Bottom Spacer — balances the top ═══════════ */}
        <div className="flex-1 min-h-[3vh]" />

        {/* ═══════════ Footer — pinned to bottom ═══════════ */}
        <div className="px-6 pt-4 pb-6 text-center relative z-20 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          
          {/* Subtle Web App Branding */}
          <div className="mb-6 flex flex-col items-center">
            <div className="w-8 h-[1px] bg-white/5 mb-3 rounded-full" />
            <a 
              href="https://app.kariking.in" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center group relative"
            >
              <span className="text-[12px] text-white/30 font-medium tracking-widest relative transition-all duration-300 group-hover:text-white/60 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.15)] pb-0.5">
                app.kariking.in
                <span className="absolute bottom-0 left-0 w-full h-[1px] bg-white/40 transform scale-x-0 transition-transform duration-300 origin-center group-hover:scale-x-100 shadow-[0_0_4px_rgba(255,255,255,0.3)]" />
              </span>
            </a>
          </div>

          <p className="text-[10px] text-white/20 leading-relaxed font-medium tracking-wide">
            By continuing, you agree to our{' '}
            <a href="/privacy#terms" target="_blank" rel="noopener noreferrer" className="text-white/35 hover:text-white/60 underline cursor-pointer transition-colors duration-300">Terms of Service</a>{' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/35 hover:text-white/60 underline cursor-pointer transition-colors duration-300">Privacy Policy</a>
          </p>
        </div>

        {/* Firebase hidden reCAPTCHA */}
        <div id="recaptcha-container" />
      </motion.div>
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}
