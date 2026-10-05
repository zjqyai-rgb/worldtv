import { useCallback, useEffect, useRef, useState } from 'react';
import Hls, { type Level } from 'hls.js';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Heart,
  Maximize,
  Minimize2,
  PictureInPicture2,
  RectangleHorizontal,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { shareUrl } from '../lib';
import ChannelLogo from './ChannelLogo';
import { YouTubeEmbed } from './YouTubeEmbed';
import type { Channel, Mode } from '../types';

const START_TIMEOUT = 18000; // a source that hasn't started playing by then is considered broken
type Status = 'loading' | 'playing' | 'failed' | 'blocked';

/** Plays a channel's HLS sources in order, moving to the next one on any fatal error. */
export function useHlsSources(
  mediaRef: React.RefObject<HTMLMediaElement | null>,
  channel: Channel,
  onAllFailed: () => void,
) {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevelState] = useState(-1);
  const hlsRef = useRef<Hls | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failedRef = useRef(onAllFailed);
  failedRef.current = onAllFailed;

  useEffect(() => {
    setIdx(0);
    setStatus('loading');
  }, [channel.id]);

  useEffect(() => {
    const media = mediaRef.current;
    const src = channel.s[idx];
    if (!media || !src) return;
    let done = false;
    setStatus('loading');
    setLevels([]);
    setLevelState(-1);

    const next = () => {
      if (done) return;
      done = true;
      cleanup();
      if (idx + 1 < channel.s.length) setIdx(idx + 1);
      else {
        setStatus('failed');
        failedRef.current();
      }
    };
    const timer = window.setTimeout(next, START_TIMEOUT);
    const onPlaying = () => {
      window.clearTimeout(timer);
      setStatus('playing');
    };
    const tryPlay = () => {
      media.play().catch((e: DOMException) => {
        if (e.name === 'NotAllowedError') {
          // Autoplay with sound was blocked: start muted and let the user unmute.
          media.muted = true;
          useStore.getState().setMuted(true);
          media.play().catch(() => setStatus('blocked'));
        }
      });
    };
    media.addEventListener('playing', onPlaying);

    let hls: Hls | null = null;
    const isHls = /\.m3u8(\?|$)/i.test(src.u) || src.h === 1;
    if (isHls && Hls.isSupported()) {
      let mediaRecovered = false;
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 20000,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls!.levels.slice());
        tryPlay();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => setLevelState(hls!.autoLevelEnabled ? -1 : d.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          mediaRecovered = true;
          hls!.recoverMediaError();
          return;
        }
        next();
      });
      hls.loadSource(src.u);
      hls.attachMedia(media);
    } else {
      // Native playback (Safari / iOS HLS, or plain audio streams).
      media.src = src.u;
      media.addEventListener('error', next, { once: true });
      tryPlay();
    }

    function cleanup() {
      window.clearTimeout(timer);
      media!.removeEventListener('playing', onPlaying);
      media!.removeEventListener('error', next);
      if (hls) {
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
      }
    }
    // A stream that stalls for long after starting also counts as a failure.
    let stallTimer: number | undefined;
    const onWaiting = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(next, 25000);
    };
    const onResume = () => window.clearTimeout(stallTimer);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('playing', onResume);

    return () => {
      done = true;
      window.clearTimeout(stallTimer);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('playing', onResume);
      cleanup();
      media.removeAttribute('src');
      media.load();
    };
  }, [channel, idx, attempt, mediaRef]);

  const setLevel = useCallback((l: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = l;
    setLevelState(l);
  }, []);
  const retry = useCallback(() => {
    setIdx(0);
    setAttempt((a) => a + 1);
  }, []);
  const switchSource = useCallback((i: number) => setIdx(i), []);

  return { idx, status, levels, level, setLevel, retry, switchSource, tryPlay: () => mediaRef.current?.play() };
}

