// Builds public/data/tv.json from the iptv-org database, keeping ONLY streams that
// a browser can actually play: HTTPS end-to-end, CORS-enabled at every hop
// (master playlist -> variant playlist -> first media segment), no custom headers.
import { fetchJson, fetchWithTimeout, pool, corsOk, writeJson, ORIGIN, UA } from './lib.mjs';

const API = 'https://iptv-org.github.io/api';
const CONCURRENCY = Number(process.env.CONCURRENCY || 96);
const LIMIT = Number(process.env.LIMIT || 0); // debug: only check N streams

const QUALITY_RANK = (q) => (q ? parseInt(q, 10) || 0 : 0);

async function getText(url, extraHeaders = {}) {
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': UA, Origin: ORIGIN, ...extraHeaders } },
    9000,
  );
  return res;
}

function firstUri(playlist) {
  for (const raw of playlist.split('\n')) {
    const line = raw.trim();
    if (line && !line.startsWith('#')) return line;
  }
  return null;
}

/** Returns true when the HLS stream is playable from a browser on another origin. */
export async function checkHls(url) {
  if (!url.startsWith('https://')) return false;
  let res = await getText(url);
  if (!res.ok || !corsOk(res)) return false;
  let body = await res.text();
  if (!body.includes('#EXTM3U')) return false;
  let base = res.url || url;

  // Master playlist: follow the first variant.
  if (body.includes('#EXT-X-STREAM-INF')) {
    const lines = body.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
    const variant = lines.slice(idx + 1).find((l) => l.trim() && !l.startsWith('#'));
    if (!variant) return false;
    const vUrl = new URL(variant.trim(), base).href;
    if (!vUrl.startsWith('https://')) return false;
    res = await getText(vUrl);
    if (!res.ok || !corsOk(res)) return false;
    body = await res.text();
    if (!body.includes('#EXTM3U')) return false;
    base = res.url || vUrl;
  }

  // Media playlist: must contain segments, and the first segment must be fetchable.
  if (!body.includes('#EXTINF')) return false;
  const seg = firstUri(body);
  if (!seg) return false;
  const sUrl = new URL(seg, base).href;
  if (!sUrl.startsWith('https://')) return false;
  res = await getText(sUrl, { Range: 'bytes=0-2047' });
  if (!(res.ok || res.status === 206) || !corsOk(res)) return false;
  // Drain a little and close.
  try {
    await res.body?.cancel();
  } catch {}
  return true;
}

async function main() {
  console.log('Fetching iptv-org database…');
  const [channels, streams, countries, categories, logos, feeds, blocklist, guides] = await Promise.all(
    ['channels', 'streams', 'countries', 'categories', 'logos', 'feeds', 'blocklist', 'guides'].map((n) =>
      fetchJson(`${API}/${n}.json`),
    ),
  );

  const blocked = new Set(blocklist.map((b) => b.channel));
  const chanById = new Map();
  for (const c of channels) {
    if (c.is_nsfw || c.closed || blocked.has(c.id) || !c.country) continue;
    chanById.set(c.id, c);
  }

  const candidates = streams.filter(
    (s) =>
      s.channel &&
      chanById.has(s.channel) &&
      s.url.startsWith('https://') &&
      !s.user_agent &&
      !s.referrer &&
      !(s.labels || []).includes('Geo-blocked') &&
      /\.m3u8(\?|$)/i.test(s.url),
  );
  const toCheck = LIMIT ? candidates.slice(0, LIMIT) : candidates;
  console.log(`Checking ${toCheck.length} candidate streams (of ${streams.length})…`);

  const ok = await pool(toCheck, CONCURRENCY, (s) => checkHls(s.url), 'tv streams');
  const working = toCheck.filter((_, i) => ok[i]);
  console.log(`${working.length} streams verified working.`);

  // Logos: prefer the channel-level (feed-less) logo, largest first.
  const logoBy = new Map();
  for (const l of logos) {
    if (!l.url?.startsWith('https://')) continue;
    const prev = logoBy.get(l.channel);
    const score = (l.feed ? 0 : 1e6) + (l.width || 0);
    if (!prev || score > prev.score) logoBy.set(l.channel, { url: l.url, score });
  }
  const langBy = new Map();
  for (const f of feeds) if (f.is_main && f.languages?.length) langBy.set(f.channel, f.languages);

  const byChannel = new Map();
  for (const s of working) {
    const list = byChannel.get(s.channel) || [];
    if (!list.some((x) => x.u === s.url)) list.push({ u: s.url, q: s.quality || null, f: s.feed || null });
    byChannel.set(s.channel, list);
  }

  // Popularity proxy: how many EPG guides and stream mirrors the community maintains for a channel.
  const pop = new Map();
  for (const g of guides) if (g.channel) pop.set(g.channel, (pop.get(g.channel) || 0) + 1);
  for (const s of streams) if (s.channel) pop.set(s.channel, (pop.get(s.channel) || 0) + 2);

  const out = [];
  for (const [id, list] of byChannel) {
    const c = chanById.get(id);
    list.sort((a, b) => (a.f ? 1 : 0) - (b.f ? 1 : 0) || QUALITY_RANK(b.q) - QUALITY_RANK(a.q));
    out.push({
      id,
      n: c.name,
      c: c.country === 'UK' ? 'GB' : c.country, // iptv-org uses UK instead of ISO GB
      g: c.categories?.length ? c.categories : ['general'],
      l: logoBy.get(id)?.url || null,
      la: langBy.get(id) || [],
      w: c.website || null,
      s: list.slice(0, 4).map(({ u, q }) => (q ? { u, q } : { u })),
      r: (pop.get(id) || 0) + (logoBy.has(id) ? 1 : 0),
    });
  }
  out.sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));

  const usedCats = new Set(out.flatMap((c) => c.g));
  await writeJson('tv.json', {
    updated: new Date().toISOString(),
    categories: categories.filter((c) => usedCats.has(c.id)).map(({ id, name }) => ({ id, name })),
    countries: Object.fromEntries(countries.map((c) => [c.code, { n: c.name, f: c.flag }])),
    channels: out,
  });
  console.log(`${out.length} channels across ${new Set(out.map((c) => c.c)).size} countries.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
