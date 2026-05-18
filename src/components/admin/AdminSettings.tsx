import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserIcon, Store, ShoppingCart, Truck, Bell, Shield, Save, Camera, Mail, Phone, Lock, Eye, EyeOff, MapPin, Check, Trash2, Loader2 } from 'lucide-react';
import { db, auth } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { SystemSettings } from '../../types';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import ImageUploadDropzone from '../ImageUploadDropzone';
import StaffManagement from './StaffManagement';
import bcrypt from 'bcryptjs';
import { updatePassword } from 'firebase/auth';
import { cleanupDuplicateUsers, CleanupReport } from '../../lib/cleanupDuplicates';

const defaultSettings: SystemSettings = {
  business: {
    storeName: 'Kari King',
    storeAddress: '123 Market Road, City Center',
    contactNumber: '+91 90000 00000',
    contactEmail: 'admin@kariking.in',
    openingHours: '08:00 AM - 09:00 PM'
  },
  orders: {
    minOrderAmount: 500,
    deliveryFee: 40,
    freeDeliveryThreshold: 1000
  },
  delivery: {
    enabled: true,
    maxRadiusKm: 15,
    autoAssign: false
  },
  notifications: {
    newOrderAlerts: true,
    deliveryUpdates: true,
    kycRequests: true
  },
  security: {
    requireOtp: true
  },
  updatedAt: new Date().toISOString()
};