/** Advance to the next / previous playable item in the queue. */
export function step(dir: 1 | -1) {
  const { playing, play, dead } = useStore.getState();
  if (!playing) return;
  const { queue, channel, mode } = playing;
  const list = queue.filter((c) => !dead[`${mode}:${c.id}`] || c.id === channel.id);
  if (list.length < 2) return;
  const i = list.findIndex((c) => c.id === channel.id);
  play(list[(i + dir + list.length) % list.length], queue, mode);
}

export default function Player() {
  const playing = useStore((s) => s.playing);
  if (!playing || playing.mode === 'radio') return null;
  return <VideoPlayer key={playing.mode} mode={playing.mode} channel={playing.channel} />;
}

function VideoPlayer({ mode, channel }: { mode: Mode; channel: Channel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const size = useStore((s) => s.playerSize);
  const setSize = useStore((s) => s.setPlayerSize);
  const stop = useStore((s) => s.stop);
  const markDead = useStore((s) => s.markDead);
  const countries = useStore((s) => s.countries);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const volume = useStore((s) => s.volume);
  const muted = useStore((s) => s.muted);
  const setVolume = useStore((s) => s.setVolume);
  const setMuted = useStore((s) => s.setMuted);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const isYt = channel.s[0]?.u.startsWith('yt:');

  const onAllFailed = useCallback(() => {
    markDead(mode, channel.id);
    setCountdown(4);
  }, [mode, channel.id, markDead]);

  const hls = useHlsSources(videoRef, isYt ? { ...channel, s: [] } : channel, onAllFailed);

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
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted, channel.id]);

  const fav = favorites.some((f) => f.mode === mode && f.id === channel.id);
  const meta = countries[channel.c];
  const status = isYt ? 'playing' : hls.status;

  const fullscreen = () => {
    const el = shellRef.current?.querySelector('.screen') as HTMLElement | null;
    if (document.fullscreenElement) document.exitFullscreen();
    else el?.requestFullscreen?.() ?? (videoRef.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
  };
  const pip = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture?.().catch(() => {});
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(shareUrl(mode, channel)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Keyboard shortcuts while the player is open.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'f') fullscreen();
      else if (e.key === 'm') setMuted(!useStore.getState().muted);
      else if (e.key === 'n' || e.key === 'PageDown') step(1);
      else if (e.key === 'p' || e.key === 'PageUp') step(-1);
      else if (e.key === 't') setSize(useStore.getState().playerSize === 'theater' ? 'docked' : 'theater');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  return (
    <>
      {size === 'theater' && <div className="theater-backdrop" onClick={() => setSize('docked')} />}
      <div ref={shellRef} className={`player glass size-${size}`}>
        <div className="screen">
          {isYt ? (
            <YouTubeEmbed id={channel.s[0].u.slice(3)} muted={muted} onError={onAllFailed} />
          ) : (
            <video ref={videoRef} playsInline autoPlay controls={false} onDoubleClick={fullscreen} />
          )}
          {status === 'loading' && (
            <div className="screen-overlay">
              <div className="spinner" />
              <span>
                Tuning in{channel.s.length > 1 ? ` · source ${hls.idx + 1}/${channel.s.length}` : ''}…
              </span>
            </div>
          )}
          {status === 'blocked' && (
            <button className="screen-overlay clickable" onClick={() => hls.tryPlay()}>
              <span className="big-play">▶</span>
              <span>Tap to play</span>
            </button>
          )}
          {(status === 'failed' || countdown !== null) && (
            <div className="screen-overlay">
              <strong>This {mode === 'webcam' ? 'webcam' : 'channel'} is off-air right now</strong>
              <span className="muted">
                {countdown !== null ? `Skipping to the next one in ${countdown}s` : 'All sources failed.'}
              </span>
              <div className="row">
                <button className="chip" onClick={() => { setCountdown(null); hls.retry(); }}>
                  <RotateCcw size={14} /> Retry
                </button>
                <button className="chip accent" onClick={() => { setCountdown(null); step(1); }}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
          {!isYt && muted && status === 'playing' && (
            <button className="unmute" onClick={() => setMuted(false)}>
              <VolumeX size={14} /> Tap to unmute
            </button>
          )}
          <div className="live-badge">
            <span className="dot" /> LIVE
          </div>
        </div>

        <div className="player-bar">
          <ChannelLogo ch={channel} size={38} />
          <div className="player-title">
            <b title={channel.n}>{channel.n}</b>
            <small>
              {meta?.f} {channel.ci ? `${channel.ci}, ` : ''}
              {meta?.n ?? channel.c}
              {channel.g[0] && channel.g[0] !== 'general' && <> · {channel.g.slice(0, 2).join(', ')}</>}
              {hls.levels.length > 0 && hls.level >= 0 && <> · {hls.levels[hls.level]?.height}p</>}
            </small>
          </div>
          <div className="player-actions">
            <button className="icon" title="Previous (P)" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon" title="Next (N)" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
            <button className={`icon ${fav ? 'on' : ''}`} title="Favorite" onClick={() => toggleFavorite(mode, channel.id)}>
              <Heart size={17} fill={fav ? 'currentColor' : 'none'} />
            </button>
            {!isYt && (
              <div className="vol hide-mobile">
                <button className="icon" title="Mute (M)" onClick={() => setMuted(!muted)}>
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
            )}
            <div className="menu-wrap">
              <button className="icon" title="More" onClick={() => setMenu(!menu)}>
                <Settings2 size={17} />
              </button>
              {menu && (
                <div className="menu glass" onMouseLeave={() => setMenu(false)}>
                  {hls.levels.length > 1 && (
                    <>
                      <div className="menu-label">Quality</div>
                      <button className={hls.level === -1 ? 'on' : ''} onClick={() => hls.setLevel(-1)}>
                        Auto
                      </button>
                      {hls.levels
                        .map((l, i) => ({ l, i }))
                        .sort((a, b) => (b.l.height || 0) - (a.l.height || 0))
                        .map(({ l, i }) => (
                          <button key={i} className={hls.level === i ? 'on' : ''} onClick={() => hls.setLevel(i)}>
                            {l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`}
                          </button>
                        ))}
                    </>
                  )}
                  {channel.s.length > 1 && (
                    <>
                      <div className="menu-label">Source</div>
                      {channel.s.map((s, i) => (
                        <button key={s.u} className={hls.idx === i ? 'on' : ''} onClick={() => hls.switchSource(i)}>
                          Source {i + 1} {s.q ? `· ${s.q}` : ''}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="menu-label">Share</div>
                  <button onClick={copy}>
                    <Copy size={14} /> {copied ? 'Link copied!' : 'Copy link'}
                  </button>
                  {channel.w && (
                    <a href={channel.w} target="_blank" rel="noreferrer noopener">
                      <ExternalLink size={14} /> Official website
                    </a>
                  )}
                  {isYt && (
                    <a href={`https://www.youtube.com/watch?v=${channel.s[0].u.slice(3)}`} target="_blank" rel="noreferrer noopener">
                      <ExternalLink size={14} /> Open on YouTube
                    </a>
                  )}
                </div>
              )}
            </div>
            {!isYt && 'pictureInPictureEnabled' in document && (
              <button className="icon hide-mobile" title="Picture in picture" onClick={pip}>
                <PictureInPicture2 size={17} />
              </button>
            )}
            <button
              className="icon hide-mobile"
              title={size === 'mini' ? 'Expand' : 'Mini player'}
              onClick={() => setSize(size === 'mini' ? 'docked' : 'mini')}
            >
              {size === 'mini' ? <RectangleHorizontal size={17} /> : <Minimize2 size={17} />}
            </button>
            <button className="icon hide-mobile" title="Theater (T)" onClick={() => setSize(size === 'theater' ? 'docked' : 'theater')}>
              <RectangleHorizontal size={17} />
            </button>
            <button className="icon" title="Fullscreen (F)" onClick={fullscreen}>
              <Maximize size={17} />
            </button>
            <button className="icon" title="Close" onClick={stop}>
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
