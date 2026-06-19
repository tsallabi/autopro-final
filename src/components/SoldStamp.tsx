/**
 * SoldStamp — diagonal "تم البيع" overlay shown on top of any sold-car image.
 *
 * Pure SVG inside an absolutely-positioned wrapper so it scales with the
 * image container regardless of card size (marketplace card, details
 * gallery, search results, recently-delivered showcase). Semi-transparent
 * red ink, dashed inner ring, slight rotation — same visual language as
 * a physical "sold" stamp without obscuring the underlying car.
 *
 * Usage:
 *   <div className="relative ...">  // image container
 *     <img src={car.image} />
 *     <SoldStamp />
 *   </div>
 *
 * Or with the helper, mount it inside any container only when the car is
 * sold:
 *   <SoldStampIfSold status={car.status} />
 */
import React from 'react';

export interface SoldStampProps {
  /** Tailwind size keyword. Defaults to 'md' which fits 16:9/4:3 car cards. */
  size?: 'sm' | 'md' | 'lg';
  /** Rotation in degrees. -12 looks the most "stamped". */
  rotate?: number;
  /** Optional extra classes for the absolute wrapper. */
  className?: string;
}

const SIZE_MAP: Record<NonNullable<SoldStampProps['size']>, { box: number; outer: number; inner: number; title: number; sub: number }> = {
  sm: { box: 110, outer: 4,  inner: 2, title: 22, sub: 7 },
  md: { box: 160, outer: 5,  inner: 2, title: 32, sub: 9 },
  lg: { box: 240, outer: 7,  inner: 3, title: 48, sub: 12 },
};

export const SoldStamp: React.FC<SoldStampProps> = ({ size = 'md', rotate = -12, className = '' }) => {
  const s = SIZE_MAP[size];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center ${className}`}
      // Drop-shadow gives the stamp a hint of paper-press depth on bright photos.
      style={{ filter: 'drop-shadow(0 4px 12px rgba(220, 38, 38, 0.25))' }}
    >
      <svg
        viewBox="0 0 240 240"
        width={s.box}
        height={s.box}
        style={{ transform: `rotate(${rotate}deg)`, opacity: 0.78 }}
      >
        {/* Outer solid ring */}
        <circle
          cx="120" cy="120" r="110"
          fill="rgba(220, 38, 38, 0.06)"
          stroke="#dc2626"
          strokeWidth={s.outer}
        />
        {/* Inner dashed ring */}
        <circle
          cx="120" cy="120" r="92"
          fill="none"
          stroke="#dc2626"
          strokeWidth={s.inner}
          strokeDasharray="6 5"
          opacity="0.85"
        />
        {/* Slash lines top + bottom for the classic "rubber stamp" look */}
        <line x1="30"  y1="80"  x2="210" y2="60"  stroke="#dc2626" strokeWidth={s.inner} strokeLinecap="round" opacity="0.55" />
        <line x1="30"  y1="180" x2="210" y2="160" stroke="#dc2626" strokeWidth={s.inner} strokeLinecap="round" opacity="0.55" />
        {/* Tiny corner dots */}
        {[
          [70, 70], [170, 70], [70, 170], [170, 170],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2.4" fill="#dc2626" opacity="0.65" />
        ))}
        {/* "تم البيع" — primary line */}
        <text
          x="120" y="116"
          textAnchor="middle"
          fill="#dc2626"
          fontFamily="'Cairo','IBM Plex Sans Arabic','Tajawal',sans-serif"
          fontWeight="900"
          fontSize={s.title}
          letterSpacing="-1"
        >
          تم البيع
        </text>
        {/* "ليبيا أوتو برو" — subline (the brand watermark) */}
        <text
          x="120" y="148"
          textAnchor="middle"
          fill="#dc2626"
          fontFamily="'Cairo','IBM Plex Sans Arabic','Tajawal',sans-serif"
          fontWeight="800"
          fontSize={s.sub}
          letterSpacing="1.5"
          opacity="0.85"
        >
          ليبيا أوتو برو
        </text>
      </svg>
    </div>
  );
};

/**
 * Convenience: mount the stamp only when the car's status is in the
 * "finalized sold" family. Centralizes the status check so callers don't
 * have to remember every alias the schema uses.
 */
export const SoldStampIfSold: React.FC<SoldStampProps & { status?: string }> = ({ status, ...rest }) => {
  const SOLD_STATES = new Set(['sold', 'closed', 'release_issued', 'delivered_to_buyer']);
  if (!status || !SOLD_STATES.has(String(status))) return null;
  return <SoldStamp {...rest} />;
};

export default SoldStamp;
