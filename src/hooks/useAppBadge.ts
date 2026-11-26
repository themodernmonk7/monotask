import { useEffect, useRef, useState } from 'react';
import {
  applyBadge,
  badgeSupported,
  getBadgeMode,
  onBadgeModeChange,
  type BadgeMode,
} from '@/lib/appBadge';

const TICK_MS = 15_000;

/**
 * Mirrors the running timer onto the installed app's icon badge.
 *
 * Like the tab title, it anchors (elapsed, when) and derives from the wall
 * clock on an interval, because the app's own tick (requestAnimationFrame)
 * stops while the window is in the background — exactly when the Dock badge
 * is what you're looking at.
 *
 * When the app is closed the badge is cleared: nothing can update it then,
 * and a frozen number would claim the wrong time.
 */
export function useAppBadge(elapsedSeconds: number, isRunning: boolean): void {
  const [mode, setMode] = useState<BadgeMode>(getBadgeMode);
  const anchor = useRef({ elapsed: 0, at: 0 });
  const running = useRef(isRunning);

  useEffect(() => onBadgeModeChange(() => setMode(getBadgeMode())), []);

  useEffect(() => {
    anchor.current = { elapsed: elapsedSeconds, at: Date.now() };
    running.current = isRunning;
  }, [elapsedSeconds, isRunning]);

  useEffect(() => {
    if (!badgeSupported()) return;

    const render = () => {
      if (!running.current) return applyBadge(mode, null);
      const drift = Math.max(0, (Date.now() - anchor.current.at) / 1000);
      applyBadge(mode, (anchor.current.elapsed + drift) / 60);
    };
    const clear = () => applyBadge(mode, null);

    render();
    const interval = window.setInterval(render, TICK_MS);
    document.addEventListener('visibilitychange', render);
    window.addEventListener('pagehide', clear);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', render);
      window.removeEventListener('pagehide', clear);
    };
  }, [mode]);

  // Start/stop shows immediately rather than at the next tick.
  useEffect(() => {
    if (!badgeSupported()) return;
    if (!isRunning) applyBadge(mode, null);
    else applyBadge(mode, elapsedSeconds / 60);
    // Only on start/stop; the interval handles the minute-by-minute updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode]);
}
