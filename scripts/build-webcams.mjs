// Builds public/data/webcams.json: 24/7 live webcams on YouTube that are LIVE right now
// and allow embedding (verified via oEmbed). Each cam is geolocated from its title.
import { createRequire } from 'node:module';
const countries = createRequire(import.meta.url)('world-countries');
import { fetchWithTimeout, pool, writeJson, UA } from './lib.mjs';
import { CITIES, US_STATES } from './gazetteer.mjs';

const YT_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1; SOCS=CAI' };
const LIVE_FILTER = 'EgJAAQ%253D%253D';

// Dedicated 24/7 webcam channels: [handle, defaultCountry]
const CHANNELS = [
  ['@earthcam', 'US'], ['@SkylineWebcams', 'IT'], ['@exploreorg', 'US'], ['@VirtualRailfan', 'US'],
  ['@africam', 'ZA'], ['@cornelllabbirdcams', 'US'], ['@MontereyBayAquarium', 'US'], ['@webcamtaxi', null],
  ['@teleportcamera', null], ['@EarthNow_', null], ['@earthTV', null], ['@IloveyouVenice', 'IT'],
  ['@NamibiaWildlifeResorts', 'NA'], ['@nasa', 'XS'], ['@StaticMediaLive', null], ['@ipcamlive', null],
  ['@RealSamuiWebcam', 'TH'], ['@WebcamsdeMexico', 'MX'], ['@seejapan', 'JP'], 
  ['@LiveJapanCamera', 'JP'], ['@ODAIBATOKYOLIVE', 'JP'], ['@CamsCanada', 'CA'], ['@NiagaraFallsLive', 'CA'],
  ['@AtlanticCityLive', 'US'], ['@DuvalCam', 'US'], ['@RailCamNL', 'NL'], ['@IcelandLive', 'IS'],
  ['@mblis', 'IS'], ['@AfarTV', null], ['@GOPRO', null], ['@DecorahEagles', 'US'], ['@LiveFromSea', null],
];

const SEARCH_COUNTRIES = [
  'United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Cuba', 'Jamaica',
  'United Kingdom', 'Ireland', 'France', 'Spain', 'Portugal', 'Italy', 'Germany', 'Netherlands', 'Belgium',
  'Switzerland', 'Austria', 'Czech Republic', 'Poland', 'Hungary', 'Croatia', 'Greece', 'Turkey', 'Norway', 'Sweden',
  'Finland', 'Denmark', 'Iceland', 'Ukraine', 'Russia', 'Georgia', 'Israel', 'United Arab Emirates', 'Saudi Arabia',
  'Egypt', 'Morocco', 'Kenya', 'South Africa', 'Namibia', 'Tanzania', 'India', 'Nepal', 'Thailand', 'Vietnam',
  'Malaysia', 'Singapore', 'Indonesia', 'Philippines', 'China', 'Hong Kong', 'Taiwan', 'South Korea', 'Japan',
  'Australia', 'New Zealand', 'Malta', 'Cyprus', 'Romania', 'Bulgaria', 'Serbia', 'Slovenia', 'Estonia', 'Latvia',
  'Lithuania', 'Costa Rica', 'Panama', 'Dominican Republic', 'Bahamas', 'Puerto Rico', 'Maldives', 'Sri Lanka',
];
const TOPIC_QUERIES = [
  ['live wildlife cam 24/7', null], ['live bird nest cam', null], ['live aquarium cam', null], ['live beach cam', null],
  ['live airport cam planespotting', null], ['live train cam railfan', null], ['live volcano cam', null],
  ['ISS live earth from space', 'XS'], ['live northern lights cam', null], ['live harbor port cam ships', null],
  ['live ski resort webcam', null], ['live safari waterhole cam', null], ['live city walk 24/7 cam', null],
];

