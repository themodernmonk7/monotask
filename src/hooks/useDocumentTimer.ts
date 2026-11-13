import { useEffect, useRef } from 'react';
import { formatElapsed } from '@/lib/time';

const BASE_TITLE = 'Monotask';
const TICK_MS = 1000;

/** Favicon with a coloured dot in the corner, drawn once per state. */
function drawFavicon(running: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b0f14';
  ctx.beginPath();
  // roundRect is unavailable on older Safari; a plain square is a fine fallback.
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, 64, 64, 14);
  } else {
    ctx.rect(0, 0, 64, 64);
  }
  ctx.fill();

  ctx.fillStyle = running ? '#34d399' : '#64748b';
  ctx.beginPath();
  ctx.arc(32, 32, running ? 18 : 12, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL('image/png');
}

function setFavicon(href: string): void {
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Mirrors the running timer into the tab title and favicon.
 *
 * The title must keep moving while the tab is in the background — that is the
 * whole point of it. But the app's timer tick is driven by requestAnimationFrame,
 * which browsers pause outright in hidden tabs, so `elapsedSeconds` goes stale
 * exactly when the title matters most.
 *
 * So rather than printing the prop directly, this keeps an anchor of
 * (last known elapsed, when we learned it) and derives the display from the
 * wall clock. While the tab is visible the anchor refreshes every second and
 * the value tracks the prop; once hidden the anchor freezes and elapsed time
 * keeps accruing from Date.now(). Writing document.title straight from the
 * interval also sidesteps React scheduling in background tabs.
 */
export function useDocumentTimer(
  taskName: string | null,
  elapsedSeconds: number,
  isRunning: boolean,
): void {
  const originalFavicon = useRef<string | null>(null);
  const lastFaviconState = useRef<boolean | null>(null);

  // Seeded in the effect below (which runs before the ticking one), because
  // reading the clock during render is impure.
  const anchor = useRef({ elapsed: 0, at: 0 });
  const latest = useRef({ taskName, isRunning });

  // Re-anchor whenever a fresh value arrives from the running tick.
  useEffect(() => {
    anchor.current = { elapsed: elapsedSeconds, at: Date.now() };
    latest.current = { taskName, isRunning };
  }, [elapsedSeconds, taskName, isRunning]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    originalFavicon.current = link?.href ?? null;
    return () => {
      document.title = BASE_TITLE;
      if (originalFavicon.current) setFavicon(originalFavicon.current);
    };
  }, []);

  useEffect(() => {
    const render = () => {
      const { taskName: name, isRunning: running } = latest.current;

      if (!running || !name) {
        document.title = BASE_TITLE;
        return;
      }

      const drift = Math.max(0, Math.floor((Date.now() - anchor.current.at) / 1000));
      document.title = `(${formatElapsed(anchor.current.elapsed + drift)}) ${name} — ${BASE_TITLE}`;
    };

    render();
    const interval = window.setInterval(render, TICK_MS);
    // Hidden tabs throttle intervals, so repaint the moment focus returns.
    document.addEventListener('visibilitychange', render);
    window.addEventListener('focus', render);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', render);
      window.removeEventListener('focus', render);
    };
  }, []);

  useEffect(() => {
    if (lastFaviconState.current === isRunning) return;
    lastFaviconState.current = isRunning;

    if (isRunning) {
      setFavicon(drawFavicon(true));
    } else if (originalFavicon.current) {
      setFavicon(originalFavicon.current);
    }
  }, [isRunning]);
}
