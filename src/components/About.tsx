import { ShieldCheck, X } from 'lucide-react';
import { useStore } from '../store';
import { useVisitors } from './VisitorCounter';

export default function About() {
  const open = useStore((s) => s.aboutOpen);
  const setOpen = useStore((s) => s.setAboutOpen);
  const datasets = useStore((s) => s.datasets);
  const visitors = useVisitors();
  if (!open) return null;
  const updated = datasets.tv?.updated || datasets.radio?.updated || datasets.webcam?.updated;
  const stat = (n?: number) => (n ? n.toLocaleString() : '—');

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="about glass" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon close" onClick={() => setOpen(false)}>
          <X size={18} />
        </button>
        <h2>
          World<b>TV</b>
        </h2>
        <p className="lead">
          Free live TV, radio and webcams from around the world, all in one place. Spin the globe, pick a country, and
          press play. You don't need an account and there are no paywalls.
        </p>
        <div className="stats">
          <div>
            <b>{stat(datasets.tv?.channels.length)}</b>
            <small>TV channels</small>
          </div>
          <div>
            <b>{stat(datasets.radio?.channels.length)}</b>
            <small>Radio stations</small>
          </div>
          <div>
            <b>{stat(datasets.webcam?.channels.length)}</b>
            <small>Live webcams</small>
          </div>
        </div>
        {visitors !== null && (
          <p className="about-visitors">
            🌍 <b>{visitors.toLocaleString()}</b> people have visited WorldTV so far
          </p>
        )}
        <div className="verified">
          <ShieldCheck size={18} />
          <span>
            Every stream is tested automatically before it's listed: it must load over HTTPS and play in a browser. If a
            stream goes down later, the player switches to a backup source or skips to the next channel by itself.
            {updated && <> Last checked {new Date(updated).toLocaleString()}.</>}
          </span>
        </div>
        <h3>Keyboard shortcuts</h3>
        <ul className="keys">
          <li><kbd>⌘/Ctrl K</kbd> Search</li>
          <li><kbd>R</kbd> Random channel</li>
          <li><kbd>N</kbd>/<kbd>P</kbd> Next / previous</li>
          <li><kbd>F</kbd> Fullscreen</li>
          <li><kbd>T</kbd> Theater mode</li>
          <li><kbd>M</kbd> Mute</li>
          <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> TV / Radio / Webcams</li>
          <li><kbd>Esc</kbd> Back</li>
        </ul>
        <h3>Sources</h3>
        <p className="small">
          TV listings come from the community-maintained{' '}
          <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">iptv-org</a> database, radio from{' '}
          <a href="https://www.radio-browser.info" target="_blank" rel="noreferrer">radio-browser.info</a>, and webcams are
          public YouTube live streams. WorldTV doesn't host or re-stream anything. It only links to streams their owners
          already make publicly available. Rights holders can ask for a removal through the upstream projects.
        </p>
      </div>
    </div>
  );
}
