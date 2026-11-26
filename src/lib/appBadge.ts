/**
 * The installed app's icon badge (macOS Dock, Windows taskbar, home screen).
 *
 * Web apps can't draw text on their icon, only a badge: a number or a plain
 * dot. So "timer on the Dock" means the running task's minutes as a badge.
 *
 * The choice is per device (localStorage): it's about this machine's Dock,
 * and syncing it would make one device's preference change another's.
 */

export type BadgeMode = 'minutes' | 'dot' | 'off';

const KEY = 'monotask-badge-mode';
const EVENT = 'monotask-badge-mode';

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function badgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export function getBadgeMode(): BadgeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'minutes' || v === 'dot' || v === 'off') return v;
  } catch {
    // storage unavailable — fall through to the default
  }
  return 'minutes';
}

export function setBadgeMode(mode: BadgeMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // not worth failing over; the choice just won't be remembered
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onBadgeModeChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener); // another window of the app
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Show `minutes` (or a dot), or clear the badge with `null`. Never throws. */
export function applyBadge(mode: BadgeMode, minutes: number | null): void {
  const nav = navigator as BadgeNavigator;
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  const done = (p: Promise<void>) => void p.catch(() => {});
  if (minutes === null || mode === 'off') return done(nav.clearAppBadge());
  // setAppBadge(0) clears on some platforms, so a just-started timer shows a dot.
  if (mode === 'dot' || minutes < 1) return done(nav.setAppBadge());
  done(nav.setAppBadge(Math.floor(minutes)));
}