export default function AdminSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'business' | 'orders' | 'delivery' | 'notifications' | 'security' | 'staff'>('profile');
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  
  // Profile specific state
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '', photo: user?.profilePhotoUrl || '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password specific state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Cleanup state
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);

  const allTabs = [
    { id: 'profile', label: 'Profile Settings', icon: UserIcon },
    { id: 'staff', label: 'Staff Management', icon: Shield },
    { id: 'business', label: 'Business Settings', icon: Store },
    { id: 'orders', label: 'Order Settings', icon: ShoppingCart },
    { id: 'delivery', label: 'Delivery Settings', icon: Truck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  const tabs = user?.role === 'manager' 
    ? allTabs.filter(t => t.id === 'profile')
    : allTabs;

  useEffect(() => {
    fetchSettings();
    if (user) {
      setProfileForm({ name: user.name || '', email: user.email || '', photo: user.profilePhotoUrl || '' });
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'system');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings({ ...defaultSettings, ...(docSnap.data() as SystemSettings) });
      } else {
        await setDoc(docRef, defaultSettings);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updatedSettings = { ...settings, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'settings', 'system'), updatedSettings);
      setSettings(updatedSettings);
      showToast("Settings updated successfully");
    } catch (err) {
      console.error("Error saving settings:", err);
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: profileForm.name,
        email: profileForm.email,
        profilePhotoUrl: profileForm.photo,
        updatedAt: new Date().toISOString()
      });
      showToast("Profile updated successfully");
    } catch (err) {
      console.error("Error updating profile:", err);
      showToast("Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return showToast('Not authenticated correctly', 'error');
    if (newPassword.length < 6) return showToast('Password must be at least 6 characters', 'error');
    if (newPassword !== confirmPassword) return showToast('Passwords do not match', 'error');

    setChangingPassword(true);
    try {
      // 1. Update Firebase Auth Native
      await updatePassword(auth.currentUser, newPassword);

      // 2. Hash and update DB Reference
      const formattedPhone = user?.phone || '';
      if (formattedPhone) {
        const newHash = await bcrypt.hash(newPassword, 10);
        await updateDoc(doc(db, 'provisionedStaff', formattedPhone), {
          passwordHash: newHash,
          mustChangePassword: false,
        });
      }
      
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password securely updated!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error(err);
      showToast("Failed to logout", "error");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 pb-8 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-4 left-1/2 z-50 px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2",
              toast.type === 'success' ? "bg-green-600 text-white shadow-green-600/20" : "bg-red-600 text-white shadow-red-600/20"
            )}
          >
            {toast.type === 'success' && <Check className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Menu (Left Sidebar) */}
      <div className="w-full md:w-64 shrink-0 space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-bold transition-all duration-200",
              activeTab === tab.id 
                ? "bg-white text-red-600 shadow-sm border border-gray-100" 
                : "text-gray-500 hover:bg-white/50 hover:text-gray-900 transparent"
            )}
          >
            <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "text-red-500" : "text-gray-400")} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panel (Right Side) */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100"
          >
            {/* -- HEADER -- */}
            <div className="mb-8 border-b border-gray-100 pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-gray-900">{tabs.find(t => t.id === activeTab)?.label}</h2>
                <p className="text-sm text-gray-500 font-medium mt-1">Manage your {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} here.</p>
              </div>
              {activeTab !== 'profile' && activeTab !== 'staff' && (
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="shrink-0 px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-lg shadow-gray-900/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
               {activeTab === 'profile' && (
                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="shrink-0 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingProfile ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              )}
            </div>

            {/* -- SECTIONS -- */}

            {/* STAFF MANAGEMENT */}
            {activeTab === 'staff' && (
              <StaffManagement />
            )}

            {/* PROFILE SETTINGS */}
            {activeTab === 'profile' && (
              <div className="space-y-8">
                <form onSubmit={saveProfile} className="space-y-8 max-w-2xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="w-32 h-32 shrink-0 relative rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100">
                       {profileForm.photo ? (
                          <img src={profileForm.photo} alt="Profile" className="w-full h-full object-cover" />
                       ) : (
                          <div className="w-full h-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-4xl font-black text-white">
                            {(profileForm.name || user?.phone || 'A').charAt(0).toUpperCase()}
                          </div>
                       )}
                       <div className="absolute inset-x-0 bottom-0 top-0 opacity-0 hover:opacity-100 transition-opacity">
                          <ImageUploadDropzone
                            value={profileForm.photo}
                            onChange={(url) => setProfileForm({ ...profileForm, photo: url })}
                            className="h-full w-full rounded-full border-none !p-0 bg-black/50 hover:bg-black/60 backdrop-blur-sm"
                          >
                            <div className="flex flex-col items-center justify-center h-full text-white">
                              <Camera className="w-8 h-8 mb-1" />
                              <span className="text-[10px] font-bold">Change</span>
                            </div>
                          </ImageUploadDropzone>
                       </div>
                    </div>
                    <div className="space-y-1 flex-1">
                      <h3 className="text-xl font-bold text-gray-900">{profileForm.name || 'Admin User'}</h3>
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{user?.role === 'admin' ? 'Administrator' : 'Manager'}</p>
                      <div className="pt-2 text-xs font-medium text-gray-500">
                        Profile ID: <span className="text-gray-900">{user?.uid}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Full Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <UserIcon className="w-5 h-5 text-gray-400" />
                        </div>
                        <input type="text" value={profileForm.name} onChange={(e) => setProfileForm({...profileForm, name: e.target.value})} className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all font-bold text-gray-900 outline-none" placeholder="e.g. John Doe" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Phone Number</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Phone className="w-5 h-5 text-gray-400" />
                        </div>
                        <input type="text" value={user?.phone || ''} disabled className="w-full pl-11 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl font-bold text-gray-500 cursor-not-allowed hidden-input" />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">Verified by Firebase Auth.</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Email Address</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Mail className="w-5 h-5 text-gray-400" />
                        </div>
                        <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({...profileForm, email: e.target.value})} className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all font-bold text-gray-900 outline-none" placeholder="admin@example.com" />
                      </div>
                    </div>
                  </div>
                </form>

                {/* Password Change Block */}
                <form onSubmit={handlePasswordChange} className="mt-10 p-6 bg-red-50/50 rounded-2xl border border-red-100 max-w-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 leading-none">Change Password</h3>
                      <p className="text-xs font-bold text-gray-500 mt-1">Update your secure login password</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">New Password</label>
                      <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all font-bold text-gray-900 outline-none" placeholder="••••••••" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Confirm New Password</label>
                      <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all font-bold text-gray-900 outline-none" placeholder="••••••••" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword || !newPassword || !confirmPassword}
                    className="mt-6 w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {changingPassword ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Shield className="w-5 h-5" />}
                    {changingPassword ? 'Updating Security...' : 'Update Password securely'}
                  </button>
                </form>
              </div>
            )}

            {/* BUSINESS SETTINGS */}
            {activeTab === 'business' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Store Name</label>
                  <input type="text" value={settings.business.storeName} onChange={(e) => setSettings({...settings, business: {...settings.business, storeName: e.target.value}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-bold text-gray-900 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Store Address</label>
                  <textarea rows={3} value={settings.business.storeAddress} onChange={(e) => setSettings({...settings, business: {...settings.business, storeAddress: e.target.value}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-medium text-gray-900 outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Contact Number</label>
                    <input type="text" value={settings.business.contactNumber} onChange={(e) => setSettings({...settings, business: {...settings.business, contactNumber: e.target.value}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-bold text-gray-900 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Support Email</label>
                    <input type="email" value={settings.business.contactEmail} onChange={(e) => setSettings({...settings, business: {...settings.business, contactEmail: e.target.value}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-bold text-gray-900 outline-none" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Opening Hours</label>
                    <input type="text" value={settings.business.openingHours} onChange={(e) => setSettings({...settings, business: {...settings.business, openingHours: e.target.value}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-medium text-gray-900 outline-none" placeholder="e.g. 09:00 AM - 10:00 PM" />
                  </div>
                </div>
              </div>
            )}

            {/* ORDER SETTINGS */}
            {activeTab === 'orders' && (
              <div className="space-y-6 max-w-2xl">
                <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Order Constraints</h4>
                    <p className="text-sm text-gray-500 mt-1">These settings affect checkout behavior on the customer app.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                   <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Minimum Order Amount (₹)</label>
                    <input type="number" value={settings.orders.minOrderAmount} onChange={(e) => setSettings({...settings, orders: {...settings.orders, minOrderAmount: Number(e.target.value)}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-black text-gray-900 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Delivery Fee (₹)</label>
                    <input type="number" value={settings.orders.deliveryFee} onChange={(e) => setSettings({...settings, orders: {...settings.orders, deliveryFee: Number(e.target.value)}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-black text-gray-900 outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Free Delivery Threshold (₹)</label>
                    <input type="number" value={settings.orders.freeDeliveryThreshold} onChange={(e) => setSettings({...settings, orders: {...settings.orders, freeDeliveryThreshold: Number(e.target.value)}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-black text-green-600 outline-none" />
                    <p className="text-xs text-gray-400 mt-2 font-medium">Orders above this amount will automatically have the delivery fee waived.</p>
                  </div>
                </div>
              </div>
            )}

            {/* DELIVERY SETTINGS */}
            {activeTab === 'delivery' && (
              <div className="space-y-8 max-w-2xl">
                 <div className="flex items-center justify-between p-6 bg-gray-50 border border-gray-200 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                        <Truck className={cn("w-6 h-6", settings.delivery.enabled ? "text-green-500" : "text-gray-400")} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">Delivery System</h4>
                        <p className="text-sm text-gray-500 mt-0.5">Enable or disable all deliveries platform-wide.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSettings({...settings, delivery: {...settings.delivery, enabled: !settings.delivery.enabled}})}
                      className={cn(
                        "w-14 h-8 rounded-full flex items-center transition-colors px-1 shrink-0",
                        settings.delivery.enabled ? "bg-green-500 justify-end" : "bg-gray-300 justify-start"
                      )}
                    >
                      <motion.div layout className="w-6 h-6 bg-white rounded-full shadow-sm" />
                    </button>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Max Delivery Radius (km)</label>
                      <input type="number" value={settings.delivery.maxRadiusKm} onChange={(e) => setSettings({...settings, delivery: {...settings.delivery, maxRadiusKm: Number(e.target.value)}})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-gray-900/10 focus:border-gray-900 transition-all font-black text-gray-900 outline-none" />
                    </div>
                 </div>

                 <div className="p-6 bg-amber-50/50 border border-amber-200/50 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-gray-900">Auto-assign Delivery Partners</h4>
                        <p className="text-sm text-gray-500 mt-1">Automatically assign nearest available driver.</p>
                      </div>
                      <button 
                        onClick={() => setSettings({...settings, delivery: {...settings.delivery, autoAssign: !settings.delivery.autoAssign}})}
                        className={cn(
                          "w-14 h-8 rounded-full flex items-center transition-colors px-1 shrink-0",
                          settings.delivery.autoAssign ? "bg-amber-500 justify-end" : "bg-gray-300 justify-start"
                        )}
                      >
                        <motion.div layout className="w-6 h-6 bg-white rounded-full shadow-sm" />
                      </button>
                    </div>
                 </div>
              </div>
            )}

            {/* NOTIFICATION SETTINGS */}
            {activeTab === 'notifications' && (
              <div className="space-y-4 max-w-2xl">
                {[
                  { id: 'newOrderAlerts', label: 'New Order Alerts', desc: 'Notify admins instantly on new orders.' },
                  { id: 'deliveryUpdates', label: 'Delivery Updates', desc: 'Push notifications when delivery status changes.' },
                  { id: 'kycRequests', label: 'KYC Requests', desc: 'Alert when a delivery partner submits documents.' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-5 bg-white border border-gray-100 shadow-sm rounded-2xl hover:border-gray-200 transition-colors">
                    <div>
                      <h4 className="font-bold text-gray-900">{item.label}</h4>
                      <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button 
                      onClick={() => setSettings({...settings, notifications: {...settings.notifications, [item.id]: !(settings.notifications as any)[item.id]}})}
                      className={cn(
                        "w-12 h-6 rounded-full flex items-center transition-colors px-1 shrink-0",
                        (settings.notifications as any)[item.id] ? "bg-red-500 justify-end" : "bg-gray-200 justify-start"
                      )}
                    >
                      <motion.div layout className="w-4 h-4 bg-white rounded-full shadow-sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* SECURITY SETTINGS */}
            {activeTab === 'security' && (
              <div className="space-y-6 max-w-2xl">
                 <div className="p-6 bg-red-50/50 border border-red-100 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <Lock className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">Force OTP Validation</h4>
                          <p className="text-xs text-gray-500 mt-0.5">Require OTP for high-value actions.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSettings({...settings, security: {...settings.security, requireOtp: !settings.security.requireOtp}})}
                        className={cn(
                          "w-12 h-6 rounded-full flex items-center transition-colors px-1",
                          settings.security.requireOtp ? "bg-red-500 justify-end" : "bg-gray-300 justify-start"
                        )}
                      >
                        <motion.div layout className="w-4 h-4 bg-white rounded-full shadow-sm" />
                      </button>
                    </div>
                 </div>

                 <div className="pt-4 border-t border-gray-100">
                    <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-widest text-red-600">Danger Zone</h4>
                    <div className="p-5 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h5 className="font-black text-gray-900">Logout All Sessions</h5>
                        <p className="text-xs text-gray-500 mt-1 max-w-sm">This will end this session and prompt re-login. Security action.</p>
                      </div>
                      <button onClick={handleLogoutAll} className="px-5 py-2.5 bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-xl transition-colors shrink-0">
                        Logout Now
                      </button>
                    </div>

                    {/* 🧹 Duplicate Users Cleanup */}
                    <div className="p-5 border border-amber-200 rounded-2xl bg-amber-50/30 space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h5 className="font-black text-gray-900 flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-amber-600" />
                            Clean Duplicate Users
                          </h5>
                          <p className="text-xs text-gray-500 mt-1 max-w-sm">Scan the users collection for phone duplicates, merge data, and delete extras.</p>
                        </div>
                        <button 
                          onClick={async () => {
                            if (!window.confirm('This will permanently delete duplicate user documents. Continue?')) return;
                            setCleaningUp(true);
                            setCleanupReport(null);
                            try {
                              const report = await cleanupDuplicateUsers();
                              setCleanupReport(report);
                              if (report.duplicatesDeleted > 0) {
                                showToast(`🧹 Cleaned ${report.duplicatesDeleted} duplicate user docs!`, 'success');
                              } else {
                                showToast('No duplicates found. Database is clean! ✅', 'success');
                              }
                            } catch (err) {
                              showToast('Cleanup failed. Check console.', 'error');
                            } finally {
                              setCleaningUp(false);
                            }
                          }}
                          disabled={cleaningUp}
                          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors shrink-0 flex items-center gap-2 disabled:opacity-50"
                        >
                          {cleaningUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {cleaningUp ? 'Scanning...' : 'Run Cleanup'}
                        </button>
                      </div>

                      {/* Cleanup Report */}
                      {cleanupReport && (
                        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                          <h6 className="font-bold text-gray-900 text-sm">Cleanup Report</h6>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-black text-gray-900">{cleanupReport.totalUsers}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Docs</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-black text-blue-600">{cleanupReport.uniquePhones}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unique Phones</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-black text-amber-600">{cleanupReport.duplicatesFound}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Duplicates</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-black text-green-600">{cleanupReport.duplicatesDeleted}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Deleted</p>
                            </div>
                          </div>
                          {cleanupReport.errors.length > 0 && (
                            <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">
                              {cleanupReport.errors.map((e, i) => <p key={i}>❌ {e}</p>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                 </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
