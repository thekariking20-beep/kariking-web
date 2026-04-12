import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { User } from '../../types';
import {
  ShieldCheck, ShieldX, Clock, User as UserIcon, Phone, MapPin,
  CreditCard, Car, X, CheckCircle2, XCircle, Loader2, AlertTriangle,
  ZoomIn, ChevronLeft, ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type TabFilter = 'pending' | 'approved' | 'rejected';

export default function DriverVerification() {
  const [allDrivers, setAllDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null); // uid of driver being processed
  const [tab, setTab] = useState<TabFilter>('pending');

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<User | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Document viewer modal
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [viewerLabel, setViewerLabel] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Real-time listener for ALL delivery partners with KYC ───
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'delivery'),
      where('verificationStatus', 'in', ['pending', 'approved', 'rejected'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const drivers = snap.docs.map(d => ({ ...d.data(), uid: d.id } as User));
      drivers.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setAllDrivers(drivers);
      setLoading(false);
    }, (err) => {
      console.error('Verification listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Derived lists ───
  const pendingDrivers = allDrivers.filter(d => d.verificationStatus === 'pending');
  const approvedDrivers = allDrivers.filter(d => d.verificationStatus === 'approved');
  const rejectedDrivers = allDrivers.filter(d => d.verificationStatus === 'rejected');

  const displayDrivers = tab === 'pending' ? pendingDrivers : tab === 'approved' ? approvedDrivers : rejectedDrivers;
  const counts = { pending: pendingDrivers.length, approved: approvedDrivers.length, rejected: rejectedDrivers.length };

  // ─── Helpers ───
  const getTimeSince = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hrs > 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const isOverdue = (iso: string) => Date.now() - new Date(iso).getTime() > 24 * 3600000;

  // ─── Actions ───
  const handleApprove = async (driver: User) => {
    setProcessing(driver.uid);
    try {
      await updateDoc(doc(db, 'users', driver.uid), {
        verificationStatus: 'approved',
        isVerified: true,
        profileComplete: true,
        verifiedAt: new Date().toISOString(),
        rejectionReason: null,
      });
      showToast(`${driver.name || 'Driver'} approved successfully ✅`);
    } catch (err) {
      console.error(err);
      showToast('Failed to approve. Please try again.', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setProcessing(rejectTarget.uid);
    try {
      await updateDoc(doc(db, 'users', rejectTarget.uid), {
        verificationStatus: 'rejected',
        rejectionReason: rejectReason.trim(),
      });
      showToast(`${rejectTarget.name || 'Driver'} rejected.`);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      console.error(err);
      showToast('Failed to reject. Please try again.', 'error');
    } finally {
      setProcessing(null);
    }
  };

  // ─── Document Preview Card (click → full view modal) ───
  const DocPreview = ({ url, label, icon: Icon }: { url?: string; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => { if (url) { setViewerImage(url); setViewerLabel(label); } }}
      disabled={!url}
      className={cn(
        "rounded-2xl overflow-hidden border bg-gray-50 transition-all text-left w-full group",
        url ? "border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer" : "border-dashed border-gray-200 cursor-default opacity-50"
      )}
    >
      {url ? (
        <div className="relative">
          <img src={url} alt={label} className="w-full h-28 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </div>
      ) : (
        <div className="h-28 flex items-center justify-center text-gray-300">
          <Icon className="w-8 h-8" />
        </div>
      )}
      <p className="text-[9px] font-black text-gray-400 text-center py-2 uppercase tracking-widest flex items-center justify-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
    </button>
  );

  // ─── Status Badge ───
  const StatusBadge = ({ status }: { status?: string }) => {
    const config = {
      pending:  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: '⏳ Pending' },
      approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: '✔ Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', label: '✕ Rejected' },
    }[status || 'pending'] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: status };
    return (
      <span className={cn("px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border", config.bg, config.text, config.border)}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="text-sm font-medium text-gray-400">Loading verifications...</span>
      </div>
    );
  }

  return (
    <div>
      {/* ─── TOAST ─── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-6 left-1/2 z-[999] px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2 border",
              toast.type === 'success'
                ? "bg-emerald-600 text-white border-emerald-500"
                : "bg-red-600 text-white border-red-500"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── HEADER ─── */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100">
          <ShieldCheck className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">Driver Verification</h2>
          <p className="text-sm font-medium text-gray-400">
            {counts.pending > 0 ? `${counts.pending} awaiting review` : 'No pending requests'}
          </p>
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div className="bg-gray-100 p-1.5 rounded-2xl flex mb-6">
        {([
          { key: 'pending' as TabFilter, label: 'Pending', count: counts.pending, color: 'text-amber-700 bg-amber-100' },
          { key: 'approved' as TabFilter, label: 'Approved', count: counts.approved, color: 'text-emerald-700 bg-emerald-100' },
          { key: 'rejected' as TabFilter, label: 'Rejected', count: counts.rejected, color: 'text-red-700 bg-red-100' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black", tab === t.key ? t.color : "bg-gray-200/50 text-gray-400")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── DRIVER CARDS ─── */}
      {displayDrivers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
          <CheckCircle2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-500">No {tab} drivers</h3>
          <p className="text-gray-400 mt-2 text-sm">
            {tab === 'pending' ? 'All caught up! No pending verifications.' :
             tab === 'approved' ? 'No approved delivery partners yet.' :
             'No rejected requests.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayDrivers.map((driver) => {
            const overdue = driver.submittedAt ? isOverdue(driver.submittedAt) : false;
            const isPending = driver.verificationStatus === 'pending';
            const isApproved = driver.verificationStatus === 'approved';
            const isBeingProcessed = processing === driver.uid;

            return (
              <motion.div
                key={driver.uid}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-white rounded-[20px] border overflow-hidden transition-all shadow-sm hover:shadow-lg",
                  overdue && isPending ? "border-red-200" : isApproved ? "border-emerald-200" : "border-gray-100"
                )}
              >
                {/* Overdue Banner */}
                {overdue && isPending && (
                  <div className="bg-red-50 px-5 py-2.5 flex items-center gap-2 border-b border-red-100">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-red-600">⚠ SLA OVERDUE — Pending over 24 hours</span>
                  </div>
                )}

                <div className="p-5">
                  {/* Top Row: Avatar + Info + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Profile Photo */}
                      <button
                        onClick={() => {
                          if (driver.profilePhotoUrl) {
                            setViewerImage(driver.profilePhotoUrl);
                            setViewerLabel(`${driver.name || 'Driver'} — Profile Photo`);
                          }
                        }}
                        className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden border-2 border-gray-200 shrink-0 hover:border-blue-400 transition-colors group relative"
                      >
                        {driver.profilePhotoUrl ? (
                          <>
                            <img src={driver.profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <UserIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </button>

                      <div className="min-w-0">
                        <h3 className="font-black text-gray-900 text-lg truncate">{driver.name || 'Unnamed Driver'}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                            <Phone className="w-3 h-3" /> {driver.phone}
                          </span>
                          {driver.submittedAt && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock className="w-3 h-3" /> {getTimeSince(driver.submittedAt)}
                            </span>
                          )}
                        </div>
                        {driver.address && (
                          <p className="flex items-center gap-1 text-xs text-gray-400 mt-1 truncate max-w-xs">
                            <MapPin className="w-3 h-3 shrink-0" /> {driver.address}
                          </p>
                        )}
                      </div>
                    </div>

                    <StatusBadge status={driver.verificationStatus} />
                  </div>

                  {/* Rejection Reason */}
                  {driver.verificationStatus === 'rejected' && driver.rejectionReason && (
                    <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600"><strong>Reason:</strong> {driver.rejectionReason}</p>
                    </div>
                  )}

                  {/* Document Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <DocPreview url={driver.aadharFrontUrl} label="Aadhar Front" icon={CreditCard} />
                    <DocPreview url={driver.aadharBackUrl} label="Aadhar Back" icon={CreditCard} />
                    <DocPreview url={driver.licenseUrl} label="License" icon={Car} />
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-4 border-t border-gray-50">
                    {isPending ? (
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApprove(driver)}
                          disabled={!!processing}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {isBeingProcessed ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                          {isBeingProcessed ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => { setRejectTarget(driver); setRejectReason(''); }}
                          disabled={!!processing}
                          className="flex-1 bg-white border-2 border-red-200 text-red-600 font-black py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 active:scale-[0.97] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <XCircle className="w-5 h-5" /> Reject
                        </button>
                      </div>
                    ) : isApproved ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5" /> Verified & Active
                        {driver.verifiedAt && (
                          <span className="text-xs text-gray-400 ml-2">
                            on {new Date(driver.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-2 text-red-500 font-bold text-sm">
                        <XCircle className="w-5 h-5" /> Rejected — Awaiting re-upload
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
           FULL-SCREEN DOCUMENT VIEWER MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewerImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4"
            onClick={() => setViewerImage(null)}
          >
            {/* Close Button */}
            <button
              onClick={() => setViewerImage(null)}
              className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Label */}
            <p className="text-white/60 text-sm font-bold uppercase tracking-widest mb-4">{viewerLabel}</p>

            {/* Image */}
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              src={viewerImage}
              alt={viewerLabel}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />

            <p className="text-white/30 text-xs mt-4">Click outside or ✕ to close</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
           REJECTION REASON MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setRejectTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-red-50 px-6 py-5 flex items-center justify-between border-b border-red-100">
                <h3 className="text-lg font-black text-red-800 flex items-center gap-2">
                  <ShieldX className="w-5 h-5 text-red-500" /> Reject Driver
                </h3>
                <button onClick={() => setRejectTarget(null)} className="text-red-300 hover:text-red-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-xl bg-gray-200 overflow-hidden shrink-0">
                    {rejectTarget.profilePhotoUrl ? (
                      <img src={rejectTarget.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-5 h-5 text-gray-400" /></div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{rejectTarget.name || 'Unnamed'}</p>
                    <p className="text-xs text-gray-400">{rejectTarget.phone}</p>
                  </div>
                </div>

                <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="e.g. Blurry Aadhar photo, License expired, Name mismatch..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-none font-medium text-gray-900 placeholder:text-gray-300"
                />

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setRejectTarget(null)}
                    className="flex-1 py-3.5 border-2 border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={!rejectReason.trim() || !!processing}
                    className="flex-1 py-3.5 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Confirm Rejection
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
