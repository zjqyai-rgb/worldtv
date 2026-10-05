import { useState } from 'react';
import { hueOf, initials } from '../lib';
import type { Channel } from '../types';

export default function ChannelLogo({ ch, size = 40, thumb = false }: { ch: Channel; size?: number; thumb?: boolean }) {
  const [broken, setBroken] = useState(false);
  const hue = hueOf(ch.n);
  if (ch.l && !broken) {
    return (
      <img
        className={thumb ? 'thumb' : 'logo'}
        src={ch.l}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        style={thumb ? undefined : { width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={thumb ? 'thumb fallback' : 'logo fallback'}
      style={{
        ...(thumb ? {} : { width: size, height: size, fontSize: size * 0.36 }),
        background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 35%))`,
      }}
    >
      {initials(ch.n) || '•'}
    </div>
  );
}
