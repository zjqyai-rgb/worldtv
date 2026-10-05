import { memo, useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowLeft,
  Clock,
  Globe2,
  Heart,
  LayoutGrid,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { keyOf, useChannels, useStore } from '../store';
import { countBy, localTime, MODE_LABEL, useNow } from '../lib';
import ChannelLogo from './ChannelLogo';
import { categoryIcon } from './categoryIcons';
import VisitorCounter from './VisitorCounter';
import type { Channel, ChannelRef, Mode } from '../types';

export default function Sidebar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const country = useStore((s) => s.country);
  const category = useStore((s) => s.category);
  const mode = useStore((s) => s.mode);
  const loading = useStore((s) => s.loading[s.mode]);
  const open = useStore((s) => s.sidebarOpen);
  const setOpen = useStore((s) => s.setSidebarOpen);
  const favCount = useStore((s) => s.favorites.length);

  let body: React.ReactNode;
  if (loading) body = <SkeletonList />;
  else if (tab === 'countries') body = country ? <CountryView cc={country} /> : <CountryList />;
  else if (tab === 'categories') body = category ? <CategoryView id={category} /> : <CategoryGrid />;
  else if (tab === 'favorites') body = <RefList kind="favorites" />;
  else body = <RefList kind="recent" />;

  return (
    <aside className={`sidebar glass ${open ? 'open' : 'closed'} mode-${mode}`}>
      <div className="sheet-handle" onClick={() => setOpen(!open)} />
      <nav className="tabs">
        <TabBtn active={tab === 'countries'} onClick={() => setTab('countries')} icon={<Globe2 size={15} />} label="Countries" />
        <TabBtn active={tab === 'categories'} onClick={() => setTab('categories')} icon={<LayoutGrid size={15} />} label="Categories" />
        <TabBtn
          active={tab === 'favorites'}
          onClick={() => setTab('favorites')}
          icon={<Heart size={15} />}
          label="Favorites"
          badge={favCount || undefined}
        />
        <TabBtn active={tab === 'recent'} onClick={() => setTab('recent')} icon={<Clock size={15} />} label="Recent" />
      </nav>
      <div className="sidebar-body">{body}</div>
      <footer className="sidebar-foot">
        <VisitorCounter />
      </footer>
    </aside>
  );
}

function TabBtn(p: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button className={`tab ${p.active ? 'active' : ''}`} onClick={p.onClick}>
      {p.icon}
      <span>{p.label}</span>
      {p.badge ? <em>{p.badge}</em> : null}
    </button>
  );
}

function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="filter">
      <Search size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function CountryList() {
  const channels = useChannels();
  const countries = useStore((s) => s.countries);
  const mode = useStore((s) => s.mode);
  const selectCountry = useStore((s) => s.selectCountry);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'count' | 'az'>('count');
  const now = useNow(30000);
  const counts = useMemo(() => countBy(channels, (c) => c.c), [channels]);
  const dq = useDeferredValue(norm(q));

  const list = useMemo(() => {
    const rows = [...counts.entries()]
      .map(([cc, n]) => ({ cc, n, meta: countries[cc] }))
      .filter((r) => r.meta && (!dq || norm(r.meta.n).includes(dq) || r.cc.toLowerCase() === dq));
    rows.sort((a, b) => (sort === 'count' ? b.n - a.n : 0) || a.meta.n.localeCompare(b.meta.n));
    return rows;
  }, [counts, countries, dq, sort]);

  const label = MODE_LABEL[mode];
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Explore the world</h2>
          <p>
            {channels.length.toLocaleString()} live {label.many} · {counts.size} countries
          </p>
        </div>
        <button
          className="icon"
          title={sort === 'count' ? 'Sort A–Z' : 'Sort by most channels'}
          onClick={() => setSort(sort === 'count' ? 'az' : 'count')}
        >
          {sort === 'count' ? <ArrowDownWideNarrow size={17} /> : <ArrowDownAZ size={17} />}
        </button>
      </div>
      <FilterInput value={q} onChange={setQ} placeholder="Find a country…" />
      <ul className="list">
        {list.map(({ cc, n, meta }) => (
          <li key={cc}>
            <button className="row-btn" onClick={() => selectCountry(cc)}>
              <span className="flag">{meta.f}</span>
              <span className="grow">
                <b>{meta.n}</b>
                <small>{localTime(meta.tz, now)}</small>
              </span>
              <span className="count">{n}</span>
            </button>
          </li>
        ))}
        {!list.length && <Empty text="No countries match your search." />}
      </ul>
    </>
  );
}

