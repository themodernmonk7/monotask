/**
 * Decides which push notifications a user should get right now.
 *
 * Pure functions only — no I/O, no Deno or browser APIs beyond Intl — so the
 * exact same file runs in the Supabase Edge Function and in the app's unit
 * tests. The function calls `plan*` every minute; each planned notification
 * carries a `ref` that is unique per occasion, and the caller records it in
 * notification_log before sending, so a notification is sent at most once no
 * matter how often (or how concurrently) the check runs.
 */

export interface ReminderSettings {
  /** IANA zone, e.g. 'Asia/Kolkata'. All clock times below are in it. */
  timezone: string;
  /** 0 = Sun … 6 = Sat. */
  workingDays: number[];
  idlePushEnabled: boolean;
  pendingReminderEnabled: boolean;
  /** 'HH:mm', first reminder of the day. */
  pendingReminderStart: string;
  pendingReminderIntervalMinutes: number;
  /** Reminders per day, at most. */
  pendingReminderCount: number;
}

export interface ActiveTimer {
  runningTaskId: string | null;
  activeSessionStart: number | null;
  lastActiveTimestamp: number | null;
}

export interface OpenTask {
  id: string;
  name: string;
}

export interface PlannedNotification {
  kind: 'idle' | 'pending';
  /** Unique per occasion; (user, kind, ref) is the dedupe key. */
  ref: string;
  title: string;
  body: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
  /** Opened when the notification is tapped. */
  url: string;
}

/** Same as the in-app "were you working while away?" threshold. */
export const IDLE_THRESHOLD_MS = 30 * 60_000;

export interface LocalTime {
  /** 'yyyy-MM-dd' in the user's zone. */
  dateKey: string;
  /** 0 = Sun … 6 = Sat. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function safeZone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function localTime(now: number, timezone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function clockLabel(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timezone),
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function durationLabel(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * "Were you working while away?" — a timer is running but no device has
 * checked in for IDLE_THRESHOLD_MS (app closed, laptop asleep, phone locked).
 *
 * One notification per away-period: the ref is the segment plus the last
 * check-in, so it fires again only after the user comes back and leaves again.
 */
export function planIdle(
  settings: ReminderSettings,
  active: ActiveTimer | null,
  taskName: string | null,
  now: number,
): PlannedNotification | null {
  if (!settings.idlePushEnabled || !active) return null;
  const { runningTaskId, activeSessionStart, lastActiveTimestamp } = active;
  if (!runningTaskId || !activeSessionStart || !lastActiveTimestamp) return null;
  if (now - lastActiveTimestamp < IDLE_THRESHOLD_MS) return null;

  const name = taskName ?? 'Your task';
  return {
    kind: 'idle',
    ref: `${runningTaskId}:${activeSessionStart}:${lastActiveTimestamp}`,
    title: 'Were you working while away?',
    body:
      `“${name}” is still running — no activity since ` +
      `${clockLabel(lastActiveTimestamp, settings.timezone)} ` +
      `(${durationLabel(now - lastActiveTimestamp)}). Open to keep or discard that time.`,
    tag: 'monotask-idle',
    url: '/',
  };
}

/**
 * One summary of open tasks, at the user's chosen times: the first at
 * `pendingReminderStart`, then every interval, `pendingReminderCount` times,
 * on working days only, and only while something is still open.
 */
export function planPending(
  settings: ReminderSettings,
  openTasks: OpenTask[],
  now: number,
): PlannedNotification | null {
  if (!settings.pendingReminderEnabled || openTasks.length === 0) return null;

  const start = parseClock(settings.pendingReminderStart);
  const interval = Math.max(1, Math.floor(settings.pendingReminderIntervalMinutes));
  const count = Math.max(0, Math.floor(settings.pendingReminderCount));
  if (start === null || count === 0) return null;

  const local = localTime(now, settings.timezone);
  if (!settings.workingDays.includes(local.weekday)) return null;
  if (local.minutes < start) return null;

  const slot = Math.floor((local.minutes - start) / interval);
  if (slot >= count) return null;

  const names = openTasks.slice(0, 3).map((t) => `“${t.name}”`);
  const more = openTasks.length - names.length;
  const list = more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ');
  const n = openTasks.length;

  return {
    kind: 'pending',
    ref: `${local.dateKey}#${slot}`,
    title: `${n} open ${n === 1 ? 'task' : 'tasks'}`,
    body: `${list}. Mark done what you finished today.`,
    tag: 'monotask-pending',
    url: '/',
  };
}

/** Raw user_settings row -> settings, with safe defaults for missing columns. */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): ReminderSettings {
  const r = row ?? {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    timezone: typeof r.timezone === 'string' && r.timezone ? r.timezone : 'UTC',
    workingDays: Array.isArray(r.working_days) ? (r.working_days as number[]) : [1, 2, 3, 4, 5],
    idlePushEnabled: typeof r.idle_push_enabled === 'boolean' ? r.idle_push_enabled : true,
    pendingReminderEnabled:
      typeof r.pending_reminder_enabled === 'boolean' ? r.pending_reminder_enabled : false,
    pendingReminderStart:
      typeof r.pending_reminder_start === 'string' ? r.pending_reminder_start : '18:00',
    pendingReminderIntervalMinutes: num(r.pending_reminder_interval_minutes, 30),
    pendingReminderCount: num(r.pending_reminder_count, 3),
  };
}
