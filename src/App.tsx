import { lazy, Suspense, useEffect, useRef } from 'react';
import { useStore } from './store';
import { loadCountries, loadDataset } from './lib';
import TopBar, { useRandom } from './components/TopBar';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import RadioBar from './components/RadioBar';
import SearchPalette from './components/SearchPalette';
import About from './components/About';
import type { Mode } from './types';

const WorldGlobe = lazy(() => import('./components/WorldGlobe'));
const MODES: Mode[] = ['tv', 'radio', 'webcam'];

export default function App() {
  const mode = useStore((s) => s.mode);
  const country = useStore((s) => s.country);
  const playing = useStore((s) => s.playing);
  const playerSize = useStore((s) => s.playerSize);
  const random = useRandom();
  const booted = useRef(false);

  // Boot: countries + deep link (?m=tv&c=US&ch=CNN.us).
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(location.search);
    const m = params.get('m') as Mode | null;
    const s = useStore.getState();
    if (m && MODES.includes(m)) s.setMode(m);
    loadCountries();
    const cc = params.get('c');
    if (cc) s.selectCountry(cc.toUpperCase());
    const ch = params.get('ch');
    loadDataset(useStore.getState().mode).then((d) => {
      if (!ch) return;
      const c = d.channels.find((x) => x.id === ch);
      if (c) useStore.getState().play(c, d.channels.filter((x) => x.c === c.c));
    });
  }, []);

  useEffect(() => {
    loadDataset(mode);
    // Datasets for favorites / recent in other modes load quietly in the background.
    const t = setTimeout(() => MODES.forEach((m) => m !== mode && loadDataset(m)), 4000);
    return () => clearTimeout(t);
  }, [mode]);

  // Keep the URL shareable.
  useEffect(() => {
    if (!booted.current) return;
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('m', mode);
    if (country) u.searchParams.set('c', country);
    if (playing && playing.mode === mode) {
      u.searchParams.set('ch', playing.channel.id);
      u.searchParams.set('c', playing.channel.c);
    }
    history.replaceState(null, '', u);
    document.title = playing ? `${playing.channel.n} · WorldTV` : 'WorldTV · Live TV, radio & webcams from every country';
  }, [mode, country, playing]);

  // Global shortcuts.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setSearchOpen(!s.searchOpen);
        return;
      }
      if ((e.target as HTMLElement)?.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        s.setSearchOpen(true);
      } else if (e.key === 'Escape') {
        if (s.searchOpen) s.setSearchOpen(false);
        else if (s.aboutOpen) s.setAboutOpen(false);
        else if (s.playerSize === 'theater') s.setPlayerSize('docked');
        else if (s.category) s.selectCategory(null);
        else if (s.country) s.selectCountry(null);
      } else if (e.key === 'r') random();
      else if (e.key === '1' || e.key === '2' || e.key === '3') s.setMode(MODES[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [random]);

  const videoOpen = playing && playing.mode !== 'radio';
  return (
    <div
      className={`app mode-${mode} ${videoOpen ? `has-player player-${playerSize}` : ''} ${
        playing?.mode === 'radio' ? 'has-radio' : ''
      }`}
    >
      <Suspense fallback={<div className="globe-loading"><div className="spinner" /></div>}>
        <WorldGlobe />
      </Suspense>
      <div className="vignette" />
      <TopBar />
      <Sidebar />
      <Player />
      <RadioBar />
      <SearchPalette />
      <About />
    </div>
  );
}
