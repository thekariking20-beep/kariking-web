import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet as WalletIcon, Coins, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle, Banknote, Lock, AlertTriangle, ArrowRight, Loader2, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import { COIN_VALUE, MIN_WITHDRAWAL_COINS, coinToRupee } from '../config/coins';
import { Link } from 'react-router-dom';
import type { WithdrawalRequest, WithdrawalTransaction } from '../types';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-700',   bg: 'bg-blue-100',   icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  paid:     { label: 'Paid',     color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle2 },
};

export default function Wallet() {
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<WithdrawalTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Withdrawal form state
  const [showForm, setShowForm] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [accountName, setAccountName] = useState(user?.name || '');
  const [coinsToWithdraw, setCoinsToWithdraw] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const coins = user?.coins || 0;
  const lockedCoins = user?.lockedCoins || 0;
  const totalValue = (coins + lockedCoins) * COIN_VALUE;
  const availableValue = coins * COIN_VALUE;
  const isEligible = coins >= MIN_WITHDRAWAL_COINS;
  const hasPending = withdrawals.some(w => w.status === 'pending');

  // Listen to withdrawal requests
  useEffect(() => {
    if (!user) return;

    const q1 = query(
      collection(db, 'withdrawalRequests'),
      where('userId', '==', user.uid),
      orderBy('requestedAt', 'desc')
    );

    const q2 = query(
      collection(db, 'withdrawalTransactions'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsub1 = onSnapshot(q1, (snap) => {
      setWithdrawals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest)));
      setLoading(false);
    }, () => setLoading(false));

    const unsub2 = onSnapshot(q2, (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalTransaction)));
    }, () => {});

    return () => { unsub1(); unsub2(); };
  }, [user]);

  const validateUpi = (val: string) => {
    // Valid UPI ID format: xxx@bank OR 10-digit phone
    return /^[\w.\-]+@[\w]+$/.test(val) || /^\d{10}$/.test(val);
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!upiId.trim()) { setError('Please enter a valid UPI ID or phone number.'); return; }
    if (!validateUpi(upiId.trim())) { setError('Invalid UPI ID format. Use name@bank or a 10-digit phone number.'); return; }
    if (!accountName.trim()) { setError('Please enter the account holder name.'); return; }
    if (coinsToWithdraw < MIN_WITHDRAWAL_COINS) { setError(`Minimum withdrawal is ${MIN_WITHDRAWAL_COINS} coins (₹${MIN_WITHDRAWAL_COINS * COIN_VALUE}).`); return; }
    if (coinsToWithdraw > coins) { setError('Insufficient coin balance.'); return; }
    if (hasPending) { setError('You already have a pending withdrawal request.'); return; }

    setSubmitting(true);
    try {
      const requestWithdrawal = httpsCallable(functions, 'requestWithdrawal');
      await requestWithdrawal({ upiId: upiId.trim(), accountName: accountName.trim(), coinsToWithdraw });
      setSuccess('Withdrawal request submitted successfully! You will be notified when it is processed.');
      setShowForm(false);
      setUpiId('');
      setCoinsToWithdraw(0);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit withdrawal request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [upiId, accountName, coinsToWithdraw, coins, hasPending]);

  const maxWithdrawable = Math.floor(coins / MIN_WITHDRAWAL_COINS) * MIN_WITHDRAWAL_COINS;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md"
          >
            <WalletIcon className="w-8 h-8" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black mb-2">My Wallet</h1>
          <p className="text-emerald-100 text-lg">Convert your earned coins into real money</p>
        </div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl" />
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Coins, label: 'Available Coins', value: `${coins}`, sub: coinToRupee(coins), color: 'text-green-600', bg: 'bg-green-50' },
          { icon: Lock, label: 'Locked (Pending)', value: `${lockedCoins}`, sub: coinToRupee(lockedCoins), color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { icon: Banknote, label: 'Total Wallet Value', value: `₹${totalValue}`, sub: `${coins + lockedCoins} coins`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: ArrowDownCircle, label: 'Withdrawable', value: `₹${availableValue}`, sub: isEligible ? '✅ Eligible' : `Need ${MIN_WITHDRAWAL_COINS - coins} more`, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn('p-2.5 rounded-xl', stat.bg, stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
            </div>
            <p className="text-2xl font-black text-gray-900">{stat.value}</p>
            <p className="text-sm font-medium text-gray-500 mt-1">{stat.sub}</p>
          </motion.div>
        ))}
      </section>

      {/* Coin Value Info */}
      <section className="bg-gradient-to-r from-amber-50 to-yellow-50 p-6 rounded-2xl border border-amber-100 flex items-center gap-4">
        <div className="bg-amber-100 p-3 rounded-xl">
          <Coins className="w-6 h-6 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-amber-900">1 Coin = ₹{COIN_VALUE}</p>
          <p className="text-sm text-amber-700">Minimum withdrawal: {MIN_WITHDRAWAL_COINS} Coins (₹{MIN_WITHDRAWAL_COINS * COIN_VALUE})</p>
        </div>
        <Link to="/referral" className="text-amber-700 font-bold text-sm hover:text-amber-900 flex items-center gap-1">
          Earn More <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* Success/Error Messages */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-green-50 border border-green-200 p-4 rounded-2xl flex items-start gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-green-800 text-sm font-medium">{success}</p>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-red-800 text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Button / Form */}
      {!showForm ? (
        <section className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Withdraw Coins</h2>
              <p className="text-sm text-gray-500 mt-1">
                {!isEligible
                  ? `You need at least ${MIN_WITHDRAWAL_COINS} Coins (₹${MIN_WITHDRAWAL_COINS * COIN_VALUE}) to withdraw.`
                  : hasPending
                    ? 'You have a pending withdrawal. Wait for it to be processed.'
                    : `You can withdraw up to ${maxWithdrawable} coins (₹${maxWithdrawable * COIN_VALUE}).`
                }
              </p>
            </div>
            <button
              onClick={() => { setShowForm(true); setCoinsToWithdraw(Math.min(coins, MIN_WITHDRAWAL_COINS)); setAccountName(user?.name || ''); setError(''); setSuccess(''); }}
              disabled={!isEligible || hasPending}
              className={cn(
                'px-8 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg whitespace-nowrap',
                isEligible && !hasPending
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
              )}
            >
              <Banknote className="w-5 h-5" /> Withdraw Coins
            </button>
          </div>
        </section>
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-gray-100 shadow-lg"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Withdrawal Request</h2>
            <button onClick={() => { setShowForm(false); setError(''); }} className="text-gray-400 hover:text-gray-600 text-sm font-bold">Cancel</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* UPI ID */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">UPI ID or Phone Number</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@upi or 9876543210"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-gray-900 font-medium"
              />
            </div>

            {/* Account Name */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Account Holder Name</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Enter account holder name"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-gray-900 font-medium"
              />
            </div>

            {/* Coins to Withdraw */}
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Coins to Withdraw <span className="text-gray-400 normal-case tracking-normal">(Available: {coins})</span>
              </label>
              <input
                type="number"
                value={coinsToWithdraw || ''}
                onChange={(e) => setCoinsToWithdraw(Math.max(0, Math.min(coins, parseInt(e.target.value) || 0)))}
                min={MIN_WITHDRAWAL_COINS}
                max={coins}
                step={1}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-gray-900 font-bold text-lg"
              />
              {/* Quick Buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                {[100, 200, 500].filter(v => v <= coins).map(v => (
                  <button key={v} type="button" onClick={() => setCoinsToWithdraw(v)}
                    className={cn(
                      'px-4 py-1.5 rounded-lg text-xs font-bold border transition-all',
                      coinsToWithdraw === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300'
                    )}
                  >
                    {v} Coins
                  </button>
                ))}
                {coins >= MIN_WITHDRAWAL_COINS && (
                  <button type="button" onClick={() => setCoinsToWithdraw(coins)}
                    className={cn(
                      'px-4 py-1.5 rounded-lg text-xs font-bold border transition-all',
                      coinsToWithdraw === coins ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300'
                    )}
                  >
                    All ({coins})
                  </button>
                )}
              </div>
            </div>

            {/* Preview */}
            {coinsToWithdraw >= MIN_WITHDRAWAL_COINS && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">You will receive</p>
                    <p className="text-3xl font-black text-emerald-900 mt-1">₹{coinsToWithdraw * COIN_VALUE}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-600">{coinsToWithdraw} Coins × ₹{COIN_VALUE}</p>
                    <p className="text-xs text-emerald-500 mt-1">Via UPI: {upiId || '—'}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Security Badge */}
            <div className="flex items-center gap-2 text-gray-400">
              <Shield className="w-4 h-4" />
              <p className="text-[11px]">Secured by Kari King. Coins are locked until admin processes your request.</p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || coinsToWithdraw < MIN_WITHDRAWAL_COINS}
              className={cn(
                'w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                submitting || coinsToWithdraw < MIN_WITHDRAWAL_COINS
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30'
              )}
            >
              {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : <><Banknote className="w-5 h-5" /> Submit Withdrawal Request</>}
            </button>
          </form>
        </motion.section>
      )}

      {/* Withdrawal History */}
      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-2 rounded-lg">
              <ArrowUpCircle className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Withdrawal History</h2>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {withdrawals.length} Requests
          </span>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : withdrawals.length === 0 ? (
            <div className="p-12 text-center">
              <WalletIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No withdrawal requests yet.</p>
              <p className="text-gray-400 text-sm mt-1">Earn {MIN_WITHDRAWAL_COINS}+ coins to make your first withdrawal.</p>
            </div>
          ) : (
            withdrawals.map((w) => {
              const cfg = STATUS_CONFIG[w.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={w.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 transition-colors gap-3">
                  <div className="flex items-center gap-4">
                    <div className={cn('p-2.5 rounded-xl', cfg.bg, cfg.color)}>
                      <StatusIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">₹{w.amountRequested.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{w.coinsRequested} coins • {w.upiId}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(w.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="sm:text-right flex items-center sm:block gap-3">
                    <span className={cn('px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    {w.remarks && (
                      <p className="text-xs text-gray-400 mt-1 max-w-[200px] truncate">{w.remarks}</p>
                    )}
                    {w.paidAt && (
                      <p className="text-[10px] text-green-600 font-bold mt-1">
                        Paid on {new Date(w.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Transaction Audit Log */}
      {transactions.length > 0 && (
        <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <h2 className="text-lg font-bold text-gray-900">Transaction Log</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <div className={cn('p-1.5 rounded-lg', tx.type === 'lock' ? 'bg-yellow-50 text-yellow-600' : tx.type === 'unlock' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600')}>
                    {tx.type === 'lock' ? <Lock className="w-4 h-4" /> : tx.type === 'unlock' ? <ArrowUpCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 capitalize">{tx.type === 'lock' ? 'Coins Locked' : tx.type === 'unlock' ? 'Coins Unlocked' : 'Coins Deducted'}</p>
                    <p className="text-[10px] text-gray-400">{new Date(tx.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('font-bold', tx.type === 'unlock' ? 'text-green-600' : 'text-gray-900')}>{tx.coins} coins</p>
                  <p className="text-[10px] text-gray-400">{tx.beforeBalance} → {tx.afterBalance}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
