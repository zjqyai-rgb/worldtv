// Builds public/data/radio.json from radio-browser.info, keeping only HTTPS stations
// whose stream actually answers with audio right now.
import { fetchJson, fetchWithTimeout, pool, writeJson, UA, TIMEOUT_SCALE, fail, failFromError, printFailures } from './lib.mjs';
import { checkHls } from './build-tv.mjs';

const PER_COUNTRY = Number(process.env.PER_COUNTRY || 150);
const CONCURRENCY = Number(process.env.CONCURRENCY || 96);

export const GENRES = [
  { id: 'news', name: 'News', tags: ['news', 'noticias', 'nachrichten', 'info', 'actualité'] },
  { id: 'talk', name: 'Talk', tags: ['talk', 'public radio', 'culture', 'spoken', 'podcast'] },
  { id: 'pop', name: 'Pop', tags: ['pop', 'top 40', 'hits', 'charts', 'kpop', 'j-pop'] },
  { id: 'rock', name: 'Rock', tags: ['rock', 'metal', 'alternative', 'indie', 'punk'] },
  { id: 'dance', name: 'Dance & Electronic', tags: ['dance', 'electronic', 'house', 'techno', 'trance', 'edm'] },
  { id: 'jazz', name: 'Jazz & Blues', tags: ['jazz', 'blues', 'soul', 'funk'] },
  { id: 'classical', name: 'Classical', tags: ['classical', 'klassik', 'opera', 'orchestra'] },
  { id: 'hiphop', name: 'Hip-Hop & R&B', tags: ['hip hop', 'hiphop', 'rap', 'rnb', 'r&b', 'urban'] },
  { id: 'chill', name: 'Chill & Lounge', tags: ['chill', 'lounge', 'ambient', 'relax', 'lofi', 'easy listening'] },
  { id: 'oldies', name: 'Oldies & Retro', tags: ['oldies', '80s', '70s', '60s', '90s', 'retro', 'classic hits'] },
  { id: 'latin', name: 'Latin', tags: ['latin', 'salsa', 'reggaeton', 'bachata', 'cumbia', 'latino'] },
  { id: 'country', name: 'Country & Folk', tags: ['country', 'folk', 'bluegrass', 'americana'] },
  { id: 'world', name: 'World & Traditional', tags: ['world', 'traditional', 'ethnic', 'reggae', 'afro', 'bollywood'] },
  { id: 'sports', name: 'Sports', tags: ['sport', 'sports', 'football', 'deportes'] },
  { id: 'religious', name: 'Religious', tags: ['religious', 'christian', 'gospel', 'islam', 'quran', 'catholic'] },
];

function genresFor(tagString) {
  const tags = tagString.toLowerCase();
  const g = GENRES.filter((genre) => genre.tags.some((t) => tags.includes(t))).map((x) => x.id);
  return g.length ? g.slice(0, 3) : ['music'];
}

async function checkAudio(url, isHls) {
  if (!url.startsWith('https://')) return fail('audio:not-https');
  if (isHls || /\.m3u8(\?|$)/i.test(url)) return checkHls(url);
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Icy-MetaData': '0' } }, 8000 * TIMEOUT_SCALE);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const ok = res.ok && /audio|ogg|aac|mpeg|octet-stream/.test(type) && !type.includes('mpegurl');
  if (ok) {
    // Make sure bytes actually flow.
    const reader = res.body.getReader();
    const { value } = await Promise.race([
      reader.read(),
      new Promise((r) => setTimeout(() => r({ value: null }), 5000 * TIMEOUT_SCALE)),
    ]);
    reader.cancel().catch(() => {});
    return value?.length ? true : fail('audio:no-bytes');
  }
  res.body?.cancel().catch(() => {});
  return fail(res.ok ? `audio:wrong-type(${type.split(';')[0] || 'none'})` : `audio:http-${res.status}`);
}

async function main() {
  const servers = await fetchJson('https://all.api.radio-browser.info/json/servers').catch(() => []);
  const host = servers[0]?.name || 'de1.api.radio-browser.info';
  console.log(`Using ${host}`);
  const stations = await fetchJson(
    `https://${host}/json/stations/search?lastcheckok=1&is_https=true&hidebroken=true&order=votes&reverse=true&limit=200000`,
  );
  console.log(`${stations.length} stations listed.`);

  const perCountry = new Map();
  const seen = new Set();
  for (const s of stations) {
    const cc = (s.countrycode || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc) || !s.url_resolved?.startsWith('https://')) continue;
    const key = `${cc}:${s.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = perCountry.get(cc) || [];
    if (list.length < PER_COUNTRY) list.push(s);
    perCountry.set(cc, list);
  }
  const candidates = [...perCountry.values()].flat();
  console.log(`Checking ${candidates.length} stations…`);
  const ok = await pool(candidates, CONCURRENCY, (s) => checkAudio(s.url_resolved, s.hls === 1).catch((e) => failFromError('audio', e)), 'radio');
  printFailures();
  const working = candidates.filter((_, i) => ok[i]);

  const out = working.map((s) => ({
    id: s.stationuuid,
    n: s.name.trim(),
    c: s.countrycode.toUpperCase(),
    g: genresFor(s.tags || ''),
    l: s.favicon?.startsWith('https://') ? s.favicon : null,
    la: (s.language || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 2),
    w: s.homepage || null,
    s: [{ u: s.url_resolved, q: s.bitrate ? `${s.bitrate}kbps` : undefined, h: s.hls === 1 ? 1 : undefined }],
    t: (s.tags || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4),
  }));

  const used = new Set(out.flatMap((s) => s.g));
  await writeJson('radio.json', {
    updated: new Date().toISOString(),
    categories: [...GENRES, { id: 'music', name: 'Music (mixed)' }]
      .filter((g) => used.has(g.id))
      .map(({ id, name }) => ({ id, name })),
    channels: out,
  });
  console.log(`${out.length} stations verified across ${new Set(out.map((s) => s.c)).size} countries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
