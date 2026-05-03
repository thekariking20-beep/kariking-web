import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { Coupon } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Tag, Percent, Calendar, Users, Hash, ToggleLeft, ToggleRight,
  Trash2, X, CheckCircle2, Loader2, AlertCircle, Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';

const EMPTY_FORM = {
  code: '',
  discountType: 'flat' as 'flat' | 'percentage',
  discountValue: 0,
  minOrder: 0,
  maxDiscount: 0,
  usageLimit: 1,
  totalUsageLimit: 1000,
  forNewUsers: false,
  validFrom: '',
  validTill: '',
};

export default function CouponManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ─── Real-time listener ──────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Create coupon ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.code.trim()) { setError('Coupon code is required.'); return; }
    if (form.discountValue <= 0) { setError('Discount value must be > 0.'); return; }
    if (!form.validTill) { setError('Expiry date is required.'); return; }

    // Check duplicate
    if (coupons.some(c => c.code === form.code.trim().toUpperCase())) {
      setError('A coupon with this code already exists.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'coupons'), {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrder: Number(form.minOrder),
        maxDiscount: Number(form.maxDiscount),
        usageLimit: Number(form.usageLimit),
        totalUsageLimit: Number(form.totalUsageLimit),
        usedCount: 0,
        isActive: true,
        validFrom: form.validFrom || new Date().toISOString(),
        validTill: new Date(form.validTill + 'T23:59:59').toISOString(),
        forNewUsers: form.forNewUsers,
        createdAt: new Date().toISOString(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError('Failed to create coupon.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle active ───────────────────────────────────────────────────────
  const toggleActive = async (coupon: Coupon) => {
    setTogglingId(coupon.id);
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), { isActive: !coupon.isActive });
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Coupon Management</h2>
          <p className="text-sm text-gray-500 mt-1">{coupons.length} coupons total</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm",
            showForm
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-red-600 text-white hover:bg-red-700 shadow-red-600/20"
          )}
        >
          {showForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Create Coupon</>}
        </button>
      </div>

      {/* ─── Create Form ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest">New Coupon</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Code */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                    placeholder="KARI100"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none uppercase tracking-wider"
                  />
                </div>

                {/* Discount Type */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Discount Type</label>
                  <div className="flex gap-2">
                    {(['flat', 'percentage'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, discountType: t }))}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all",
                          form.discountType === t
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                        )}
                      >
                        {t === 'flat' ? '₹ Flat' : '% Percent'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Value */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">
                    {form.discountType === 'flat' ? 'Discount (₹)' : 'Discount (%)'}
                  </label>
                  <input
                    type="number"
                    value={form.discountValue || ''}
                    onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                    placeholder={form.discountType === 'flat' ? '100' : '10'}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Min Order */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Min Order (₹)</label>
                  <input
                    type="number"
                    value={form.minOrder || ''}
                    onChange={e => setForm(f => ({ ...f, minOrder: Number(e.target.value) }))}
                    placeholder="299"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Max Discount (percentage only) */}
                {form.discountType === 'percentage' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Max Discount (₹)</label>
                    <input
                      type="number"
                      value={form.maxDiscount || ''}
                      onChange={e => setForm(f => ({ ...f, maxDiscount: Number(e.target.value) }))}
                      placeholder="200"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                    />
                  </div>
                )}

                {/* Per-user limit */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Per-User Limit</label>
                  <input
                    type="number"
                    value={form.usageLimit || ''}
                    onChange={e => setForm(f => ({ ...f, usageLimit: Number(e.target.value) }))}
                    placeholder="1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Total usage limit */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Total Usage Limit</label>
                  <input
                    type="number"
                    value={form.totalUsageLimit || ''}
                    onChange={e => setForm(f => ({ ...f, totalUsageLimit: Number(e.target.value) }))}
                    placeholder="1000"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Expiry */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Valid Till</label>
                  <input
                    type="date"
                    value={form.validTill}
                    onChange={e => setForm(f => ({ ...f, validTill: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* New users only toggle */}
                <div className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 col-span-full sm:col-span-1">
                  <span className="text-sm font-bold text-gray-700">New Users Only</span>
                  <button
                    onClick={() => setForm(f => ({ ...f, forNewUsers: !f.forNewUsers }))}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative",
                      form.forNewUsers ? "bg-green-500" : "bg-gray-300"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                      form.forNewUsers ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm font-bold flex items-center gap-2 border border-red-100">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 rounded-xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {saving ? 'Creating...' : 'Create Coupon'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Coupons List ───────────────────────────────────────────────────── */}
      {coupons.length === 0 ? (
        <div className="text-center py-16">
          <Tag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="font-bold text-gray-500">No coupons created yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first coupon above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map(coupon => {
            const isExpired = new Date(coupon.validTill) < new Date();
            const usagePercent = coupon.totalUsageLimit > 0
              ? Math.round((coupon.usedCount / coupon.totalUsageLimit) * 100)
              : 0;

            return (
              <motion.div
                key={coupon.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-white rounded-2xl border p-5 shadow-sm transition-all",
                  !coupon.isActive || isExpired ? "border-gray-100 opacity-60" : "border-gray-100"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Code + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="bg-gray-900 text-white text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider">
                        {coupon.code}
                      </span>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                        coupon.discountType === 'flat'
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      )}>
                        {coupon.discountType === 'flat' ? `₹${coupon.discountValue} OFF` : `${coupon.discountValue}% OFF`}
                      </span>
                      {coupon.forNewUsers && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> New Users
                        </span>
                      )}
                      {isExpired && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                          Expired
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 font-medium">
                      <span>Min: ₹{coupon.minOrder}</span>
                      {coupon.discountType === 'percentage' && coupon.maxDiscount > 0 && (
                        <span>Max: ₹{coupon.maxDiscount}</span>
                      )}
                      <span>Limit: {coupon.usageLimit}/user</span>
                      <span>Expires: {new Date(coupon.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>

                    {/* Usage bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", usagePercent > 80 ? "bg-red-500" : "bg-green-500")}
                          style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 shrink-0">
                        {coupon.usedCount}/{coupon.totalUsageLimit} used
                      </span>
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleActive(coupon)}
                    disabled={togglingId === coupon.id}
                    className="shrink-0 mt-1"
                  >
                    {coupon.isActive ? (
                      <ToggleRight className="w-8 h-8 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
