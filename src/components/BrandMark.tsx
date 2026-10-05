// Ai.Alvin_daily brand mark, drawn with the official palette.
const SQUID_INK = '#1B2A3B';
const CAMEL = '#C69B64';
const ANTI_FLASH = '#F4F6F9';

export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="ai-badge" style={{ width: size * 1.3, height: size, background: ANTI_FLASH }}>
      <svg viewBox="0 0 104 72" width={size * 1.04} height={size * 0.72} aria-label="Ai.Alvin_daily" role="img">
        <defs>
          {/* The light face of the "A" carries a soft shade so it reads against the Anti-flash White badge. */}
          <linearGradient id="ai-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#D9DEE6" />
          </linearGradient>
        </defs>
        {/* "A" */}
        <polygon points="56,4 66,4 66,48 34,48" fill="url(#ai-face)" />
        <polygon points="14,48 40,4 56,4 34,48" fill={CAMEL} />
        <polygon points="0,72 14,48 34,48 20,72" fill={SQUID_INK} />
        <polygon points="42,72 54,48 66,48 66,72" fill={SQUID_INK} />
        {/* "i" */}
        <circle cx="85" cy="12" r="10" fill={CAMEL} />
        <polygon points="74,37 83,28 96,28 96,72 74,72" fill={SQUID_INK} />
      </svg>
    </span>
  );
}