function CountryView({ cc }: { cc: string }) {
  const all = useChannels();
  const meta = useStore((s) => s.countries[cc]);
  const mode = useStore((s) => s.mode);
  const ds = useStore((s) => s.datasets[s.mode]);
  const selectCountry = useStore((s) => s.selectCountry);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [az, setAz] = useState(false);
  const now = useNow(15000);
  const inCountry = useMemo(() => {
    const list = all.filter((c) => c.c === cc);
    return az ? list.sort((a, b) => a.n.localeCompare(b.n)) : list;
  }, [all, cc, az]);
  const cats = useMemo(() => [...countBy(inCountry, (c) => c.g).entries()].sort((a, b) => b[1] - a[1]), [inCountry]);
  const dq = useDeferredValue(norm(q));
  const list = useMemo(
    () => inCountry.filter((c) => (!cat || c.g.includes(cat)) && (!dq || norm(c.n).includes(dq))),
    [inCountry, cat, dq],
  );
  const catName = (id: string) => ds?.categories.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <div className="country-head">
        <button className="icon" onClick={() => selectCountry(null)} title="Back to all countries">
          <ArrowLeft size={18} />
        </button>
        <span className="flag big">{meta?.f}</span>
        <div className="grow">
          <h2>{meta?.n ?? cc}</h2>
          <p>
            {meta?.cap && (
              <>
                <MapPin size={12} /> {meta.cap} ·{' '}
              </>
            )}
            {localTime(meta?.tz, now)} · {inCountry.length} {MODE_LABEL[mode].many}
          </p>
        </div>
        <button className="icon" title={az ? 'Sort by popularity' : 'Sort A–Z'} onClick={() => setAz(!az)}>
          {az ? <ArrowDownAZ size={17} /> : <ArrowDownWideNarrow size={17} />}
        </button>
      </div>
      {cats.length > 1 && (
        <div className="chips">
          <button className={`chip ${!cat ? 'active' : ''}`} onClick={() => setCat(null)}>
            All <em>{inCountry.length}</em>
          </button>
          {cats.map(([id, n]) => (
            <button key={id} className={`chip ${cat === id ? 'active' : ''}`} onClick={() => setCat(cat === id ? null : id)}>
              {categoryIcon(id, 13)} {catName(id)} <em>{n}</em>
            </button>
          ))}
        </div>
      )}
      {inCountry.length > 12 && <FilterInput value={q} onChange={setQ} placeholder={`Search ${meta?.n ?? ''}…`} />}
      <ChannelList channels={list} mode={mode} />
    </>
  );
}

