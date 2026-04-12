import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, Clock, XCircle, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export default function VerificationPending() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [timeElapsed, setTimeElapsed] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Real-time listener for verification status changes
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.verificationStatus === 'approved' && data.profileComplete) {
        // Approved! Refresh auth and redirect
        refreshUser().then(() => {
          navigate(user.role === 'delivery' ? '/delivery' : '/admin');
        });
      }
    });
    return () => unsub();
  }, [user, navigate, refreshUser]);

  // Time since submission
  useEffect(() => {
    if (!user?.submittedAt) return;
    const update = () => {
      const diff = Date.now() - new Date(user.submittedAt!).getTime();
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setTimeElapsed(hrs > 0 ? `${hrs}h ${mins}m ago` : `${mins}m ago`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [user?.submittedAt]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setTimeout(() => setRefreshing(false), 1500);
  };

  const status = user?.verificationStatus || 'pending';
  const isRejected = status === 'rejected';

  // Progress steps
  const steps = [
    { label: 'Documents Submitted', done: true },
    { label: 'Under Admin Review', done: status === 'approved' },
    { label: 'Verified & Active', done: status === 'approved' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100/50"
        >
          {/* Status Header */}
          <div className={cn(
            "p-10 text-center relative overflow-hidden",
            isRejected
              ? "bg-gradient-to-br from-red-600 to-red-800"
              : "bg-gradient-to-br from-slate-800 via-slate-900 to-gray-950"
          )}>
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/[0.04]" />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/[0.03] -mb-12 -ml-12" />

            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                className={cn(
                  "w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5",
                  isRejected ? "bg-red-500/30" : "bg-white/10"
                )}
              >
                {isRejected ? (
                  <XCircle className="w-10 h-10 text-red-200" />
                ) : (
                  <Clock className="w-10 h-10 text-amber-300" />
                )}
              </motion.div>

              <h1 className="text-2xl font-black text-white tracking-tight">
                {isRejected ? 'Verification Rejected' : 'Under Verification'}
              </h1>
              <p className="text-white/60 text-sm font-medium mt-2">
                {isRejected
                  ? 'Your documents need to be re-submitted.'
                  : 'Your profile is being reviewed by our team.'}
              </p>

              {timeElapsed && !isRejected && (
                <div className="mt-4 inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 text-white/70 text-xs font-bold">
                  <Clock className="w-3 h-3" /> Submitted {timeElapsed}
                </div>
              )}
            </div>
          </div>

          <div className="p-8">
            {/* Rejection Reason */}
            {isRejected && user?.rejectionReason && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">Reason for rejection:</p>
                    <p className="text-sm text-red-600 mt-1">{user.rejectionReason}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Progress Tracker */}
            {!isRejected && (
              <div className="space-y-4 mb-8">
                {steps.map((s, i) => {
                  const isCurrent = !s.done && (i === 0 || steps[i - 1].done);
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all",
                        s.done ? "bg-emerald-100 text-emerald-600" :
                        isCurrent ? "bg-amber-100 text-amber-600 animate-pulse" :
                        "bg-gray-100 text-gray-300"
                      )}>
                        {s.done ? <CheckCircle2 className="w-5 h-5" /> :
                         isCurrent ? <Clock className="w-5 h-5" /> :
                         <span className="text-sm font-black">{i + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <p className={cn(
                          "text-sm font-bold",
                          s.done ? "text-emerald-700" : isCurrent ? "text-amber-700" : "text-gray-300"
                        )}>{s.label}</p>
                        {isCurrent && (
                          <p className="text-xs text-amber-500 mt-0.5">Usually within 24 hours</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Info Banner */}
            {!isRejected && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-6">
                <p className="text-xs font-bold text-blue-800">💡 Auto-refresh is enabled</p>
                <p className="text-xs text-blue-600 mt-1">
                  This page will automatically update when the admin processes your application. No need to refresh manually.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              {isRejected ? (
                <button
                  onClick={() => navigate('/onboarding')}
                  className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg shadow-red-600/20"
                >
                  <RefreshCw className="w-5 h-5" /> Re-Upload Documents
                </button>
              ) : (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {refreshing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Checking...</>
                  ) : (
                    <><RefreshCw className="w-5 h-5" /> Check Status</>
                  )}
                </button>
              )}

              <button
                onClick={logout}
                className="w-full text-gray-400 font-bold py-3 text-sm hover:text-red-500 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
