import React, { useRef, useMemo } from 'react';
import { Crosshair, Store } from 'lucide-react';
import { findNearestOfflineLocation } from '../../config/locationDataset';
import { formatDistanceKm, getCompassDirection, haversineDistanceKm } from '../../lib/geo';

interface LocalRadarPickerProps {
  /** Anchor / Store latitude */
  storeLat: number;
  /** Anchor / Store longitude */
  storeLng: number;
  storeName?: string;
  /** Store standard delivery radius (km) */
  maxRadiusKm?: number;
  /** Currently selected user radius (km) */
  radiusKm?: number;
  /** Active movable pin latitude */
  lat: number;
  /** Active movable pin longitude */
  lng: number;
  /** Called whenever user taps radar or edits numeric lat/lng */
  onChange: (lat: number, lng: number) => void;
  /** 'customer' moves pointing pin relative to store; 'admin' moves store pin relative to reference center */
  mode?: 'customer' | 'admin';
  /** Reference center used in 'admin' mode (defaults to initial store location) */
  anchorLat?: number;
  anchorLng?: number;
}

const VIEWBOX_SIZE = 240;
const CENTER_PX = VIEWBOX_SIZE / 2;
const MAX_PLOT_RADIUS_PX = 98;
const KM_PER_DEG_LAT = 111.32;

