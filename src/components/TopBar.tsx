import { Camera, Dices, Info, Radio, Search, Tv } from 'lucide-react';
import { useChannels, useStore } from '../store';
import { pickRandom } from '../lib';
import type { Mode } from '../types';
import BrandMark from './BrandMark';

const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: 'tv', label: 'TV', icon: <Tv size={15} /> },
  { id: 'radio', label: 'Radio', icon: <Radio size={15} /> },
  { id: 'webcam', label: 'Webcams', icon: <Camera size={15} /> },
];

export function useRandom() {
  const channels = useChannels();
  const play = useStore((s) => s.play);
  const selectCountry = useStore((s) => s.selectCountry);
  return () => {
    const c = pickRandom(channels);
    if (!c) return;
    selectCountry(c.c);
    play(c, channels.filter((x) => x.c === c.c));
  };
}

export default function TopBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const selectCountry = useStore((s) => s.selectCountry);
  const random = useRandom();
  const isMac = navigator.platform.toLowerCase().includes('mac');

  return (
    <header className="topbar">
      <button className="brand" onClick={() => selectCountry(null)} title="Home">
        <BrandMark />
        <span className="brand-text">
          World<b>TV</b>
        </span>
      </button>

      <div className="mode-switch glass" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={mode === m.id ? 'active' : ''}
            onClick={() => setMode(m.id)}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
        <span className="mode-glider" style={{ transform: `translateX(${MODES.findIndex((m) => m.id === mode) * 100}%)` }} />
      </div>

      <div className="top-actions">
        <button className="search-btn glass" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          <span>Search</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button className="icon glass round" title="Surprise me (R)" onClick={random}>
          <Dices size={18} />
        </button>
        <button className="icon glass round" title="About" onClick={() => setAboutOpen(true)}>
          <Info size={18} />
        </button>
      </div>
    </header>
  );
}
