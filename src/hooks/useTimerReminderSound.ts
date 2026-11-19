import { useEffect, useRef } from 'react';
import { chimeCountSince, playChime } from '@/lib/chime';

/** How often the wall clock is checked against the schedule. */
const CHECK_INTERVAL_MS = 5_000;

/**
 * Plays a short reminder sound every `intervalMinutes` while a task is
 * running — on purpose, even while the tab is hidden, since the whole point
 * is to reach you when you're not looking at the screen (unlike the tab
 * title/favicon, which only help while you are).
 *
 * The count of "how many chimes should have happened by now" is recomputed
 * from wall-clock time on every check rather than counted by the interval
 * ticks themselves — browsers throttle timers in background tabs, so a tick
 * can arrive late, but recomputing from elapsed time means it still catches
 * up to the right chime count instead of drifting or double-firing.
 */
export function useTimerReminderSound(
  activeSessionStart: number | null,
  enabled: boolean,
  intervalMinutes: number,
): void {
  const chimedCountRef = useRef(0);

  // A new run (start, or switching tasks) always starts its own count fresh.
  useEffect(() => {
    chimedCountRef.current = 0;
  }, [activeSessionStart]);

  useEffect(() => {
    if (!enabled || !activeSessionStart) return;

    const check = () => {
      const elapsedMs = Date.now() - activeSessionStart;
      const due = chimeCountSince(elapsedMs, intervalMinutes);
      if (due > chimedCountRef.current) {
        chimedCountRef.current = due;
        playChime();
      }
    };

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [activeSessionStart, enabled, intervalMinutes]);
}
