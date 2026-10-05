import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel, ChannelRef, CountryMeta, Dataset, Mode, PlayerSize, SidebarTab } from './types';

const DEAD_TTL = 6 * 60 * 60 * 1000; // hide a channel that failed every source for 6 hours

export const keyOf = (mode: Mode, id: string) => `${mode}:${id}`;

interface Playing {
  mode: Mode;
  channel: Channel;
  queue: Channel[]; // list the channel was picked from, for next / previous
}

interface State {
  mode: Mode;
  datasets: Partial<Record<Mode, Dataset>>;
  loading: Partial<Record<Mode, boolean>>;
  countries: Record<string, CountryMeta>;
  country: string | null;
  category: string | null;
  tab: SidebarTab;
  playing: Playing | null;
  playerSize: PlayerSize;
  searchOpen: boolean;
  aboutOpen: boolean;
  sidebarOpen: boolean;
  // persisted
  favorites: ChannelRef[];
  recent: ChannelRef[];
  dead: Record<string, number>;
  volume: number;
  muted: boolean;

  setMode: (m: Mode) => void;
  setDataset: (m: Mode, d: Dataset) => void;
  setLoading: (m: Mode, v: boolean) => void;
  setCountries: (c: Record<string, CountryMeta>) => void;
  selectCountry: (c: string | null) => void;
  selectCategory: (c: string | null) => void;
  setTab: (t: SidebarTab) => void;
  play: (channel: Channel, queue: Channel[], mode?: Mode) => void;
  stop: () => void;
  setPlayerSize: (s: PlayerSize) => void;
  setSearchOpen: (v: boolean) => void;
  setAboutOpen: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  toggleFavorite: (mode: Mode, id: string) => void;
  markDead: (mode: Mode, id: string) => void;
  setVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      mode: 'tv',
      datasets: {},
      loading: {},
      countries: {},
      country: null,
      category: null,
      tab: 'countries',
      playing: null,
      playerSize: 'docked',
      searchOpen: false,
      aboutOpen: false,
      sidebarOpen: true,
      favorites: [],
      recent: [],
      dead: {},
      volume: 0.8,
      muted: false,

      setMode: (mode) => set({ mode, category: null }),
      setDataset: (m, d) => set((s) => ({ datasets: { ...s.datasets, [m]: d } })),
      setLoading: (m, v) => set((s) => ({ loading: { ...s.loading, [m]: v } })),
      setCountries: (countries) => set({ countries }),
      selectCountry: (country) => set({ country, category: null, tab: 'countries', sidebarOpen: true }),
      selectCategory: (category) => set({ category }),
      setTab: (tab) => set({ tab, sidebarOpen: true }),
      play: (channel, queue, mode) => {
        const m = mode ?? get().mode;
        const ref = { mode: m, id: channel.id };
        set((s) => ({
          playing: { mode: m, channel, queue },
          recent: [ref, ...s.recent.filter((r) => !(r.mode === m && r.id === channel.id))].slice(0, 40),
          playerSize: s.playerSize === 'mini' && window.innerWidth > 900 ? 'mini' : s.playerSize,
        }));
      },
      stop: () => set({ playing: null }),
      setPlayerSize: (playerSize) => set({ playerSize }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleFavorite: (mode, id) =>
        set((s) => {
          const has = s.favorites.some((f) => f.mode === mode && f.id === id);
          return {
            favorites: has
              ? s.favorites.filter((f) => !(f.mode === mode && f.id === id))
              : [{ mode, id }, ...s.favorites],
          };
        }),
      markDead: (mode, id) => set((s) => ({ dead: { ...s.dead, [keyOf(mode, id)]: Date.now() } })),
      setVolume: (volume) => set({ volume, muted: volume === 0 }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: 'worldtv',
      version: 1,
      partialize: (s) => ({
        favorites: s.favorites,
        recent: s.recent,
        dead: Object.fromEntries(Object.entries(s.dead).filter(([, t]) => Date.now() - t < DEAD_TTL)),
        volume: s.volume,
        muted: s.muted,
        mode: s.mode,
      }),
    },
  ),
);

export function isDead(dead: Record<string, number>, mode: Mode, id: string) {
  const t = dead[keyOf(mode, id)];
  return !!t && Date.now() - t < DEAD_TTL;
}

/** Channels of the active mode, minus ones that recently failed in this browser. */
export function useChannels(mode?: Mode): Channel[] {
  const m = useStore((s) => mode ?? s.mode);
  const ds = useStore((s) => s.datasets[m]);
  const dead = useStore((s) => s.dead);
  return useMemoChannels(ds, dead, m);
}

let memo: { ds?: Dataset; dead?: Record<string, number>; mode?: Mode; out: Channel[] }[] = [];
function useMemoChannels(ds: Dataset | undefined, dead: Record<string, number>, mode: Mode): Channel[] {
  if (!ds) return [];
  const hit = memo.find((x) => x.ds === ds && x.dead === dead && x.mode === mode);
  if (hit) return hit.out;
  const out = ds.channels.filter((c) => !isDead(dead, mode, c.id));
  memo = [{ ds, dead, mode, out }, ...memo].slice(0, 6);
  return out;
}
