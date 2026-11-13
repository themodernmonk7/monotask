import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'monotask-target-notified';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

/**
 * Fires once per day when the daily target is reached.
 *
 * The "already notified today" marker is the one thing that legitimately
 * belongs in localStorage: it is a per-device nicety, not user data, and
 * syncing it would make one device's notification silence another's.
 */
export function useTargetNotification(
  loggedSeconds: number,
  targetSeconds: number,
  enabled: boolean,
): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !notificationsSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (targetSeconds <= 0 || loggedSeconds < targetSeconds) return;
    if (firedRef.current) return;

    const key = todayKey();
    let alreadyNotified = false;
    try {
      alreadyNotified = localStorage.getItem(STORAGE_KEY) === key;
    } catch {
      // Private mode or storage disabled — just notify.
    }
    if (alreadyNotified) {
      firedRef.current = true;
      return;
    }

    firedRef.current = true;
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Not worth failing the notification over.
    }

    const hours = Math.floor(targetSeconds / 3600);
    const minutes = Math.round((targetSeconds % 3600) / 60);
    const target = minutes ? `${hours}h ${minutes}m` : `${hours}h`;

    new Notification('Daily target reached', {
      body: `You have logged your ${target} for today. Good place to stop.`,
      icon: '/favicon.ico',
      tag: 'monotask-target',
    });
  }, [loggedSeconds, targetSeconds, enabled]);
}
