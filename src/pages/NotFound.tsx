import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Home, ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-md"
      >
        {/* 404 Icon */}
        <div className="relative mx-auto w-28 h-28 mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-red-100 to-red-50 rounded-3xl rotate-6" />
          <div className="absolute inset-0 bg-white rounded-3xl shadow-lg flex items-center justify-center border border-gray-100">
            <SearchX className="w-12 h-12 text-[#7A0000]" />
          </div>
        </div>

        {/* Text */}
        <h1 className="text-7xl font-black text-transparent bg-premium-gradient bg-clip-text mb-3">
          404
        </h1>
        <h2 className="text-2xl font-black text-gray-900 mb-2">
          Page Not Found
        </h2>
        <p className="text-gray-500 font-medium text-sm leading-relaxed mb-10 max-w-xs mx-auto">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-premium-gradient text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_15px_rgba(122,0,0,0.3)] hover:shadow-[0_8px_25px_rgba(122,0,0,0.4)] active:scale-95 transition-all"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-3.5 rounded-xl font-bold text-sm border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Subtle branding */}
        <p className="text-[11px] text-gray-300 mt-12 font-medium tracking-widest">
          app.kariking.in
        </p>
      </motion.div>
    </div>
  );
}
