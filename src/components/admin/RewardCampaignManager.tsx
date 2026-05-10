import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, deleteDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { RewardCampaign } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Calendar, ToggleLeft, ToggleRight,
  X, CheckCircle2, Loader2, AlertCircle, Sparkles, Trash2, Zap
} from 'lucide-react';
import { cn } from '../../lib/utils';

const EMPTY_FORM = {
  title: '',
  description: '',
  multiplier: 2,
  startsAt: '',
  endsAt: '',
};

export default function RewardCampaignManager() {
  const [campaigns, setCampaigns] = useState<RewardCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'rewardCampaigns'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardCampaign));
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCampaigns(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching campaigns:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (form.multiplier <= 1) { setError('Multiplier must be greater than 1.'); return; }
    if (!form.startsAt) { setError('Start date is required.'); return; }
    if (!form.endsAt) { setError('End date is required.'); return; }

    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (end <= start) { setError('End date must be after start date.'); return; }

    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'rewardCampaigns'), {
        title: form.title.trim(),
        description: form.description.trim(),
        multiplier: Number(form.multiplier),
        isActive: true,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        createdAt: new Date().toISOString(),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError('Failed to create campaign.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (campaign: RewardCampaign) => {
    setTogglingId(campaign.id!);
    try {
      await updateDoc(doc(db, 'rewardCampaigns', campaign.id!), { isActive: !campaign.isActive });
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'rewardCampaigns', id));
    } catch (e: any) {
      console.error(e);
      alert('Failed to delete: ' + (e.message || e));
    } finally {
      setDeletingId(null);
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
          <h2 className="text-xl font-black text-gray-900">Reward Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">{campaigns.length} campaigns total</p>
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
          {showForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Create Campaign</>}
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
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest">New Promotional Event</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Title */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Campaign Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Sunday Double Coins"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Multiplier */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Coin Multiplier</label>
                  <input
                    type="number"
                    min="1.1"
                    step="0.1"
                    value={form.multiplier || ''}
                    onChange={e => setForm(f => ({ ...f, multiplier: Number(e.target.value) }))}
                    placeholder="2"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Starts At */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Starts At</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>

                {/* Ends At */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Ends At</label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>
                
                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Earn 2x coins on all orders today!"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
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
                {saving ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Campaigns List ───────────────────────────────────────────────────── */}
      {campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Zap className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="font-bold text-gray-500">No campaigns created yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first multiplier campaign above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(campaign => {
            const now = new Date();
            const start = new Date(campaign.startsAt);
            const end = new Date(campaign.endsAt);
            const isExpired = end < now;
            const isCurrentlyActive = campaign.isActive && start <= now && end >= now;

            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-white rounded-2xl border p-5 shadow-sm transition-all flex flex-col sm:flex-row gap-4 justify-between items-start",
                  !campaign.isActive || isExpired ? "border-gray-100 opacity-60" : "border-red-200 ring-2 ring-red-50"
                )}
              >
                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h4 className="text-base font-black text-gray-900">{campaign.title}</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> {campaign.multiplier}x COINS
                    </span>
                    {isCurrentlyActive && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-100 text-green-700 animate-pulse">
                        LIVE NOW
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Expired
                      </span>
                    )}
                  </div>
                  
                  {campaign.description && (
                    <p className="text-sm font-bold text-gray-500 mb-3">{campaign.description}</p>
                  )}

                  {/* Details */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Starts: {start.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Ends: {end.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-2 sm:mt-0 mt-2">
                  <button
                    onClick={() => handleDelete(campaign.id!)}
                    disabled={deletingId === campaign.id}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      deletingId === campaign.id ? 'text-red-400 bg-red-50 cursor-wait animate-pulse' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                    )}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => toggleActive(campaign)}
                    disabled={togglingId === campaign.id}
                    className=""
                  >
                    {campaign.isActive ? (
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
