// Shared helpers for the data build scripts.
import fs from 'node:fs/promises';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const OUT_DIR = path.join(ROOT, 'public', 'data');
export const CACHE_DIR = path.join(ROOT, '.cache');

// Simulated browser origin – a stream is only useful if a browser on another origin may read it.
export const ORIGIN = 'https://worldtv.vercel.app';
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export async function writeJson(name, data) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  await fs.writeFile(file, JSON.stringify(data));
  const { size } = await fs.stat(file);
  console.log(`wrote ${name} (${(size / 1024).toFixed(0)} KB)`);
}

export async function fetchJson(url, opts = {}, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } }, 90000);
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Run `fn` over `items` with bounded concurrency, printing progress. */
export async function pool(items, limit, fn, label = 'items') {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const started = Date.now();
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
      done++;
      if (done % 250 === 0 || done === items.length) {
        const secs = ((Date.now() - started) / 1000).toFixed(0);
        process.stdout.write(`\r  ${label}: ${done}/${items.length} (${secs}s)   `);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  process.stdout.write('\n');
  return results;
}

export function corsOk(res) {
  const acao = res.headers.get('access-control-allow-origin');
  return acao === '*' || acao === ORIGIN;
}
