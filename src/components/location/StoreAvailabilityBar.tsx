import React, { useState } from 'react';
import { MapPin, Store, AlertTriangle, CheckCircle2, SlidersHorizontal, Navigation } from 'lucide-react';
import { useAddress } from '../../context/AddressContext';
import { formatDistanceKm, RADIUS_PRESETS } from '../../lib/geo';
import { cn } from '../../lib/utils';
import LocationPickerModal from './LocationPickerModal';

interface StoreAvailabilityBarProps {
  /** Number of currently available in-stock products */
  availableProductCount?: number;
}

export default function StoreAvailabilityBar({ availableProductCount }: StoreAvailabilityBarProps) {
  const {
    activeCenter,
    radiusKm,
    setRadiusKm,
    evaluatedStores,
    matchingStores,
    nearestStore,
    storeLocation,
    isOutsideSelectedRadius,
  } = useAddress();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const recommendedExpandRadius = nearestStore
    ? RADIUS_PRESETS.find((r) => r >= nearestStore.distanceKm) || 25
    : 25;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border p-4 shadow-sm transition-all',
          isOutsideSelectedRadius
            ? 'bg-amber-50/90 border-amber-200'
            : activeCenter
              ? 'bg-white border-gray-100'
              : 'bg-red-50/50 border-red-100'
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Pointing Location & Nearest Store Distance */}
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                isOutsideSelectedRadius
                  ? 'bg-amber-100 text-amber-700'
                  : activeCenter
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-100 text-[#8B0000]'
              )}
            >
              {isOutsideSelectedRadius ? (
                <AlertTriangle className="w-5 h-5" />
              ) : activeCenter ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Navigation className="w-5 h-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {activeCenter && nearestStore ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Pointing At
                    </span>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="text-xs font-black text-[#8B0000] hover:underline flex items-center gap-1 truncate max-w-[220px]"
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{activeCenter.label}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-900">
                      <Store className="w-3.5 h-3.5 text-[#8B0000]" />
                      <span>{nearestStore.name}</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-black',
                          nearestStore.inSelectedRadius
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-200/80 text-amber-900'
                        )}
                      >
                        {formatDistanceKm(nearestStore.distanceKm)} ({nearestStore.bearing})
                      </span>
                    </div>

                    {typeof availableProductCount === 'number' && !isOutsideSelectedRadius && (
                      <span className="text-[11px] font-semibold text-gray-500">
                        • {availableProductCount} {availableProductCount === 1 ? 'item' : 'items'} in stock within {radiusKm} km
                      </span>
                    )}
                  </div>

                  {/* Sorted store list if multiple stores exist in future */}
                  {evaluatedStores.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {evaluatedStores.map((st) => (
                        <span
                          key={st.id}
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-lg border',
                            st.inSelectedRadius
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-gray-50 border-gray-200 text-gray-400'
                          )}
                        >
                          {st.name}: {formatDistanceKm(st.distanceKm, false)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs font-black text-gray-900">
                    Set your pointing location to check distance &amp; availability
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Browsing all items from <span className="font-bold text-gray-700">{storeLocation.name}</span> • Standard radius {storeLocation.maxRadiusKm} km
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Right: Quick Radius Pills + Change Location */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mr-1 hidden sm:inline-flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> Radius:
            </span>
            {RADIUS_PRESETS.map((km) => (
              <button
                key={km}
                onClick={() => setRadiusKm(km)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all border',
                  radiusKm === km
                    ? 'bg-[#8B0000] text-white border-[#8B0000] shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                )}
              >
                {km}km
              </button>
            ))}
            <button
              onClick={() => setIsModalOpen(true)}
              className="ml-1 px-3 py-1 rounded-lg text-[11px] font-black bg-gray-900 text-white hover:bg-black transition-colors"
            >
              {activeCenter ? 'Change' : 'Set Point'}
            </button>
          </div>
        </div>

        {/* Out-of-radius Action Strip */}
        {isOutsideSelectedRadius && nearestStore && (
          <div className="mt-3 pt-3 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <p className="text-xs font-bold text-amber-900">
              {matchingStores.length === 0 && (
                <>
                  {nearestStore.name} is{' '}
                  <span className="font-black underline">
                    {formatDistanceKm(nearestStore.distanceKm)}
                  </span>{' '}
                  — outside your {radiusKm} km radius. Products are paused for this range.
                </>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {nearestStore.distanceKm <= 25 && recommendedExpandRadius > radiusKm && (
                <button
                  onClick={() => setRadiusKm(recommendedExpandRadius)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wider transition-colors"
                >
                  Expand to {recommendedExpandRadius} km
                </button>
              )}
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-black uppercase tracking-wider transition-colors"
              >
                Change Pointing Location
              </button>
            </div>
          </div>
        )}
      </div>

      <LocationPickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialTab="pointing"
      />
    </>
  );
}