export default function LocalRadarPicker({
  storeLat,
  storeLng,
  storeName = 'Kari King Store',
  maxRadiusKm = 15,
  radiusKm = 10,
  lat,
  lng,
  onChange,
  mode = 'customer',
  anchorLat,
  anchorLng,
}: LocalRadarPickerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const originLat = mode === 'admin' ? (anchorLat ?? storeLat) : storeLat;
  const originLng = mode === 'admin' ? (anchorLng ?? storeLng) : storeLng;

  const cosLat = useMemo(() => {
    const c = Math.cos((originLat * Math.PI) / 180);
    return Math.abs(c) > 0.1 ? c : 0.97;
  }, [originLat]);

  const distanceKm = useMemo(
    () => haversineDistanceKm(originLat, originLng, lat, lng),
    [originLat, originLng, lat, lng]
  );

  const bearing = useMemo(
    () => getCompassDirection(originLat, originLng, lat, lng),
    [originLat, originLng, lat, lng]
  );

  const nearestArea = useMemo(() => findNearestOfflineLocation(lat, lng), [lat, lng]);

  // Scale radar dynamically so selected radius & pin stay visible inside the circle
  const maxScaleKm = useMemo(() => {
    const target = Math.max(radiusKm * 1.25, distanceKm * 1.2, maxRadiusKm * 1.1, 10);
    if (target <= 10) return 10;
    if (target <= 15) return 15;
    if (target <= 25) return 25;
    if (target <= 35) return 35;
    return Math.ceil(target / 10) * 10;
  }, [radiusKm, distanceKm, maxRadiusKm]);

  const ringSteps = useMemo(() => {
    if (maxScaleKm <= 10) return [2, 5, 10];
    if (maxScaleKm <= 15) return [5, 10, 15];
    if (maxScaleKm <= 25) return [5, 10, 25];
    return [10, 20, maxScaleKm];
  }, [maxScaleKm]);

  // Convert pin (lat, lng) -> SVG pixel position
  const pinPos = useMemo(() => {
    const dxKm = (lng - originLng) * KM_PER_DEG_LAT * cosLat;
    const dyKm = -(lat - originLat) * KM_PER_DEG_LAT;
    const rawR = Math.hypot(dxKm, dyKm);
    const clampScale = rawR > maxScaleKm ? maxScaleKm / rawR : 1;
    const px = CENTER_PX + ((dxKm * clampScale) / maxScaleKm) * MAX_PLOT_RADIUS_PX;
    const py = CENTER_PX + ((dyKm * clampScale) / maxScaleKm) * MAX_PLOT_RADIUS_PX;
    return { x: px, y: py };
  }, [lat, lng, originLat, originLng, cosLat, maxScaleKm]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clickX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_SIZE;
    const clickY = ((e.clientY - rect.top) / rect.height) * VIEWBOX_SIZE;

    const dxPx = clickX - CENTER_PX;
    const dyPx = clickY - CENTER_PX;

    const dxKm = (dxPx / MAX_PLOT_RADIUS_PX) * maxScaleKm;
    const dyKm = (dyPx / MAX_PLOT_RADIUS_PX) * maxScaleKm;

    const newLat = Number((originLat - dyKm / KM_PER_DEG_LAT).toFixed(5));
    const newLng = Number((originLng + dxKm / (KM_PER_DEG_LAT * cosLat)).toFixed(5));
    onChange(newLat, newLng);
  };

  const radiusCirclePx = Math.min(MAX_PLOT_RADIUS_PX, (radiusKm / maxScaleKm) * MAX_PLOT_RADIUS_PX);
  const inRadius = distanceKm <= radiusKm;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-[#8B0000]" />
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
            Offline Radar &amp; Pin Picker
          </span>
        </div>
        <span className="text-[10px] font-bold text-gray-500">
          Tap anywhere on grid to point
        </span>
      </div>

      {/* Interactive SVG Radar */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative shrink-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            onClick={handleSvgClick}
            className="w-52 h-52 rounded-full bg-white border border-gray-200 shadow-inner cursor-crosshair select-none touch-none"
          >
            {/* Crosshair axes */}
            <line x1={CENTER_PX} y1={12} x2={CENTER_PX} y2={VIEWBOX_SIZE - 12} stroke="#f3f4f6" strokeWidth="1" />
            <line x1={12} y1={CENTER_PX} x2={VIEWBOX_SIZE - 12} y2={CENTER_PX} stroke="#f3f4f6" strokeWidth="1" />

            {/* Compass labels */}
            <text x={CENTER_PX} y={14} textAnchor="middle" fontSize="8" fontWeight="800" fill="#9ca3af">N</text>
            <text x={CENTER_PX} y={VIEWBOX_SIZE - 6} textAnchor="middle" fontSize="8" fontWeight="800" fill="#9ca3af">S</text>
            <text x={VIEWBOX_SIZE - 10} y={CENTER_PX + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#9ca3af">E</text>
            <text x={10} y={CENTER_PX + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#9ca3af">W</text>

            {/* Scale rings */}
            {ringSteps.map((km) => {
              const r = (km / maxScaleKm) * MAX_PLOT_RADIUS_PX;
              return (
                <g key={km}>
                  <circle
                    cx={CENTER_PX}
                    cy={CENTER_PX}
                    r={r}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={CENTER_PX + 3}
                    y={CENTER_PX - r + 9}
                    fontSize="7"
                    fontWeight="700"
                    fill="#9ca3af"
                  >
                    {km}km
                  </text>
                </g>
              );
            })}

            {/* Selected Radius Ring (customer mode) */}
            {mode === 'customer' && (
              <circle
                cx={CENTER_PX}
                cy={CENTER_PX}
                r={radiusCirclePx}
                fill={inRadius ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.06)'}
                stroke={inRadius ? '#16a34a' : '#dc2626'}
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
            )}

            {/* Line from origin to selected pin */}
            <line
              x1={CENTER_PX}
              y1={CENTER_PX}
              x2={pinPos.x}
              y2={pinPos.y}
              stroke={mode === 'customer' ? (inRadius ? '#16a34a' : '#dc2626') : '#8B0000'}
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />

            {/* Origin Marker */}
            <circle cx={CENTER_PX} cy={CENTER_PX} r="5" fill="#8B0000" stroke="#ffffff" strokeWidth="1.5" />

            {/* User / Movable Pin */}
            <g transform={`translate(${pinPos.x}, ${pinPos.y})`}>
              <circle
                r="10"
                fill={mode === 'customer' ? (inRadius ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)') : 'rgba(139,0,0,0.2)'}
              />
              <circle
                r="5.5"
                fill={mode === 'customer' ? (inRadius ? '#16a34a' : '#dc2626') : '#2563eb'}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          </svg>
        </div>

        {/* Live Telemetry & Manual Coordinate Inputs */}
        <div className="flex-1 w-full space-y-2.5">
          <div className="bg-white rounded-xl p-2.5 border border-gray-200 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-800">
              <Store className="w-3.5 h-3.5 text-[#8B0000] shrink-0" />
              <span className="truncate">
                {mode === 'customer' ? storeName : 'Store Pin Offset'}
              </span>
            </div>
            {mode === 'customer' ? (
              <p className={`text-xs font-black ${inRadius ? 'text-green-600' : 'text-red-600'}`}>
                {inRadius ? 'Inside delivery zone' : `Outside ${maxRadiusKm} km delivery zone`}
              </p>
            ) : (
              <p className="text-xs font-bold text-blue-700">
                Pin set {formatDistanceKm(distanceKm, false)} from reference
              </p>
            )}
            <p className="text-[10px] text-gray-500">
              Nearest area: <span className="font-bold text-gray-700">{nearestArea.entry.name}</span> ({nearestArea.entry.pincode})
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={Number.isFinite(lat) ? lat : ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) onChange(val, lng);
                }}
                className="w-full px-2.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-[#8B0000]"
              />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={Number.isFinite(lng) ? lng : ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val)) onChange(lat, val);
                }}
                className="w-full px-2.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:border-[#8B0000]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
