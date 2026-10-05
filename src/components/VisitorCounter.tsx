import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

const COUNTED_KEY = 'worldtv:counted';
let cached: Promise<number | null> | null = null;

/** Counts this browser once (ever), then returns the site-wide unique-visitor total. */
function fetchVisitors(): Promise<number | null> {
  if (!cached) {
    const first = !localStorage.getItem(COUNTED_KEY);
    cached = fetch('/api/visitors', { method: first ? 'POST' : 'GET' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { visitors?: number } | null) => {
        if (d && typeof d.visitors === 'number') {
          if (first) localStorage.setItem(COUNTED_KEY, '1');
          return d.visitors;
        }
        return null;
      })
      .catch(() => null);
  }
  return cached;
}

export function useVisitors() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    fetchVisitors().then(setN);
  }, []);
  return n;
}

/** Small "12,345 visitors" badge; renders nothing until the count is available. */
export default function VisitorCounter() {
  const n = useVisitors();
  if (n === null) return null;
  return (
    <div className="visitor-counter" title="Unique visitors since launch">
      <Users size={13} />
      <span>
        <b>{n.toLocaleString()}</b> {n === 1 ? 'visitor' : 'visitors'}
      </span>
    </div>
  );
}
