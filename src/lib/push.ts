import { supabase } from './supabase';

/**
 * Web Push on this device: ask permission, subscribe through the service
 * worker, and store the subscription so the send-reminders Edge Function can
 * reach this device even when the app is closed.
 */

export type PushState =
  | 'unsupported' // browser can't do Web Push (or iPhone not installed to Home Screen)
  | 'unconfigured' // the app was built without a VAPID public key
  | 'denied' // the user blocked notifications for this site
  | 'off'
  | 'on';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iPhone/iPad only allow Web Push for apps added to the Home Screen. */
export function needsHomeScreenInstall(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The service worker registration. Only turning push ON waits for the worker
 * to finish installing; everything else just looks, so that e.g. signing out
 * never stalls on a worker that isn't there (development builds have none).
 */
async function registration(wait = false): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  if (!wait) return (await navigator.serviceWorker.getRegistration()) ?? null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function subscriptionRow(userId: string, sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent.slice(0, 300),
  };
}

/** Turn notifications on for this device. Returns the resulting state. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await registration(true);
  if (!reg) throw new Error('The app is still installing — try again in a moment.');

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(subscriptionRow(userId, sub), { onConflict: 'user_id,endpoint' });
  if (error) throw new Error(error.message);
  return 'on';
}

/** Turn notifications off for this device (other devices are unaffected). */
export async function disablePush(userId: string): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/**
 * Keep this device's stored subscription current. Browsers occasionally
 * rotate subscriptions; re-saving on each load means the server never holds
 * a stale one for long.
 */
export async function refreshPushSubscription(userId: string): Promise<void> {
  if ((await getPushState()) !== 'on') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase
    .from('push_subscriptions')
    .upsert(subscriptionRow(userId, sub), { onConflict: 'user_id,endpoint' });
}

/** Ask the server to push a test notification to this user's devices. */
export async function sendTestPush(): Promise<{ sent: number; devices: number }> {
  const { data, error } = await supabase.functions.invoke('send-reminders', {
    body: { test: true },
  });
  if (error) {
    // Only an HTTP error carries the function's Response in `context`; a
    // network/relay failure carries something else (or nothing), so check
    // before reading it rather than assuming.
    const ctx = (error as { context?: unknown }).context;
    let detail: string | undefined;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null);
      detail = body?.error ?? body?.message;
    }
    throw new Error(
      detail ??
        (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError'
          ? 'Couldn’t reach the notification service. Try again in a minute.'
          : error.message),
    );
  }
  return data as { sent: number; devices: number };
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
