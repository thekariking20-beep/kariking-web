import React, { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { HomepageContent } from '../../types';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, GripVertical, X, Check, Image as ImageIcon, Clock, CalendarClock, Timer, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import ImageUploadDropzone from '../ImageUploadDropzone';

const EMPTY_FORM: Omit<HomepageContent, 'id' | 'createdAt'> = {
  type: 'banner',
  title: '',
  subtitle: '',
  imageUrl: '',
  buttonText: '',
  redirectLink: '',
  couponCode: '',
  badgeLabel: '',
  badgeColor: 'bg-red-600',
  isActive: true,
  order: 0,
  countdownEnabled: false,
  countdownEndTime: '',
  visibleFrom: '',
  visibleUntil: '',
};

const BADGE_COLOR_OPTIONS = [
  { label: 'Red', value: 'bg-red-600' },
  { label: 'Orange', value: 'bg-orange-500' },
  { label: 'Green', value: 'bg-green-600' },
  { label: 'Purple', value: 'bg-purple-600' },
  { label: 'Blue', value: 'bg-blue-600' },
  { label: 'Black', value: 'bg-gray-900' },
];

// Helper: convert ISO string to datetime-local input value (YYYY-MM-DDTHH:mm)
function isoToLocal(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

// Helper: convert datetime-local value to ISO string safely
function localToIso(val: string): string {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString();
  } catch { return ''; }
}

export default function HomepageManager() {
  const [items, setItems] = useState<HomepageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HomepageContent | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'homepageContent'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as HomepageContent)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, order: items.length });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: HomepageContent) => {
    setEditing(item);
    setForm({
      type: item.type,
      title: item.title,
      subtitle: item.subtitle || '',
      imageUrl: item.imageUrl || '',
      buttonText: item.buttonText || '',
      redirectLink: item.redirectLink || '',
      couponCode: item.couponCode || '',
      badgeLabel: item.badgeLabel || '',
      badgeColor: item.badgeColor || 'bg-red-600',
      isActive: item.isActive,
      order: item.order,
      countdownEnabled: item.countdownEnabled || false,
      countdownEndTime: isoToLocal(item.countdownEndTime || ''),
      visibleFrom: isoToLocal(item.visibleFrom || ''),
      visibleUntil: isoToLocal(item.visibleUntil || ''),
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sanitize date fields: convert local datetime to ISO, skip invalid
      const payload = {
        ...form,
        order: Number(form.order),
        countdownEndTime: localToIso(form.countdownEndTime || ''),
        visibleFrom: localToIso(form.visibleFrom || ''),
        visibleUntil: localToIso(form.visibleUntil || ''),
        countdownEnabled: (form.type === 'countdown' || form.type === 'seasonal') && !!form.countdownEndTime,
      };
      if (editing) {
        await updateDoc(doc(db, 'homepageContent', editing.id), payload);
      } else {
        await addDoc(collection(db, 'homepageContent'), { ...payload, createdAt: new Date().toISOString() });
      }
      resetForm();
      // No need to fetch — onSnapshot will auto-update
    } catch (e) {
      console.error(e);
    }
  };

  const toggleActive = async (item: HomepageContent) => {
    try {
      await updateDoc(doc(db, 'homepageContent', item.id), { isActive: !item.isActive });
    } catch (err: any) {
      console.error('Toggle active failed:', err);
      alert(`Failed to update: ${err.message || err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this content? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'homepageContent', id));
    } catch (err: any) {
      console.error('Delete failed:', err);
      alert(`Failed to delete: ${err.message || err}`);
    } finally {
      setDeletingId(null);
    }
  };

  const TYPE_COLORS: Record<string, string> = {
    banner: 'bg-blue-100 text-blue-700',
    offer: 'bg-orange-100 text-orange-700',
    hero: 'bg-purple-100 text-purple-700',
    countdown: 'bg-red-100 text-red-700',
    seasonal: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900">Homepage CMS</h2>
          <p className="text-sm text-gray-400 mt-0.5">Control banners, offers & hero content shown on the homepage</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setForm({ ...EMPTY_FORM, order: items.length }); setShowForm(true); }}
            className="flex shrink-0 items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Content
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{editing ? 'Edit Content' : 'Add New Content'}</h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Type */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Content Type</label>
                  <select
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as HomepageContent['type'] }))}
                  >
                    <option value="banner">🖼️ Banner (Carousel Slide)</option>
                    <option value="offer">🎁 Offer / Coupon Card</option>
                    <option value="hero">🏠 Hero Section</option>
                    <option value="countdown">⏱️ Countdown / Flash Sale</option>
                    <option value="seasonal">🎄 Seasonal Campaign</option>
                  </select>
                </div>

                {/* Order */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Display Order</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                  />
                </div>

                {/* Title */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Title *</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Fresh Country Chicken Available Now"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                {/* Subtitle */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Subtitle</label>
                  <input
                    type="text"
                    placeholder="e.g. Order before 6PM for same day delivery"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.subtitle}
                    onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  />
                </div>

                {/* Badge */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Badge Label</label>
                  <input
                    type="text"
                    placeholder="e.g. 🔥 HOT DEAL"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.badgeLabel}
                    onChange={e => setForm(f => ({ ...f, badgeLabel: e.target.value }))}
                  />
                </div>

                {/* Badge Color */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Badge Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {BADGE_COLOR_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, badgeColor: opt.value }))}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all',
                          opt.value,
                          form.badgeColor === opt.value ? 'border-gray-900 scale-110' : 'border-transparent'
                        )}
                        title={opt.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Coupon Code (offer only) */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Coupon Code</label>
                  <input
                    type="text"
                    placeholder="e.g. KARI100"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-bold text-sm uppercase tracking-widest focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.couponCode}
                    onChange={e => setForm(f => ({ ...f, couponCode: e.target.value.toUpperCase() }))}
                  />
                </div>

                {/* Button Text + Link */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Button Text</label>
                  <input
                    type="text"
                    placeholder="e.g. Order Now"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.buttonText}
                    onChange={e => setForm(f => ({ ...f, buttonText: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Button Link</label>
                  <input
                    type="text"
                    placeholder="e.g. /products or /products?category=Chicken"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.redirectLink}
                    onChange={e => setForm(f => ({ ...f, redirectLink: e.target.value }))}
                  />
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active</label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    className={cn('w-12 h-6 rounded-full relative transition-colors', form.isActive ? 'bg-green-500' : 'bg-gray-300')}
                  >
                    <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow', form.isActive ? 'right-1' : 'left-1')} />
                  </button>
                </div>

                {/* Image Upload */}
                {(form.type === 'banner' || form.type === 'hero') && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Banner Image</label>
                    <div className="h-[200px]">
                      <ImageUploadDropzone
                        value={form.imageUrl}
                        onChange={(url) => setForm(f => ({ ...f, imageUrl: url }))}
                        className="h-full"
                      />
                    </div>
                  </div>
                )}

                {/* Countdown End Time (for countdown and seasonal types) */}
                {(form.type === 'countdown' || form.type === 'seasonal') && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">⏱️ Countdown End Time *</label>
                    <input
                      type="datetime-local"
                      required
                      className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                      value={form.countdownEndTime || ''}
                      onChange={e => setForm(f => ({ ...f, countdownEndTime: e.target.value }))}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Timer auto-hides when this time is reached. Set a future date.</p>
                  </div>
                )}

                {/* Scheduling */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">📅 Visible From</label>
                  <input
                    type="datetime-local"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.visibleFrom || ''}
                    onChange={e => setForm(f => ({ ...f, visibleFrom: e.target.value }))}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty = visible immediately</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">📅 Visible Until</label>
                  <input
                    type="datetime-local"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 outline-none font-medium text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
                    value={form.visibleUntil || ''}
                    onChange={e => setForm(f => ({ ...f, visibleUntil: e.target.value }))}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty = visible forever</p>
                </div>
              </div>

              {/* ── Live Preview ──────────────────────────────────────── */}
              {(form.type === 'countdown' || form.type === 'seasonal') && form.title && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 block">👁️ Live Preview</label>
                  <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: 'linear-gradient(135deg, #0a0000 0%, #8B0000 50%, #D9381E 100%)' }}>
                    <div className="px-5 py-5 flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 text-center sm:text-left">
                        {form.badgeLabel && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-300 bg-amber-400/15 border border-amber-400/20 px-2.5 py-1 rounded-full mb-2">
                            ⚡ {form.badgeLabel}
                          </span>
                        )}
                        <h4 className="text-white text-lg font-black">{form.title}</h4>
                        {form.subtitle && <p className="text-white/60 text-xs mt-1">{form.subtitle}</p>}
                        <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start flex-wrap">
                          {form.couponCode && (
                            <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-white text-[10px] font-black uppercase tracking-widest">
                              🏷️ {form.couponCode}
                            </span>
                          )}
                          {form.buttonText && (
                            <span className="inline-flex items-center gap-1 bg-white text-red-800 font-black text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-lg shadow-md">
                              {form.buttonText} ›
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Timer preview */}
                      <div className="flex items-center gap-1 shrink-0">
                        {['00', '12', '30', '45'].map((v, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span className="text-white/30 text-lg font-black mx-0.5">:</span>}
                            <div className="w-11 h-11 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center shadow-lg">
                              <span className="text-white text-lg font-black tabular-nums">{v}</span>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <div className="h-1 bg-black/30">
                      <div className="h-full w-1/2 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />
                    </div>
                  </div>
                  {form.countdownEndTime && (
                    <p className="text-[10px] text-gray-400 mt-2 text-center">
                      ⏱️ Ends: {new Date(form.countdownEndTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {(() => {
                        const diff = new Date(form.countdownEndTime).getTime() - Date.now();
                        if (isNaN(diff) || diff <= 0) return ' (expired!)';
                        const hrs = Math.floor(diff / 3600000);
                        return ` (${hrs}h from now)`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-gray-100">
                <button type="button" onClick={resetForm} className="px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-7 py-2.5 font-bold text-white rounded-xl shadow-lg shadow-red-600/20 hover:shadow-red-600/40 transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #8B0000 0%, #D9381E 100%)' }}
                >
                  <Check className="w-4 h-4" />
                  {editing ? 'Save Changes' : 'Publish'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-200">
          <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-bold text-gray-500">No homepage content yet.</p>
          <p className="text-sm text-gray-400 mt-1">Click "Add Content" to create your first banner or offer.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Content</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Type</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Order</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-12 h-10 object-cover rounded-xl border border-gray-100 shrink-0" />
                      ) : (
                        <div className="w-12 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl shrink-0">
                          {item.type === 'offer' ? '🎁' : '🖼️'}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.title}</p>
                        {item.subtitle && <p className="text-xs text-gray-400 truncate max-w-[240px]">{item.subtitle}</p>}
                        {item.couponCode && (
                          <span className="text-[9px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 px-2 py-0.5 rounded mt-0.5 inline-block">
                            {item.couponCode}
                          </span>
                        )}
                        {item.countdownEndTime && (
                          <span className="text-[9px] font-bold text-red-600 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> Ends: {new Date(item.countdownEndTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {(item.visibleFrom || item.visibleUntil) && (
                          <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1 mt-0.5">
                            <CalendarClock className="w-3 h-3" />
                            {item.visibleFrom ? `From: ${new Date(item.visibleFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                            {item.visibleFrom && item.visibleUntil ? ' — ' : ''}
                            {item.visibleUntil ? `Until: ${new Date(item.visibleUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={cn('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full', TYPE_COLORS[item.type])}>
                      {item.type}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="font-bold text-gray-500 text-sm">#{item.order}</span>
                  </td>
                  <td className="p-4 text-center">
                    <button onClick={() => toggleActive(item)} className={cn('inline-flex items-center gap-1.5 text-xs font-black uppercase transition-colors', item.isActive ? 'text-green-600' : 'text-gray-400')}>
                      {item.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                      {item.isActive ? 'Live' : 'Off'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className={cn(
                          'p-2 rounded-lg transition-colors',
                          deletingId === item.id
                            ? 'text-red-400 bg-red-50 cursor-wait animate-pulse'
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