const countryByName = [];
for (const c of countries) {
  const names = new Set([c.name.common, c.name.official, ...c.altSpellings.filter((a) => a.length > 3)]);
  for (const n of names) countryByName.push([n, c.cca2]);
}
countryByName.push(['England', 'GB'], ['Scotland', 'GB'], ['Wales', 'GB'], ['UK', 'GB'], ['Holland', 'NL']);
countryByName.sort((a, b) => b[0].length - a[0].length);
const cc2latlng = Object.fromEntries(countries.map((c) => [c.cca2, c.latlng]));
const nameToCc = Object.fromEntries(countries.map((c) => [c.name.common, c.cca2]));
nameToCc['Czech Republic'] = 'CZ';
nameToCc['Hong Kong'] = 'HK';

const wordRe = (s) => new RegExp(`(^|[^\\p{L}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');
const cityMatchers = CITIES.flatMap(([name, cc, lat, lng, ...aliases]) =>
  [name, ...aliases].map((a) => ({ re: /^[\x00-\x7f]+$/.test(a) ? wordRe(a) : new RegExp(a), city: name, cc, lat, lng })),
);
const countryMatchers = countryByName.map(([n, cc]) => ({ re: wordRe(n), cc }));
const usMatchers = US_STATES.map((s) => (s.startsWith(',') ? new RegExp(s.replace(/[.]/g, '\\.') + '\\b') : wordRe(s)));

function locateIn(text) {
  // Prefer the place mentioned first in the text (e.g. "Seattle, Washington, USA" -> Seattle).
  let best = null;
  for (const m of cityMatchers) {
    const r = m.re.exec(text);
    if (r && (!best || r.index < best.index)) best = { index: r.index, cc: m.cc, city: m.city, lat: m.lat, lng: m.lng };
  }
  if (best) return best;
  for (const m of countryMatchers) if (m.re.test(text)) return { cc: m.cc };
  if (usMatchers.some((r) => r.test(text))) return { cc: 'US' };
  return null;
}

function locate(title, extra, fallbackCc) {
  return locateIn(title) || (extra && locateIn(extra)) || (fallbackCc ? { cc: fallbackCc } : null);
}

const CATS = [
  ['space', /\b(iss|space station|from space|nasa|telescope|aurora|northern lights|night sky|meteor)\b/i],
  ['wildlife', /\b(wildlife|animal|bird|birds|bear|bears|eagle|nest|safari|waterhole|zoo|aquarium|panda|giraffe|feeder|penguin|otter|elephant|shark|reef|kitten|puppy|dog|cat cam|owl|osprey|falcon)\b/i],
  ['transport', /\b(train|trains|rail|railfan|railcam|airport|planespotting|runway|station|traffic|highway|ships?|ferry|port of|canal)\b|駅/i],
  ['nature', /\b(mountain|ski|volcano|alps|fuji|snow|glacier|lake|waterfall|falls|forest|river|national park|matterhorn|etna|vesuvius)\b|富士山/i],
  ['beach', /\b(beach|coast|bay|harbor|harbour|marina|ocean|sea|surf|island|pier|playa|spiaggia|praia)\b/i],
  ['city', /./],
];
const categoryFor = (t) => CATS.find(([, re]) => re.test(t))[0];

const isCamTitle = (t, trusted = false) =>
  (trusted || /(cam\b|cams\b|camera|webcam|live ?view|ライブカメラ|live 24\/7|24\/7 live|livestream|earth from space|live stream)/i.test(t)) &&
  !/\b(news|music|radio|gameplay|gaming|podcast|sermon|church service|lofi girl|beats to|asmr|trading|crypto|bitcoin|forex|chat)\b/i.test(t.replace(/news dig/i, ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// YouTube throttles bursts, so go slowly and retry with backoff.
async function ytInitialData(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(800 + Math.random() * 700 + attempt * 4000);
    const res = await fetchWithTimeout(url, { headers: YT_HEADERS }, 20000).catch(() => null);
    if (res?.status === 404) return null;
    if (!res?.ok) continue;
    const html = await res.text();
    const m = html.match(/ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
    if (m) return JSON.parse(m[1]);
  }
  return null;
}

function collectVideos(data) {
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      const s = JSON.stringify(v);
      out.push({
        id: v.videoId,
        title: v.title?.runs?.map((r) => r.text).join('') || '',
        owner: v.ownerText?.runs?.[0]?.text || '',
        snippet: (v.detailedMetadataSnippets?.[0]?.snippetText?.runs || []).map((r) => r.text).join(''),
        live: s.includes('BADGE_STYLE_TYPE_LIVE_NOW') || s.includes('"style":"LIVE"'),
      });
    }
    if (o.lockupViewModel) {
      const l = o.lockupViewModel;
      const s = JSON.stringify(l);
      out.push({
        id: l.contentId,
        title: l.metadata?.lockupMetadataViewModel?.title?.content || '',
        owner: '',
        live: s.includes('THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE') || s.includes('BADGE_STYLE_LIVE'),
      });
    }
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return out.filter((v) => v.id && v.live);
}

async function embeddable(id) {
  const res = await fetchWithTimeout(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    { headers: { 'User-Agent': UA } },
    10000,
  );
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const jobs = [
    ...CHANNELS.map(([h, cc]) => ({ url: `https://www.youtube.com/${h}/streams`, cc, source: h, trusted: true })),
    ...SEARCH_COUNTRIES.map((n) => ({
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`live webcam ${n}`)}&sp=${LIVE_FILTER}`,
      cc: nameToCc[n] || countryByName.find(([x]) => x === n)?.[1],
      source: `search:${n}`,
    })),
    ...TOPIC_QUERIES.map(([q, cc]) => ({
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${LIVE_FILTER}`,
      cc,
      source: `topic:${q}`,
    })),
  ];
  console.log(`Scanning ${jobs.length} YouTube sources…`);
  const found = new Map();
  await pool(jobs, 2, async (job) => {
    const data = await ytInitialData(job.url).catch(() => null);
    const vids = data ? collectVideos(data) : [];
    if (process.env.DEBUG) console.log(`\n${job.source}: ${data ? vids.length + ' live' : 'NO DATA'}`);
    for (const v of vids) {
      if (found.has(v.id)) continue;
      if (!isCamTitle(v.title, job.trusted)) continue;
      // Search results: only trust the query country when the title names no other place.
      if (/members[- ]only/i.test(v.title)) continue;
      const loc = locate(v.title, v.snippet, job.cc);
      if (!loc) continue;
      found.set(v.id, { ...v, loc, source: job.source });
    }
  }, 'sources');

  const list = [...found.values()];
  console.log(`Verifying ${list.length} live candidates are embeddable…`);
  const meta = await pool(list, 12, (v) => embeddable(v.id), 'oembed');

  const out = [];
  list.forEach((v, i) => {
    const m = meta[i];
    if (!m) return;
    const { cc, city, lat, lng } = v.loc;
    const base = cc === 'XS' ? [0, 0] : cc2latlng[cc];
    if (!base) return;
    // Jitter cams without a known city around the country centroid so they don't stack.
    const jitter = () => (Math.random() - 0.5) * 2;
    out.push({
      id: v.id,
      n: v.title.replace(/\s+/g, ' ').trim().slice(0, 120),
      c: cc,
      g: [categoryFor(v.title)],
      l: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      o: m.author_name,
      ci: city || null,
      p: lat != null ? [lat, lng] : [base[0] + jitter(), base[1] + jitter()],
      s: [{ u: `yt:${v.id}` }],
    });
  });

  await writeJson('webcams.json', {
    updated: new Date().toISOString(),
    categories: [
      { id: 'city', name: 'Cities & Streets' }, { id: 'beach', name: 'Beaches & Coast' },
      { id: 'nature', name: 'Mountains & Nature' }, { id: 'wildlife', name: 'Wildlife & Animals' },
      { id: 'transport', name: 'Trains, Planes & Ports' }, { id: 'space', name: 'Space & Sky' },
    ].filter((c) => out.some((w) => w.g.includes(c.id))),
    channels: out,
  });
  console.log(`${out.length} live webcams across ${new Set(out.map((w) => w.c)).size} countries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
