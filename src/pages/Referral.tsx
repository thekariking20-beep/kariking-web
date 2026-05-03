import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Gift, Copy, Share2, Coins, Users, ArrowRight, CheckCircle2, Lock, Clock, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { CoinTransaction, Referral } from '../types';
import { Link } from 'react-router-dom';

export default function Referral() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  const referralCode = user?.referralCode || 'NOTSET';
  const referralLink = `${window.location.origin}/login?ref=${referralCode}`;
  const coins = user?.coins || 0;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'coinTransactions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoinTransaction)));
      setLoading(false);
    });

    const qReferrals = query(
      collection(db, 'referrals'),
      where('referrerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubReferrals = onSnapshot(qReferrals, (snap) => {
      setReferrals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referral)));
    });

    return () => {
      unsubscribe();
      unsubReferrals();
    };
  }, [user]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join Kari King',
        text: `Use my referral code ${referralCode} to get fresh meat delivered and earn rewards!`,
        url: referralLink,
      });
    } else {
      handleCopyLink();
    }
  };

  const lockedCoins = user?.lockedCoins || 0;

  const stats = [
    { icon: Coins, label: 'Available Coins', value: `₹${coins * 20}`, subValue: `${coins} coins`, color: 'text-green-600', bg: 'bg-green-50' },
    { icon: Lock, label: 'Locked Coins', value: `₹${lockedCoins * 20}`, subValue: `${lockedCoins} pending coins`, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { icon: Users, label: 'Total Referrals', value: referrals.length, subValue: 'Invited friends', color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-red-600 to-red-800 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md"
          >
            <Gift className="w-8 h-8" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black mb-4">Refer & Earn ₹100</h1>
          <p className="text-red-100 text-lg mb-8">
            Share your love for Kari King with friends and earn 5 coins (₹100) when they complete their <strong>first order</strong>.
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex-1 min-w-[200px]">
              <p className="text-xs font-bold uppercase tracking-widest text-red-200 mb-2">Your Referral Code</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black tracking-wider">{referralCode}</span>
                <button
                  onClick={handleCopyCode}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="Copy Code"
                >
                  {copied ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <Copy className="w-6 h-6" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <button
                onClick={handleShare}
                className="bg-white text-red-600 px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors shadow-xl"
              >
                <Share2 className="w-5 h-5" /> Share Now
              </button>
              <button
                onClick={handleCopyLink}
                className="bg-red-500/20 backdrop-blur-md border border-white/30 text-white px-8 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Copy className="w-4 h-4" /> Copy Referral Link
              </button>
            </div>
          </div>
        </div>
        
        {/* Decorative Circles */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl" />
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4"
          >
            <div className={cn("p-4 rounded-2xl", stat.bg, stat.color)}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className="text-2xl font-black text-gray-900">{stat.value}</p>
              <p className="text-sm font-medium text-gray-500 mt-1">{stat.subValue}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* How it works */}
      <section className="bg-white p-8 md:p-12 rounded-3xl border border-gray-100 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { step: '01', title: 'Invite Friends', desc: 'Share your unique referral code with your friends and family.' },
            { step: '02', title: 'They Sign Up', desc: 'When they sign up using your code, your coins are locked.' },
            { step: '03', title: 'They Complete First Order', desc: 'Once they place their first order, your coins unlock immediately (₹100)!' },
          ].map((item, i) => (
            <div key={i} className="relative">
              <span className="text-6xl font-black text-gray-50 absolute -top-4 -left-4 z-0">{item.step}</span>
              <div className="relative z-10">
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Referrals List */}
      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Your Referrals</h2>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {referrals.length} Friends
          </span>
        </div>
        
        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading referrals...</div>
          ) : referrals.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No referrals yet. Start referring to unlock coins!</p>
            </div>
          ) : (
            referrals.map((r) => (
              <div key={r.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 transition-colors gap-4 sm:gap-0">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-xl",
                    r.status === 'completed' ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"
                  )}>
                    {r.status === 'completed' ? <CheckCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{r.referredUserPhone || 'Friend'}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Joined {new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right flex items-center sm:block gap-3">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase",
                    r.status === 'completed' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  )}>
                    {r.status}
                  </span>
                  <p className={cn(
                    "sm:mt-2 text-sm font-bold",
                    r.status === 'completed' ? "text-green-600" : "text-gray-400"
                  )}>
                    {r.status === 'completed' ? '+₹100 Earned' : 'Pending Order'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Coin Transaction History */}
      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-50 p-2 rounded-lg">
              <Coins className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Coin History</h2>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {transactions.length} Transactions
          </span>
        </div>
        
        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">No coin transactions yet. Refer friends to earn coins!</p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "p-2 rounded-xl shrink-0",
                    tx.type === 'earning' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                  )}>
                    {tx.type === 'earning' ? <ArrowRight className="w-4 h-4 rotate-[-45deg]" /> : <ArrowRight className="w-4 h-4 rotate-[135deg]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{tx.source}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  "font-black text-sm shrink-0 ml-3",
                  tx.type === 'earning' ? "text-green-600" : "text-red-600"
                )}>
                  {tx.type === 'earning' ? '+' : '-'}{tx.amount} coins
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Coin Usage Info */}
      <section className="bg-yellow-50 p-8 rounded-3xl border border-yellow-100 flex flex-col md:flex-row items-center gap-8">
        <div className="bg-yellow-100 p-6 rounded-full">
          <Coins className="w-12 h-12 text-yellow-600" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h3 className="text-xl font-bold text-yellow-900 mb-2">1 Coin = ₹20</h3>
          <p className="text-yellow-700 text-sm mb-6">
            Use your earned coins to get massive discounts on your favorite meat and poultry products. 
            No limits on how many friends you can refer!
          </p>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-yellow-800 font-bold hover:gap-3 transition-all"
          >
            Start Shopping <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
