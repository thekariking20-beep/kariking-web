import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud, X, FileImage, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ImageUploadDropzoneProps {
  value: string;
  onChange: (url: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export default function ImageUploadDropzone({ value, onChange, className, children }: ImageUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    setError(null);
    
    // 1. Validate Type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Only image files allowed (PNG, JPG, WEBP)');
      return;
    }

    // 2. Validate Size (Max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File is too large. Maximum size is 10MB.');
      return;
    }

    setIsUploading(true);

    try {
      // FRONTEND MOCK: Read file as Base64 format so it works instantly without Backend
      // When ready for Firebase Storage, replace this with uploadBytesResumable logic
      const base64Url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Simulate network delay for premium feel
      setTimeout(() => {
        onChange(base64Url);
        setIsUploading(false);
      }, 800);

    } catch (err) {
      console.error(err);
      setError('An error occurred while preparing the image.');
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const triggerSelect = () => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

      {children ? (
        <div className="w-full h-full relative cursor-pointer" onClick={triggerSelect}>
           {children}
           {isUploading && (
             <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10" style={{ borderRadius: 'inherit' }}>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
             </div>
           )}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {value ? (
            /* PREVIEW STATE */
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full h-48 rounded-2xl border-2 border-gray-200 overflow-hidden group shadow-sm"
            >
              <img 
                src={value} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="bg-white text-red-600 p-2.5 rounded-full shadow-lg hover:bg-red-50 hover:scale-110 transition-all font-bold"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-white text-xs font-medium truncate px-2 flex items-center gap-1.5">
                  <FileImage className="w-3.5 h-3.5" /> Image attached successfully
                </p>
              </div>
            </motion.div>
          ) : (
            /* DRAG & DROP STATE */
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerSelect}
              className={cn(
                "w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative overflow-hidden",
                isDragging 
                  ? "border-[#8B0000] bg-[#8B0000]/5 scale-[0.99]" 
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"
              )}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-8 h-8 animate-spin text-[#8B0000]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>
                  <p className="text-sm font-bold text-[#8B0000]">Processing Image...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 text-center">
                  <div className={cn(
                    "p-3 rounded-full mb-1 transition-colors",
                    isDragging ? "bg-[#8B0000] text-white" : "bg-white text-gray-400 shadow-sm"
                  )}>
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-700">
                    Drag & drop image here
                  </p>
                  <p className="text-xs text-gray-400 font-medium">
                    or click to select file
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ERROR STATE */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-3 flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-xl border border-red-100"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
