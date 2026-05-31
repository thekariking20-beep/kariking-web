import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, MapPin, Bell, CreditCard, Gift, ClipboardList,
  Phone, LogOut, ChevronRight, Crown, Coins, Package, Edit3, Shield, X, Check, Trash2, Wallet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { cn } from '../lib/utils';
import ImageUploadDropzone from '../components/ImageUploadDropzone';

interface StatCard {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
}

function PremiumAvatar({ gender, size = 'sm' }: { gender?: string, size?: 'sm' | 'lg' }) {
  const isLg = size === 'lg';
  const containerClass = cn(
    "rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 shadow-[0_4px_20px_rgba(139,0,0,0.3)] border-4 border-white",
    gender === 'female' ? "from-pink-500 to-rose-700 shadow-pink-500/20" :
    gender === 'male' ? "from-blue-500 to-indigo-700 shadow-blue-500/20" :
    "from-[#DC2626] to-[#8B0000] shadow-red-600/20",
    isLg ? "w-24 h-24" : "w-16 h-16 sm:w-20 sm:h-20"
  );
  
  const iconClass = cn("text-white drop-shadow-md", isLg ? "w-12 h-12" : "w-8 h-8 sm:w-10 sm:h-10");

  return (
    <div className={containerClass}>
      <User className={iconClass} strokeWidth={2.5} />
    </div>
  );
}

interface StatCard {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [orderCount, setOrderCount] = useState(0);
  const [addressCount, setAddressCount] = useState(0);
  const [loadingOrderStats, setLoadingOrderStats] = useState(true);
  const [loadingAddressStats, setLoadingAddressStats] = useState(true);

  // Edit Profile States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('');

