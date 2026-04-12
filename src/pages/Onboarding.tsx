import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  ShieldCheck, UploadCloud, UserCircle, CreditCard, Car,
  ChevronRight, ChevronLeft, Loader2, CheckCircle, Camera, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const ALL_STEPS = [
  { label: 'Personal Info', icon: UserCircle },
  { label: 'Aadhar KYC', icon: CreditCard },
  { label: 'Driving License', icon: Car },
];

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Delivery partners get 3 steps, admin/manager only 2
  const isDelivery = user?.role === 'delivery';
  const STEPS = isDelivery ? ALL_STEPS : ALL_STEPS.slice(0, 2);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: user?.name || '',
    address: user?.address || '',
  });

  // File states
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [aadharFront, setAadharFront] = useState<File | null>(null);
  const [aadharFrontPreview, setAadharFrontPreview] = useState<string | null>(null);
  const [aadharBack, setAadharBack] = useState<File | null>(null);
  const [aadharBackPreview, setAadharBackPreview] = useState<string | null>(null);
  const [license, setLicense] = useState<File | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);

  // Auto redirect if already submitted or approved
  React.useEffect(() => {
    if (!user) return;
    if (user.verificationStatus === 'pending' || user.verificationStatus === 'approved') {
      navigate('/verification-pending');
    }
    // If user is already fully approved + profileComplete, send to dashboard
    if (user.profileComplete && user.verificationStatus === 'approved') {
      navigate(user.role === 'delivery' ? '/delivery' : '/admin');
    }
  }, [user, navigate]);

  const handleFileSelect = (
    file: File | null,
    setFile: (f: File | null) => void,
    setPreview: (s: string | null) => void
  ) => {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const fileRef = ref(storage, `deliveryPartners/${user?.uid}/${path}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  };

  const validateStep = (): boolean => {
    setError('');
    if (step === 0) {
      if (!formData.name.trim()) { setError('Please enter your full legal name.'); return false; }
      if (!formData.address.trim()) { setError('Please enter your residential address.'); return false; }
      if (!profilePhoto) { setError('Please upload a profile photo (selfie).'); return false; }
    }
    if (step === 1) {
      if (!aadharFront) { setError('Please upload Aadhar card front.'); return false; }
      if (!aadharBack) { setError('Please upload Aadhar card back.'); return false; }
    }
    if (step === 2 && isDelivery) {
      if (!license) { setError('Driving License is mandatory for delivery partners.'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError('');

    try {
      const uploads: Promise<string>[] = [
        uploadFile(profilePhoto!, 'profile.jpg'),
        uploadFile(aadharFront!, 'aadhar_front.jpg'),
        uploadFile(aadharBack!, 'aadhar_back.jpg'),
      ];
      
      // Only upload license for delivery partners
      if (isDelivery && license) {
        uploads.push(uploadFile(license!, 'license.jpg'));
      }

      const results = await Promise.all(uploads);
      const [photoUrl, aadharFUrl, aadharBUrl] = results;
      const licenseUrl = isDelivery ? results[3] : undefined;

      await updateDoc(doc(db, 'users', user!.uid), {
        name: formData.name.trim(),
        address: formData.address.trim(),
        profilePhotoUrl: photoUrl,
        aadharFrontUrl: aadharFUrl,
        aadharBackUrl: aadharBUrl,
        ...(licenseUrl ? { licenseUrl } : {}),
        verificationStatus: 'pending',
        submittedAt: new Date().toISOString(),
      });

      await refreshUser();
      navigate('/verification-pending');
    } catch (err) {
      console.error(err);
      setError('Upload failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100/50">

        {/* ─── HEADER ─── */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-gray-950 p-8 text-white relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/[0.03]" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/[0.02] -mb-16 -ml-16" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">Staff Verification</h1>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest">
                  {isDelivery ? 'Delivery Partner' : user?.role === 'manager' ? 'Manager' : 'Admin'} Onboarding
                </p>
              </div>
            </div>

            {/* Progress Steps */}
            <div className="mt-8 flex items-center gap-1">
              {STEPS.map((s, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300",
                      i < step ? "bg-emerald-500 text-white" :
                      i === step ? "bg-white text-slate-900 shadow-lg shadow-white/20" :
                      "bg-white/10 text-white/40"
                    )}>
                      {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider hidden sm:block",
                      i === step ? "text-white" : "text-white/30"
                    )}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 rounded-full mx-1",
                      i < step ? "bg-emerald-500" : "bg-white/10"
                    )} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* ─── FORM BODY ─── */}
        <div className="p-8">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl font-medium border border-red-100 text-sm flex items-center gap-2"
              >
                <span className="text-red-400">⚠️</span> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {/* ── STEP 0: Personal Info ── */}
            {step === 0 && (
              <motion.div
                key="step-0"
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -30, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
                  <UserCircle className="w-6 h-6 text-blue-600" /> Personal Information
                </h2>
                <p className="text-sm text-gray-400 mb-6">Enter details exactly as they appear on your government ID.</p>

                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Full Legal Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="As per Aadhar / License"
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-semibold text-gray-900 placeholder:text-gray-300"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Residential Address</label>
                    <textarea
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      rows={3}
                      placeholder="Door No, Street, Area, City, PIN"
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none font-semibold text-gray-900 placeholder:text-gray-300"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Profile Photo (Selfie)</label>
                    <label className={cn(
                      "w-full flex items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                      profilePreview ? "border-emerald-300 bg-emerald-50/50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
                    )}>
                      {profilePreview ? (
                        <div className="flex items-center gap-3">
                          <img src={profilePreview} alt="Selfie" className="w-16 h-16 rounded-full object-cover border-2 border-emerald-400" />
                          <div>
                            <p className="text-emerald-700 font-bold text-sm">Photo captured</p>
                            <p className="text-emerald-500 text-xs">Tap to change</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Camera className="w-8 h-8" />
                          <span className="text-sm font-bold">Tap to capture selfie</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" capture="user" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0] || null, setProfilePhoto, setProfilePreview)} />
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STEP 1: Aadhar KYC ── */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -30, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-blue-600" /> Aadhar Card Verification
                </h2>
                <p className="text-sm text-gray-400 mb-6">Upload clear, legible photos of both sides of your Aadhar card.</p>

                <div className="space-y-5">
                  {/* Aadhar Front */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Aadhar — Front Side</label>
                    <label className={cn(
                      "w-full flex items-center justify-center rounded-xl cursor-pointer transition-all overflow-hidden border-2 border-dashed",
                      aadharFrontPreview ? "border-emerald-300 bg-emerald-50/30 p-2" : "border-gray-300 hover:border-blue-400 p-8"
                    )}>
                      {aadharFrontPreview ? (
                        <div className="w-full">
                          <img src={aadharFrontPreview} alt="Aadhar Front" className="w-full h-40 object-cover rounded-lg" />
                          <p className="text-center text-emerald-600 font-bold text-xs mt-2">✓ Front uploaded — tap to replace</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <UploadCloud className="w-8 h-8" />
                          <span className="text-sm font-bold">Upload Aadhar Front</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0] || null, setAadharFront, setAadharFrontPreview)} />
                    </label>
                  </div>

                  {/* Aadhar Back */}
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Aadhar — Back Side</label>
                    <label className={cn(
                      "w-full flex items-center justify-center rounded-xl cursor-pointer transition-all overflow-hidden border-2 border-dashed",
                      aadharBackPreview ? "border-emerald-300 bg-emerald-50/30 p-2" : "border-gray-300 hover:border-blue-400 p-8"
                    )}>
                      {aadharBackPreview ? (
                        <div className="w-full">
                          <img src={aadharBackPreview} alt="Aadhar Back" className="w-full h-40 object-cover rounded-lg" />
                          <p className="text-center text-emerald-600 font-bold text-xs mt-2">✓ Back uploaded — tap to replace</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <UploadCloud className="w-8 h-8" />
                          <span className="text-sm font-bold">Upload Aadhar Back</span>
                        </div>
                      )}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0] || null, setAadharBack, setAadharBackPreview)} />
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Driving License ── */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -30, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
                  <Car className="w-6 h-6 text-blue-600" /> Driving License
                </h2>
                <p className="text-sm text-gray-400 mb-6">A valid driving license is mandatory for all delivery operations.</p>

                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2 block">Driving License Photo</label>
                  <label className={cn(
                    "w-full flex items-center justify-center rounded-xl cursor-pointer transition-all overflow-hidden border-2 border-dashed",
                    licensePreview ? "border-emerald-300 bg-emerald-50/30 p-2" : "border-gray-300 hover:border-blue-400 p-10"
                  )}>
                    {licensePreview ? (
                      <div className="w-full">
                        <img src={licensePreview} alt="Driving License" className="w-full h-48 object-cover rounded-lg" />
                        <p className="text-center text-emerald-600 font-bold text-xs mt-2">✓ License uploaded — tap to replace</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-gray-400">
                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <FileText className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-bold">Upload Driving License</span>
                        <span className="text-xs text-gray-300">Front side • Clear photo • No blur</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => handleFileSelect(e.target.files?.[0] || null, setLicense, setLicensePreview)} />
                  </label>
                </div>

                <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs font-bold text-amber-800">⚡ What happens next?</p>
                  <p className="text-xs text-amber-600 mt-1">
                    After submission, your documents will be reviewed by our team within <strong>24 hours</strong>.
                    Once approved, you'll get full access to the delivery dashboard.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── NAVIGATION BUTTONS ─── */}
          <div className="mt-8 flex gap-3">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="flex-shrink-0 px-5 py-4 rounded-xl border-2 border-gray-200 text-gray-500 font-bold flex items-center gap-1 hover:bg-gray-50 transition-colors active:scale-[0.97]"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-black text-base py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Uploading securely...</>
                ) : (
                  <><ShieldCheck className="w-5 h-5" /> Submit for Verification</>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-black text-base py-4 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-lg shadow-slate-900/25"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
