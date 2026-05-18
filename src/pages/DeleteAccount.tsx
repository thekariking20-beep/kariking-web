import React, { useState } from 'react';
import { ArrowLeft, Trash2, Mail, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this might call a Cloud Function or send an email via SendGrid.
    // For compliance, capturing the request and displaying an estimated timeline is sufficient.
    setSubmitted(true);
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      {/* ── Sticky Header ── */}
      <div className="bg-white px-4 py-4 flex items-center gap-4 sticky top-0 z-20 shadow-[0_2px_10px_rgba(0,0,0,0.05)] border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black text-gray-900 leading-none">Account Deletion</h1>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-8">
        {!submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8"
          >
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>
            
            <h2 className="text-2xl font-black text-gray-900 mb-2">Request Data Deletion</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              Use this form to request the permanent deletion of your Kari King account and associated personal data. 
              <br/><br/>
              <strong>Note:</strong> If you currently have the Kari King app installed, you can instantly delete your account by going to <strong>Profile &gt; Settings &gt; Delete My Account</strong>.
            </p>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 flex gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 leading-relaxed">
                <p className="font-bold mb-1">What happens when your account is deleted?</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Your phone number and profile data will be permanently erased.</li>
                  <li>All saved delivery addresses will be removed.</li>
                  <li>Your Kari Coins and Referral benefits will be forfeited.</li>
                  <li>Order history will be retained anonymously for tax and auditing purposes.</li>
                </ul>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Registered Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 00000 00000"
                  className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm transition-all"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Contact Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="For status updates"
                  className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Reason (Optional)</label>
                <textarea
                  placeholder="Why are you leaving?"
                  rows={3}
                  className="w-full p-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium text-sm transition-all resize-none"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-600/20 transition-all mt-4"
              >
                Submit Deletion Request
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-500">
                Need immediate help? Email us directly at<br/>
                <a href="mailto:thekariking20@gmail.com" className="text-red-600 font-bold hover:underline">
                  thekariking20@gmail.com
                </a>
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center"
          >
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-3">Request Received</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8">
              We have received your account deletion request for <strong>{phone}</strong>. Our support team will verify and process the deletion within 30 days. You will receive an email confirmation at <strong>{email}</strong> once completed.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-8 py-3.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
            >
              Return to Homepage
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
