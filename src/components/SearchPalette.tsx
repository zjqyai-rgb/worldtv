import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useChannels, useStore } from '../store';
import { countBy, MODE_LABEL } from '../lib';
import ChannelLogo from './ChannelLogo';
import type { Channel } from '../types';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

type Result = { kind: 'country'; cc: string; n: number } | { kind: 'channel'; ch: Channel };

export default function SearchPalette() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  if (!open) return null;
  return <Palette close={() => setOpen(false)} />;
}

function Palette({ close }: { close: () => void }) {
  const channels = useChannels();
  const mode = useStore((s) => s.mode);
  const countries = useStore((s) => s.countries);
  const selectCountry = useStore((s) => s.selectCountry);
  const play = useStore((s) => s.play);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const counts = useMemo(() => countBy(channels, (c) => c.c), [channels]);

  const results: Result[] = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) {
      // Suggestions: the biggest countries.
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cc, n]) => ({ kind: 'country' as const, cc, n }));
    }
    const cs: Result[] = [...counts.entries()]
      .filter(([cc]) => countries[cc] && norm(countries[cc].n).includes(nq))
      .slice(0, 5)
      .map(([cc, n]) => ({ kind: 'country', cc, n }));
    const starts: Channel[] = [];
    const contains: Channel[] = [];
    for (const c of channels) {
      const n = norm(c.n);
      if (n.startsWith(nq)) starts.push(c);
      else if (n.includes(nq) || c.g.some((g) => g === nq) || c.t?.some((t) => norm(t) === nq) || (c.ci && norm(c.ci).includes(nq)))
        contains.push(c);
      if (starts.length > 60) break;
    }
    return [...cs, ...[...starts, ...contains].slice(0, 60).map((ch) => ({ kind: 'channel' as const, ch }))];
  }, [q, channels, counts, countries]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (r: Result) => {
    if (r.kind === 'country') selectCountry(r.cc);
    else {
      const queue = results.filter((x) => x.kind === 'channel').map((x) => (x as { ch: Channel }).ch);
      play(r.ch, queue.length > 1 ? queue : channels.filter((c) => c.c === r.ch.c));
    }
    close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="palette glass" onMouseDown={(e) => e.stopPropagation()}>
        <label className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${channels.length.toLocaleString()} ${MODE_LABEL[mode].many} and countries…`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
              else if (e.key === 'Escape') close();
            }}
          />
          <kbd>esc</kbd>
        </label>
        {!q && <div className="palette-hint">Top countries</div>}
        <ul ref={listRef} className="palette-list">
          {results.map((r, i) => (
            <li key={r.kind === 'country' ? `c-${r.cc}` : `h-${r.ch.id}`}>
              <button className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => choose(r)}>
                {r.kind === 'country' ? (
                  <>
                    <span className="flag">{countries[r.cc]?.f}</span>
                    <span className="grow">
                      <b>{countries[r.cc]?.n}</b>
                      <small>Country · {r.n} {MODE_LABEL[mode].many}</small>
                    </span>
                  </>
                ) : (
                  <>
                    <ChannelLogo ch={r.ch} size={32} />
                    <span className="grow">
                      <b>{r.ch.n}</b>
                      <small>
                        {countries[r.ch.c]?.f} {r.ch.ci || countries[r.ch.c]?.n} · {r.ch.g.join(', ')}
                      </small>
                    </span>
                  </>
                )}
                {i === sel && <CornerDownLeft size={14} className="enter" />}
              </button>
            </li>
          ))}
          {q && !results.length && <li className="empty">No matches for “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
