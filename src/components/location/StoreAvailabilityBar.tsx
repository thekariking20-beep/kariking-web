import React, { useState } from 'react';
import { AlertTriangle, MapPin } from 'lucide-react';
import { useAddress } from '../../context/AddressContext';
import LocationPickerModal from './LocationPickerModal';

interface StoreAvailabilityBarProps {
  /** Kept for backwards compatibility */
  availableProductCount?: number;
}

/**
 * Only renders a clean delivery-zone alert banner when the customer's
 * selected location falls outside the Admin-configured store delivery radius.
 * Hidden automatically when delivery is available.
 */
export default function StoreAvailabilityBar(_props: StoreAvailabilityBarProps) {
  const { activeCenter, nearestStore, storeLocation, isOutsideSelectedRadius } = useAddress();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!isOutsideSelectedRadius || !activeCenter || !nearestStore) {
    return null;
  }

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-900 flex items-center gap-1.5 flex-wrap">
              <span>Delivery currently unavailable for</span>
              <span className="inline-flex items-center gap-1 text-[#8B0000]">
                <MapPin className="w-3 h-3 shrink-0" />
                {activeCenter.label}
              </span>
            </p>
            <p className="text-[11px] font-medium text-amber-800 mt-0.5">
              This area is outside {storeLocation.name}&apos;s {storeLocation.maxRadiusKm} km delivery zone. Choose a nearby location to order.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="shrink-0 px-4 py-2 rounded-xl bg-[#8B0000] hover:bg-red-800 text-white text-xs font-black uppercase tracking-wider transition-colors"
        >
          Change Location
        </button>
      </div>

      <LocationPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialTab="pointing"
      />
    </>
  );
}