  // Delete Account States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Real-time Order Count
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setOrderCount(snap.size);
      setLoadingOrderStats(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Real-time Addresses Count
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `addresses/${user.uid}/userAddresses`));
    const unsubscribe = onSnapshot(q, (snap) => {
      setAddressCount(snap.size);
      setLoadingAddressStats(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Reset local edit state when modal opens
  useEffect(() => {
    if (user && showEditModal) {
      setEditName(user.name || '');
      setEditGender(user.gender || '');
    }
  }, [showEditModal, user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleNotifications = async () => {
    if (!user) return;
    const currentVal = !!user.notificationEnabled;
    await updateDoc(doc(db, 'users', user.uid), { notificationEnabled: !currentVal });
    await refreshUser();
  };

  const saveProfile = async () => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { name: editName, gender: editGender });
    await refreshUser();
    setShowEditModal(false);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      const deleteFn = httpsCallable(functions, 'deleteUserAccount');
      await deleteFn();
      // On success, Firebase Auth invalidates the session, triggering the auth listener to log out
      window.location.href = '/login'; 
    } catch (e: any) {
      console.error(e);
      alert('Failed to delete account: ' + (e.message || e));
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  const stats: StatCard[] = [
    { icon: Package, label: 'Orders', value: loadingOrderStats ? '...' : orderCount, gradient: 'from-[#8B0000] to-[#DC2626]' },
    { icon: Coins, label: 'Coins', value: user.coins || 0, gradient: 'from-amber-500 to-orange-600' },
    { icon: MapPin, label: 'Addresses', value: loadingAddressStats ? '...' : addressCount, gradient: 'from-emerald-500 to-green-600' },
  ];

  const menuSections = [
    {
      title: 'My Account',
      items: [
        { icon: MapPin, label: 'Manage Addresses', desc: 'Add or edit delivery addresses', action: () => navigate('/profile/addresses') },
        { icon: ClipboardList, label: 'Order History', desc: 'View all past orders', action: () => navigate('/orders') },
        { icon: Gift, label: 'Referral & Earnings', desc: 'Invite friends, earn coins', action: () => navigate('/referral') },
        { icon: Wallet, label: 'Kari Wallet', desc: 'Withdraw coins to real money', action: () => navigate('/wallet') },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { 
          icon: Bell, 
          label: 'Notifications', 
          desc: user.notificationEnabled ? 'Enabled ✅' : 'Disabled ❌', 
          action: () => toggleNotifications() 
        },
        { icon: CreditCard, label: 'Payment Methods', desc: 'Add UPI, cards, wallets', action: () => navigate('/profile/payments') },
      ]
    },
    {
      title: 'Support',
      items: [
        { icon: Phone, label: 'Help & Support', desc: 'Chat with us on WhatsApp', action: () => window.open('https://wa.me/916380886374?text=Hi%20Kari%20King%20Support!', '_blank') },
        { icon: Shield, label: 'Privacy & Terms', desc: 'Read our policies', action: () => navigate('/privacy-policy') },
      ]
    },
    {
      title: 'Danger Zone',
      items: [
        { icon: Trash2, label: 'Delete My Account', desc: 'Permanently delete your data', action: () => setShowDeleteModal(true), danger: true },
      ]
    }
  ];

  return (
    <div className="space-y-6 pb-8">

      {/* ─── PROFILE HEADER CARD ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#8B0000] via-[#A50000] to-[#DC2626] p-6 shadow-[0_8px_30px_rgba(139,0,0,0.3)]"
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative z-10 flex items-center gap-4">
          {/* Avatar */}
          <PremiumAvatar gender={user.gender} size="lg" />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-white truncate drop-shadow-md">
              {user.name || user.phone}
            </h1>
            <p className="text-white/60 text-sm font-medium mt-0.5">{user.phone}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-amber-300 text-xs font-black uppercase tracking-widest">Premium Member</span>
            </div>
          </div>

          {/* Edit button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowEditModal(true)}
            className="w-10 h-10 shrink-0 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors"
          >
            <Edit3 className="w-4 h-4 text-white" />
          </motion.button>
        </div>
      </motion.div>

      {/* ─── STATS ROW ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl p-4 flex flex-col items-center text-center gap-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100/80 premium-card"
          >
            <div className={`bg-gradient-to-br ${stat.gradient} p-2.5 rounded-xl text-white shadow-md`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xl font-black text-gray-900 leading-none">{stat.value}</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── MENU SECTIONS ──────────────────────────────────────────────────── */}
      {menuSections.map((section, sIdx) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + sIdx * 0.06 }}
        >
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">{section.title}</h3>
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100/80 overflow-hidden divide-y divide-gray-50">
            {section.items.map((item) => (
              <motion.button
                key={item.label}
                whileTap={{ scale: 0.98, backgroundColor: item.danger ? 'rgba(239,68,68,0.05)' : 'rgba(139,0,0,0.03)' }}
                onClick={item.action}
                className={cn("flex items-center gap-3.5 px-4 py-3.5 w-full text-left transition-colors group", item.danger ? "hover:bg-red-50/50" : "hover:bg-gray-50/80")}
              >
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors", item.danger ? "bg-red-50 group-hover:bg-red-100" : "bg-gray-50 group-hover:bg-red-50")}>
                  <item.icon className={cn("w-4.5 h-4.5 transition-colors", item.danger ? "text-red-500" : "text-gray-400 group-hover:text-[#8B0000]")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-bold leading-tight", item.danger ? "text-red-600" : "text-gray-900")}>{item.label}</p>
                  <p className={cn("text-[11px] mt-0.5 leading-tight", item.danger ? "text-red-400" : "text-gray-400")}>{item.desc}</p>
                </div>
                <ChevronRight className={cn("w-4 h-4 shrink-0 transition-colors", item.danger ? "text-red-300 group-hover:text-red-500" : "text-gray-300 group-hover:text-[#8B0000]")} />
              </motion.button>
            ))}
          </div>
        </motion.div>
      ))}

      {/* ─── LOGOUT BUTTON ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2.5 bg-white text-red-600 font-bold text-sm py-4 rounded-2xl border border-red-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
          <span>Log Out</span>
        </motion.button>
      </motion.div>

      {/* ─── APP VERSION ───────────────────────────────────────────────────── */}
      <p className="text-center text-[10px] text-gray-300 font-medium tracking-wider uppercase">
        Kari King v1.0.0 • Made with ❤️
      </p>

      {/* ─── EDIT PROFILE MODAL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[80px]"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button onClick={() => setShowEditModal(false)} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <X className="w-5 h-5 text-gray-500" />
              </button>
              
              <h2 className="text-xl font-black text-gray-900 mb-6">Edit Profile</h2>

              <div className="flex flex-col items-center mb-8">
                <PremiumAvatar gender={editGender} size="lg" />
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3">Gender</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditGender('male')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2",
                        editGender === 'male' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-100 bg-gray-50 text-gray-400 hover:bg-gray-100"
                      )}
                    >
                      {editGender === 'male' && <Check className="w-4 h-4" />} Male
                    </button>
                    <button
                      onClick={() => setEditGender('female')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2",
                        editGender === 'female' ? "border-pink-500 bg-pink-50 text-pink-700" : "border-gray-100 bg-gray-50 text-gray-400 hover:bg-gray-100"
                      )}
                    >
                      {editGender === 'female' && <Check className="w-4 h-4" />} Female
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full pb-3 border-b-2 border-gray-100 focus:border-[#8B0000] outline-none text-base font-bold bg-transparent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Phone Number</label>
                  <input
                    type="text"
                    value={user.phone}
                    disabled
                    className="w-full pb-3 border-b-2 border-gray-100 outline-none text-base font-bold text-gray-400 bg-transparent cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-2">Phone numbers cannot be changed. Contact support if you lost your number.</p>
                </div>
              </div>

              <button 
                onClick={saveProfile}
                disabled={!editName}
                className="w-full mt-8 bg-[#8B0000] text-white font-bold py-4 rounded-xl shadow-lg shadow-[#8B0000]/20 disabled:opacity-50"
              >
                Save Changes
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── DELETE ACCOUNT MODAL ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              
              <h2 className="text-xl font-black text-gray-900 mb-2 text-center">Delete Account?</h2>
              
              <div className="bg-red-50 rounded-xl p-4 mb-6 border border-red-100">
                <p className="text-sm text-red-800 font-bold mb-2">This action cannot be undone. You will lose:</p>
                <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                  <li>Your profile and saved addresses</li>
                  <li>All your Kari Coins ({user.coins || 0} coins)</li>
                  <li>Referral benefits and rewards</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="w-full bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {deletingAccount ? (
                    <>Deleting...</>
                  ) : (
                    <>Yes, Delete My Account</>
                  )}
                </button>
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                  className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
