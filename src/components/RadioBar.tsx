import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Heart, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { useStore } from '../store';
import { shareUrl } from '../lib';
import ChannelLogo from './ChannelLogo';
import { step, useHlsSources } from './Player';
import type { Channel } from '../types';

export default function RadioBar() {
  const playing = useStore((s) => s.playing);
  if (!playing || playing.mode !== 'radio') return null;
  return <Radio channel={playing.channel} />;
}

function Radio({ channel }: { channel: Channel }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const countries = useStore((s) => s.countries);
  const stop = useStore((s) => s.stop);
  const markDead = useStore((s) => s.markDead);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const setVolume = useStore((s) => s.setVolume);
  const setMuted = useStore((s) => s.setMuted);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const onAllFailed = useCallback(() => {
    markDead('radio', channel.id);
    setCountdown(3);
  }, [channel.id, markDead]);
  const src = useHlsSources(audioRef, channel, onAllFailed);

  useEffect(() => setCountdown(null), [channel.id]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      step(1);
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  // Media Session: lock-screen / hardware media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: channel.n,
      artist: countries[channel.c]?.n ?? '',
      album: 'WorldTV Radio',
      artwork: channel.l ? [{ src: channel.l, sizes: '256x256' }] : [],
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
  }, [channel, countries]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const fav = favorites.some((f) => f.mode === 'radio' && f.id === channel.id);
  const meta = countries[channel.c];
  const isPlaying = src.status === 'playing' && !paused;

  return (
    <div className="radio-bar glass">
      <audio
        ref={audioRef}
        autoPlay
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
      />
      <div className="radio-art">
        <ChannelLogo ch={channel} size={52} />
        {isPlaying && (
          <div className="eq">
            <i /><i /><i /><i />
          </div>
        )}
      </div>
      <div className="radio-meta">
        <b title={channel.n}>{channel.n}</b>
        <small>
          {countdown !== null ? (
            <>Station off-air · next in {countdown}s</>
          ) : src.status === 'loading' ? (
            'Tuning in…'
          ) : src.status === 'blocked' ? (
            'Press play to start'
          ) : (
            <>
              {meta?.f} {meta?.n}
              {channel.t?.length ? ` · ${channel.t.slice(0, 3).join(', ')}` : ''}
              {channel.s[0]?.q ? ` · ${channel.s[0].q}` : ''}
            </>
          )}
        </small>
      </div>
      <div className="radio-controls">
        <button className="icon" title="Previous" onClick={() => step(-1)}>
          <ChevronLeft size={20} />
        </button>
        {src.status === 'failed' ? (
          <button className="play-btn" title="Retry" onClick={() => { setCountdown(null); src.retry(); }}>
            <RotateCcw size={20} />
          </button>
        ) : (
          <button className="play-btn" title={isPlaying ? 'Pause' : 'Play'} onClick={toggle}>
            {src.status === 'loading' ? <div className="spinner sm" /> : isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
        )}
        <button className="icon" title="Next" onClick={() => step(1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="radio-extra">
        <button className={`icon ${fav ? 'on' : ''}`} title="Favorite" onClick={() => toggleFavorite('radio', channel.id)}>
          <Heart size={17} fill={fav ? 'currentColor' : 'none'} />
        </button>
        <div className="vol hide-mobile">
          <button className="icon" onClick={() => setMuted(!muted)}>
            {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
          />
        </div>
        <button
          className="icon hide-mobile"
          title={copied ? 'Copied!' : 'Copy link'}
          onClick={async () => {
            await navigator.clipboard?.writeText(shareUrl('radio', channel)).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy size={16} />
        </button>
        {channel.w && (
          <a className="icon hide-mobile" href={channel.w} target="_blank" rel="noreferrer noopener" title="Station website">
            <ExternalLink size={16} />
          </a>
        )}
        <button className="icon" title="Close" onClick={stop}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
