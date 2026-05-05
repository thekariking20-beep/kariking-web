import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import { ProvisionedStaff } from '../../types';
import bcrypt from 'bcryptjs';
import {
  UserPlus, Trash2, Shield, Truck, Users, Eye, EyeOff,
  Loader2, CheckCircle, AlertCircle, Search, RefreshCw,
  Edit3, Key, ChevronDown, Save, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function StaffManagement() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<(ProvisionedStaff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'manager' | 'delivery'>('delivery');
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'provisionedStaff'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProvisionedStaff & { id: string }));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setStaff(list);
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const openEdit = (s: ProvisionedStaff & { id: string }) => {
    if (editingId === s.id) {
      setEditingId(null);
      return;
    }
    setEditingId(s.id);
    setEditRole(s.role);
    setEditPassword('');
    setEditConfirmPassword('');
    setShowEditPassword(false);
  };

  const handleSaveRole = async (staffPhone: string) => {
    setEditSaving(true);
    setError('');
    try {
      // Update provisionedStaff
      await updateDoc(doc(db, 'provisionedStaff', staffPhone), { role: editRole });

      // Also update the users collection doc if it exists
      const usersQuery = query(collection(db, 'users'), where('phone', '==', staffPhone));
      const snap = await getDocs(usersQuery);
      for (const userDoc of snap.docs) {
        await updateDoc(doc(db, 'users', userDoc.id), { role: editRole });
      }

      setSuccess(`Updated ${staffPhone} role to ${editRole.toUpperCase()}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to update role.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetPassword = async (staffPhone: string) => {
    if (editPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (editPassword !== editConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setEditSaving(true);
    setError('');
    try {
      // Call Cloud Function to update the REAL Firebase Auth password
      const resetFn = httpsCallable(functions, 'resetStaffPassword');
      const result = await resetFn({
        staffPhone: staffPhone,
        newPassword: editPassword,
      });
      const data = result.data as { success: boolean; message: string };

      setEditPassword('');
      setEditConfirmPassword('');
      setSuccess(data.message || `Password reset for ${staffPhone}. They must change it on next login.`);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      if (code === 'functions/not-found' || msg.includes('not-found')) {
        setError(`No auth account found for ${staffPhone}. The staff member may need to be re-added.`);
      } else if (code === 'functions/permission-denied') {
        setError('You do not have permission to reset passwords.');
      } else {
        setError(msg || 'Failed to reset password. Please try again.');
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    if (tempPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const formattedPhone = `+91${cleaned}`;

    // Check if already exists
    const existing = await getDoc(doc(db, 'provisionedStaff', formattedPhone));
    if (existing.exists()) {
      setError('This phone number is already provisioned.');
      return;
    }

    setActionLoading(true);
    try {
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const secondaryApp = initializeApp(
        {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        },
        'secondary-' + Date.now()
      );
      const secondaryAuth = getAuth(secondaryApp);

      const derivedEmail = `${cleaned}@kariking.staff`;
      const credential = await createUserWithEmailAndPassword(secondaryAuth, derivedEmail, tempPassword);
      const newUid = credential.user.uid;

      await secondaryAuth.signOut();
      try { const { deleteApp } = await import('firebase/app'); await deleteApp(secondaryApp); } catch (_) {}

      const staffData: ProvisionedStaff = {
        phone: formattedPhone,
        role: role,
        status: 'pending',
        passwordHash: passwordHash,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || '',
      };
      await setDoc(doc(db, 'provisionedStaff', formattedPhone), staffData);

      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        phone: formattedPhone,
        role: role,
        profileComplete: false,
        referralCode: newUid.slice(0, 6).toUpperCase(),
        coins: 0,
        lockedCoins: 0,
        createdAt: new Date().toISOString(),
      });

      setSuccess(`Successfully added ${role} with phone ${formattedPhone}`);
      setPhone('');
      setTempPassword('');
      setShowForm(false);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This phone number already has an account.');
      } else {
        setError(err.message || 'Failed to add staff member.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (staffPhone: string) => {
    if (!confirm(`Are you sure you want to remove ${staffPhone}?`)) return;
    
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'provisionedStaff', staffPhone));
      setSuccess(`Removed ${staffPhone}`);
    } catch (err) {
      console.error(err);
      setError('Failed to remove staff member.');
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleIcon = (r: string) => {
    switch (r) {
      case 'admin': return <Shield className="w-4 h-4 text-red-500" />;
      case 'manager': return <Users className="w-4 h-4 text-indigo-500" />;
      case 'delivery': return <Truck className="w-4 h-4 text-emerald-500" />;
      default: return null;
    }
  };

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case 'admin': return 'bg-red-50 text-red-700 border-red-200';
      case 'manager': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'delivery': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const filteredStaff = staff.filter(s => 
    s.phone.includes(searchQuery) || s.role.includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Staff Management</h2>
          <p className="text-sm text-gray-400 mt-1">Add and manage delivery partners & managers</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white font-bold text-sm shadow-lg shadow-slate-800/20 hover:from-slate-700 hover:to-slate-600 transition-all active:scale-[0.97]"
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-red-50 text-red-700 rounded-xl font-medium border border-red-100 text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-emerald-50 text-emerald-700 rounded-xl font-medium border border-emerald-100 text-sm flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 shrink-0" /> {success}
            <button onClick={() => setSuccess('')} className="ml-auto text-emerald-400 hover:text-emerald-600">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Staff Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddStaff}
            className="p-6 bg-white rounded-2xl border border-gray-100 shadow-lg space-y-5"
          >
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-500" />
              Add New Staff Member
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                <div className="flex items-center rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
                  <span className="px-3 py-3 text-gray-400 font-bold text-sm bg-gray-50 border-r border-gray-200">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    placeholder="10-digit number"
                    className="flex-1 px-3 py-3 text-sm font-semibold outline-none"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'manager' | 'delivery')}
                  className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-white"
                >
                  <option value="delivery">🚚 Delivery Partner</option>
                  <option value="manager">👥 Manager</option>
                </select>
              </div>
            </div>

            {/* Temporary Password */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Temporary Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-gray-200 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  value={tempPassword}
                  onChange={e => setTempPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Staff will be asked to change this on first login.</p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setPhone(''); setTempPassword(''); }}
                className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading || phone.length !== 10 || tempPassword.length < 6}
                className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Add Staff Member</>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by phone or role..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Staff List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300 mx-auto" />
          <p className="text-sm text-gray-400 mt-3 font-medium">Loading staff...</p>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-bold">No staff members yet</p>
          <p className="text-xs text-gray-300 mt-1">Click "Add Staff" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {/* Main Row */}
              <div className="p-4 flex items-center gap-4">
                {/* Role icon */}
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                  {getRoleIcon(s.role)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{s.phone}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getRoleBadgeColor(s.role)}`}>
                      {s.role}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      s.status === 'claimed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {s.status === 'claimed' ? 'Active' : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Date */}
                <p className="text-xs text-gray-300 font-medium hidden sm:block">
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>

                {/* Edit Button */}
                <button
                  onClick={() => openEdit(s)}
                  className={`p-2 rounded-lg transition-colors ${
                    editingId === s.id 
                      ? 'text-indigo-600 bg-indigo-50' 
                      : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-50'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteStaff(s.phone)}
                  disabled={actionLoading}
                  className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expandable Edit Panel */}
              <AnimatePresence>
                {editingId === s.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 bg-gray-50/50 p-5 space-y-5">
                      {/* ── Role Change Section ── */}
                      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-indigo-500" />
                          <h4 className="text-sm font-bold text-gray-900">Change Role</h4>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value)}
                            className="flex-1 px-3 py-2.5 rounded-lg border-2 border-gray-200 text-sm font-semibold outline-none focus:border-indigo-500 bg-white"
                          >
                            <option value="delivery">🚚 Delivery Partner</option>
                            <option value="manager">👥 Manager</option>
                            <option value="admin">🛡️ Admin</option>
                          </select>
                          <button
                            onClick={() => handleSaveRole(s.phone)}
                            disabled={editSaving || editRole === s.role}
                            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors flex items-center gap-2 shrink-0"
                          >
                            {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Role
                          </button>
                        </div>
                        {editRole !== s.role && (
                          <p className="text-xs text-indigo-600 font-medium">
                            Will change from {s.role.toUpperCase()} → {editRole.toUpperCase()}
                          </p>
                        )}
                      </div>

                      {/* ── Password Reset Section ── */}
                      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-amber-500" />
                          <h4 className="text-sm font-bold text-gray-900">Reset Password</h4>
                        </div>
                        <p className="text-xs text-gray-400">Set a new temporary password. Staff will be forced to change it on next login.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="relative">
                            <input
                              type={showEditPassword ? 'text' : 'password'}
                              placeholder="New password (min 6 chars)"
                              className="w-full px-3 py-2.5 pr-10 rounded-lg border-2 border-gray-200 text-sm font-semibold outline-none focus:border-amber-500"
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword(!showEditPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <input
                            type={showEditPassword ? 'text' : 'password'}
                            placeholder="Confirm password"
                            className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 text-sm font-semibold outline-none focus:border-amber-500"
                            value={editConfirmPassword}
                            onChange={e => setEditConfirmPassword(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleResetPassword(s.phone)}
                            disabled={editSaving || editPassword.length < 6 || editPassword !== editConfirmPassword}
                            className="px-5 py-2.5 rounded-lg bg-amber-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-amber-700 transition-colors flex items-center gap-2"
                          >
                            {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                            Reset Password
                          </button>
                          {editPassword && editConfirmPassword && editPassword !== editConfirmPassword && (
                            <p className="text-xs text-red-500 font-medium self-center">Passwords don't match</p>
                          )}
                        </div>
                      </div>

                      {/* Close */}
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3 h-3" /> Close editor
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Real-time — no manual refresh needed */}
    </div>
  );
}
