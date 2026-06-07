import React, { useState } from 'react';
import { Shield, UserPlus, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import bcrypt from 'bcryptjs';

export default function StaffProvisioning() {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'manager' | 'delivery'>('manager');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = `+91${cleanedPhone}`;

      // Check if user already exists in users collection
      const q = query(collection(db, 'users'), where('phone', '==', formattedPhone));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // User exists — update their role instead of blocking
        const existingDoc = snapshot.docs[0];
        await updateDoc(doc(db, 'users', existingDoc.id), { role: role });
        
        // Also update/create provisionedStaff entry with default password
        const defaultHash = await bcrypt.hash('Staff@123', 10);
        const provRef = doc(db, 'provisionedStaff', formattedPhone);
        await setDoc(provRef, {
          phone: formattedPhone,
          role: role,
          passwordHash: defaultHash,
          mustChangePassword: true,
          provisionedAt: new Date().toISOString(),
          status: 'claimed' // Already has an account
        }, { merge: true });

        setSuccess(`✅ Updated existing user ${formattedPhone} to ${role.toUpperCase()} role. Default password: Staff@123 (must change on first login).`);
        setPhone('');
        setLoading(false);
        return;
      }

      // Check if already provisioned but not yet claimed
      const existingProv = await getDoc(doc(db, 'provisionedStaff', formattedPhone));
      if (existingProv.exists() && existingProv.data().status === 'pending') {
        // Update the existing provision
        await updateDoc(doc(db, 'provisionedStaff', formattedPhone), {
          role: role,
          provisionedAt: new Date().toISOString(),
        });
        setSuccess(`Updated pending provision for ${formattedPhone} to ${role.toUpperCase()}.`);
        setPhone('');
        setLoading(false);
        return;
      }

      // New provision — create entry with default password
      const defaultHash = await bcrypt.hash('Staff@123', 10);
      const docRef = doc(db, 'provisionedStaff', formattedPhone);
      await setDoc(docRef, {
        phone: formattedPhone,
        role: role,
        passwordHash: defaultHash,
        mustChangePassword: true,
        provisionedAt: new Date().toISOString(),
        status: 'pending' // pending until they login and claim it
      });

      setSuccess(`Successfully provisioned ${formattedPhone} as ${role.toUpperCase()}! Default password: Staff@123 (must change on first login).`);
      setPhone('');
    } catch (err: any) {
      console.error(err);
      setError('Failed to provision staff. Make sure you have admin rights.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">Provision Security Roles</h2>
          <p className="text-sm font-medium text-gray-400">Authorize elevated access for Managers & Delivery Partners</p>
        </div>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
            <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm font-bold border border-green-100 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleProvision} className="space-y-6">
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Agent Phone Number</label>
          <div className="relative flex items-center bg-gray-50 border-2 border-transparent focus-within:border-blue-600 focus-within:bg-white rounded-2xl transition-all">
            <div className="pl-4 pr-3 py-4 border-r border-gray-200 text-gray-500 font-bold bg-white rounded-l-2xl">
              +91
            </div>
            <input
              type="tel"
              required
              maxLength={10}
              placeholder="99999 99999"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-transparent outline-none pl-4 pr-4 py-4 font-bold text-gray-900 placeholder:font-medium placeholder:text-gray-300"
            />
            <Phone className="w-5 h-5 text-gray-400 absolute right-4 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3 block">Assign System Role</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setRole('manager')}
              className={cn(
                "flex-1 py-4 px-4 rounded-2xl border-2 font-black tracking-wide uppercase text-sm transition-all flex flex-col items-center gap-1",
                role === 'manager' ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-100 text-gray-400 hover:border-gray-200"
              )}
            >
              <span>Manager</span>
              <span className="text-[9px] font-medium normal-case tracking-normal opacity-80">Full Order Access</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('delivery')}
              className={cn(
                "flex-1 py-4 px-4 rounded-2xl border-2 font-black tracking-wide uppercase text-sm transition-all flex flex-col items-center gap-1",
                role === 'delivery' ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-gray-100 text-gray-400 hover:border-gray-200"
              )}
            >
              <span>Delivery</span>
              <span className="text-[9px] font-medium normal-case tracking-normal opacity-80">Rider App Access</span>
            </button>
          </div>
        </div>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || phone.length !== 10}
          className="w-full bg-blue-600 text-white font-black uppercase tracking-wide py-4 text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5" /> Provision Agent</>}
        </button>
      </form>
    </div>
  );
}
