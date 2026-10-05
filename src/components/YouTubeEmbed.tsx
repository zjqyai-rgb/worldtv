import { useEffect, useRef } from 'react';

interface YTPlayer {
  destroy(): void;
  mute(): void;
  unMute(): void;
  playVideo(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

/** YouTube live embed that reports unplayable videos (removed, private, embedding off) via onError. */
export function YouTubeEmbed({ id, muted, onError }: { id: string; muted: boolean; onError: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement('div');
    host.current?.appendChild(el);
    loadApi().then(() => {
      if (cancelled || !window.YT) return;
      player.current = new window.YT.Player(el, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.playVideo();
            if (!muted) e.target.unMute();
          },
          onError: () => errRef.current(),
          // 0 = ended: the live broadcast stopped, so treat it like a dead stream.
          onStateChange: (e: { data: number }) => {
            host.current?.setAttribute('data-state', String(e.data));
            if (e.data === 0) errRef.current();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return <div ref={host} className="yt-host" />;
}