function CategoryGrid() {
  const channels = useChannels();
  const ds = useStore((s) => s.datasets[s.mode]);
  const selectCategory = useStore((s) => s.selectCategory);
  const counts = useMemo(() => countBy(channels, (c) => c.g), [channels]);
  const cats = (ds?.categories ?? []).filter((c) => counts.get(c.id)).sort((a, b) => counts.get(b.id)! - counts.get(a.id)!);
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Browse by category</h2>
          <p>Live from every corner of the planet</p>
        </div>
      </div>
      <div className="cat-grid">
        {cats.map((c) => (
          <button key={c.id} className="cat-card" onClick={() => selectCategory(c.id)} data-cat={c.id}>
            <span className="cat-icon">{categoryIcon(c.id, 20)}</span>
            <b>{c.name}</b>
            <small>{counts.get(c.id)?.toLocaleString()}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function CategoryView({ id }: { id: string }) {
  const all = useChannels();
  const mode = useStore((s) => s.mode);
  const ds = useStore((s) => s.datasets[s.mode]);
  const countries = useStore((s) => s.countries);
  const selectCategory = useStore((s) => s.selectCategory);
  const [q, setQ] = useState('');
  const [cc, setCc] = useState<string | null>(null);
  const dq = useDeferredValue(norm(q));
  const inCat = useMemo(() => all.filter((c) => c.g.includes(id)), [all, id]);
  const byCountry = useMemo(() => [...countBy(inCat, (c) => c.c).entries()].sort((a, b) => b[1] - a[1]), [inCat]);
  const list = useMemo(
    () => inCat.filter((c) => (!cc || c.c === cc) && (!dq || norm(c.n).includes(dq))),
    [inCat, cc, dq],
  );
  const name = ds?.categories.find((c) => c.id === id)?.name ?? id;
  return (
    <>
      <div className="country-head">
        <button className="icon" onClick={() => selectCategory(null)} title="All categories">
          <ArrowLeft size={18} />
        </button>
        <span className="cat-icon lg">{categoryIcon(id, 22)}</span>
        <div className="grow">
          <h2>{name}</h2>
          <p>
            {inCat.length.toLocaleString()} {MODE_LABEL[mode].many} · {byCountry.length} countries
          </p>
        </div>
      </div>
      <div className="chips">
        <button className={`chip ${!cc ? 'active' : ''}`} onClick={() => setCc(null)}>
          🌍 All
        </button>
        {byCountry.slice(0, 40).map(([c, n]) => (
          <button key={c} className={`chip ${cc === c ? 'active' : ''}`} onClick={() => setCc(cc === c ? null : c)}>
            {countries[c]?.f} {countries[c]?.n ?? c} <em>{n}</em>
          </button>
        ))}
      </div>
      <FilterInput value={q} onChange={setQ} placeholder={`Search ${name}…`} />
      <ChannelList channels={list} mode={mode} showCountry />
    </>
  );
}

function RefList({ kind }: { kind: 'favorites' | 'recent' }) {
  const refs = useStore((s) => s[kind]);
  const datasets = useStore((s) => s.datasets);
  const mode = useStore((s) => s.mode);
  const list = useMemo(() => resolveRefs(refs.filter((r) => r.mode === mode), datasets), [refs, datasets, mode]);
  const other = refs.filter((r) => r.mode !== mode).length;
  return (
    <>
      <div className="section-head">
        <div>
          <h2>{kind === 'favorites' ? 'Your favorites' : 'Recently played'}</h2>
          <p>
            {list.length} {MODE_LABEL[mode].many}
            {other ? ` · ${other} more in other modes` : ''}
          </p>
        </div>
      </div>
      {list.length ? (
        <ChannelList channels={list} mode={mode} showCountry />
      ) : (
        <Empty
          text={
            kind === 'favorites'
              ? 'Tap the ♥ on any channel to keep it here. Favorites are saved in this browser.'
              : 'Channels you watch will show up here.'
          }
        />
      )}
    </>
  );
}

function resolveRefs(refs: ChannelRef[], datasets: Partial<Record<Mode, { channels: Channel[] }>>) {
  const index = new Map<string, Channel>();
  for (const m of Object.keys(datasets) as Mode[]) for (const c of datasets[m]!.channels) index.set(keyOf(m, c.id), c);
  return refs.map((r) => index.get(keyOf(r.mode, r.id))).filter(Boolean) as Channel[];
}

const PAGE = 120;

export const ChannelList = memo(function ChannelList({
  channels,
  mode,
  showCountry,
}: {
  channels: Channel[];
  mode: Mode;
  showCountry?: boolean;
}) {
  const [limit, setLimit] = useState(PAGE);
  const play = useStore((s) => s.play);
  const playingId = useStore((s) => (s.playing?.mode === mode ? s.playing.channel.id : null));
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const countries = useStore((s) => s.countries);
  const favSet = useMemo(() => new Set(favorites.filter((f) => f.mode === mode).map((f) => f.id)), [favorites, mode]);
  const shown = channels.slice(0, limit);

  if (!channels.length) return <Empty text="Nothing here yet." />;

  if (mode === 'webcam') {
    return (
      <div className="cam-grid">
        {shown.map((c) => (
          <button
            key={c.id}
            className={`cam-card ${playingId === c.id ? 'playing' : ''}`}
            onClick={() => play(c, channels, mode)}
          >
            <ChannelLogo ch={c} thumb />
            <span className="live-pill">
              <i /> LIVE
            </span>
            <span
              className={`fav-btn ${favSet.has(c.id) ? 'on' : ''}`}
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(mode, c.id);
              }}
            >
              <Heart size={14} fill={favSet.has(c.id) ? 'currentColor' : 'none'} />
            </span>
            <span className="cam-info">
              <b>{c.n}</b>
              <small>
                {countries[c.c]?.f} {c.ci || countries[c.c]?.n}
              </small>
            </span>
          </button>
        ))}
        {channels.length > limit && (
          <button className="more-btn" onClick={() => setLimit(limit + PAGE)}>
            Show more ({channels.length - limit})
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="list channels">
      {shown.map((c) => {
        const active = playingId === c.id;
        const fav = favSet.has(c.id);
        return (
          <li key={c.id}>
            <button className={`row-btn ${active ? 'playing' : ''}`} onClick={() => play(c, channels, mode)}>
              <ChannelLogo ch={c} size={40} />
              <span className="grow">
                <b>{c.n}</b>
                <small>
                  {showCountry && (
                    <>
                      {countries[c.c]?.f} {countries[c.c]?.n} ·{' '}
                    </>
                  )}
                  {(mode === 'radio' ? c.t?.slice(0, 2) : c.g.filter((g) => g !== 'general').slice(0, 2))?.join(', ') ||
                    'General'}
                  {c.la?.length ? ` · ${c.la.slice(0, 2).join(', ').toUpperCase()}` : ''}
                </small>
              </span>
              {c.s[0]?.q && mode === 'tv' && parseInt(c.s[0].q) >= 720 && <span className="hd">HD</span>}
              {active && (
                <span className="eq small">
                  <i /><i /><i />
                </span>
              )}
              <span
                className={`fav-btn ${fav ? 'on' : ''}`}
                role="button"
                aria-label={fav ? 'Remove favorite' : 'Add favorite'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(mode, c.id);
                }}
              >
                <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
              </span>
            </button>
          </li>
        );
      })}
      {channels.length > limit && (
        <li>
          <button className="more-btn" onClick={() => setLimit(limit + PAGE)}>
            Show more ({channels.length - limit})
          </button>
        </li>
      )}
    </ul>
  );
});

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function SkeletonList() {
  return (
    <ul className="list">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="skeleton" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </ul>
  );
}
