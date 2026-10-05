// Unique-visitor counter backed by Upstash Redis (provisioned through the Vercel Marketplace).
//   GET  /api/visitors -> { visitors }            read the current count
//   POST /api/visitors -> { visitors, counted }   count this browser (the client only POSTs once, ever)
// Raw IPs are never stored: a salted hash caps how often one network can bump the count.
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

const COUNT_KEY = 'worldtv:visitors';
const MAX_NEW_VISITORS_PER_IP_PER_DAY = 20; // generous for shared Wi-Fi, stops scripted inflation

function redis() {
  // The Vercel Upstash integration exposes KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function GET() {
  const db = redis();
  if (!db) return json({ error: 'counter not configured' }, 503);
  const visitors = Number((await db.get<number>(COUNT_KEY)) ?? 0);
  return json({ visitors });
}

export async function POST(request: Request) {
  const db = redis();
  if (!db) return json({ error: 'counter not configured' }, 503);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const salt = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const ipKey = `worldtv:ip:${createHash('sha256').update(salt + ip).digest('hex').slice(0, 32)}`;

  const fromThisIp = await db.incr(ipKey);
  if (fromThisIp === 1) await db.expire(ipKey, 60 * 60 * 24);
  if (fromThisIp > MAX_NEW_VISITORS_PER_IP_PER_DAY) {
    const visitors = Number((await db.get<number>(COUNT_KEY)) ?? 0);
    return json({ visitors, counted: false });
  }
  const visitors = await db.incr(COUNT_KEY);
  return json({ visitors, counted: true });
}
