import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, CheckCircle2, XCircle, Banknote, Search, Loader2, AlertTriangle, ArrowUpCircle, Phone, IndianRupee } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WithdrawalRequest } from '../../types';
import { COIN_VALUE } from '../../config/coins';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'paid';

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-700',   bg: 'bg-blue-100',   icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  paid:     { label: 'Paid',     color: 'text-green-700',  bg: 'bg-green-100',  icon: Banknote },
};

export default function AdminWithdrawalsTab() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'withdrawalRequests'), orderBy('requestedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.userName?.toLowerCase().includes(q) ||
        r.userPhone?.includes(q) ||
        r.upiId?.toLowerCase().includes(q) ||
        r.accountName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    paid: requests.filter(r => r.status === 'paid').length,
    totalPaid: requests.filter(r => r.status === 'paid').reduce((s, r) => s + r.amountRequested, 0),
  };

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    setError('');
    try {
      const fn = httpsCallable(functions, 'approveWithdrawal');
      await fn({ requestId });
      setSuccess('Withdrawal approved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to approve withdrawal.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    setError('');
    try {
      const fn = httpsCallable(functions, 'rejectWithdrawal');
      await fn({ requestId, remarks: rejectRemarks[requestId] || '' });
      setSuccess('Withdrawal rejected. Coins have been refunded.');
      setShowRejectForm(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to reject withdrawal.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkPaid = async (requestId: string) => {
    setActionLoading(requestId);
    setError('');
    try {
      const fn = httpsCallable(functions, 'markWithdrawalPaid');
      await fn({ requestId });
      setSuccess('Withdrawal marked as paid!');
    } catch (err: any) {
      setError(err?.message || 'Failed to mark as paid.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Pending', value: stats.pending, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock },
          { label: 'Approved', value: stats.approved, color: 'text-blue-600', bg: 'bg-blue-50', icon: CheckCircle2 },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
          { label: 'Paid', value: stats.paid, color: 'text-green-600', bg: 'bg-green-50', icon: Banknote },
          { label: 'Total Paid', value: `₹${stats.totalPaid.toLocaleString('en-IN')}`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: IndianRupee },
        ].map((s, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('p-1.5 rounded-lg', s.bg, s.color)}>
                <s.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</span>
            </div>
            <p className="text-xl font-black text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-green-50 border border-green-200 p-3 rounded-xl flex items-center gap-2 text-sm text-green-800 font-medium"
            onClick={() => setSuccess('')}
          >
            <CheckCircle2 className="w-4 h-4 text-green-600" /> {success}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-2 text-sm text-red-800 font-medium"
            onClick={() => setError('')}
          >
            <AlertTriangle className="w-4 h-4 text-red-600" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or UPI..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['all', 'pending', 'approved', 'rejected', 'paid'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all border',
                filter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              )}
            >
              {f === 'all' ? `All (${requests.length})` : `${f} (${requests.filter(r => r.status === f).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading withdrawal requests...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ArrowUpCircle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No withdrawal requests found.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((req) => {
              const cfg = STATUS_BADGE[req.status] || STATUS_BADGE.pending;
              const isLoading = actionLoading === req.id;
              return (
                <div key={req.id} className="p-5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* User Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={cn('p-3 rounded-xl shrink-0', cfg.bg, cfg.color)}>
                        <cfg.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900">{req.userName || 'Unknown'}</p>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', cfg.bg, cfg.color)}>{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{req.userPhone}</span>
                          <span>UPI: <strong className="text-gray-600">{req.upiId}</strong></span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Requested: {new Date(req.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {req.paidAt && ` • Paid: ${new Date(req.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                        </p>
                        {req.remarks && <p className="text-xs text-gray-500 mt-1 italic">Remarks: {req.remarks}</p>}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black text-gray-900">₹{req.amountRequested.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-400">{req.coinsRequested} coins</p>
                      <p className="text-[10px] text-gray-400">{req.accountName}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve
                          </button>
                          <button
                            onClick={() => setShowRejectForm(showRejectForm === req.id ? null : req.id)}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-red-200"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                      {req.status === 'approved' && (
                        <>
                          <button
                            onClick={() => handleMarkPaid(req.id)}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />} Mark as Paid
                          </button>
                          <button
                            onClick={() => setShowRejectForm(showRejectForm === req.id ? null : req.id)}
                            disabled={isLoading}
                            className="px-4 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-red-200"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Reject Form (Expandable) */}
                  <AnimatePresence>
                    {showRejectForm === req.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            value={rejectRemarks[req.id] || ''}
                            onChange={(e) => setRejectRemarks(prev => ({ ...prev, [req.id]: e.target.value }))}
                            placeholder="Reason for rejection (optional)..."
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-red-400 outline-none"
                          />
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={isLoading}
                            className="px-6 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Confirm Reject
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
