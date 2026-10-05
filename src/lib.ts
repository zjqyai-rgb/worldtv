import { useEffect, useState } from 'react';
import { useStore } from './store';
import type { Channel, Dataset, Mode } from './types';

export const MODE_LABEL: Record<Mode, { one: string; many: string }> = {
  tv: { one: 'channel', many: 'channels' },
  radio: { one: 'station', many: 'stations' },
  webcam: { one: 'webcam', many: 'webcams' },
};

const FILE: Record<Mode, string> = { tv: 'tv', radio: 'radio', webcam: 'webcams' };
const inflight = new Map<Mode, Promise<Dataset>>();

export function loadDataset(mode: Mode): Promise<Dataset> {
  const s = useStore.getState();
  if (s.datasets[mode]) return Promise.resolve(s.datasets[mode]!);
  if (inflight.has(mode)) return inflight.get(mode)!;
  s.setLoading(mode, true);
  const p = fetch(`/data/${FILE[mode]}.json`)
    .then((r) => r.json() as Promise<Dataset>)
    .then((d) => {
      useStore.getState().setDataset(mode, d);
      return d;
    })
    .finally(() => {
      useStore.getState().setLoading(mode, false);
      inflight.delete(mode);
    });
  inflight.set(mode, p);
  return p;
}

export async function loadCountries() {
  const r = await fetch('/data/countries.json');
  useStore.getState().setCountries(await r.json());
}

/** Re-renders every `ms` so clocks stay fresh. */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function localTime(tz: string | null | undefined, now: Date) {
  if (!tz) return '';
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
    } catch {
      return '';
    }
    fmtCache.set(tz, f);
  }
  return f.format(now);
}

export function countBy(channels: Channel[], key: (c: Channel) => string | string[]) {
  const m = new Map<string, number>();
  for (const c of channels) {
    const k = key(c);
    for (const x of Array.isArray(k) ? k : [k]) m.set(x, (m.get(x) || 0) + 1);
  }
  return m;
}

export function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Stable pleasant hue per string, for logo fallbacks.
export function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function pickRandom<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 820px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export function shareUrl(mode: Mode, ch: Channel) {
  const u = new URL(window.location.origin);
  u.searchParams.set('m', mode);
  u.searchParams.set('c', ch.c);
  u.searchParams.set('ch', ch.id);
  return u.toString();
}
