// Supabase Edge Function: sends Monotask push notifications.
//
// Called two ways:
//   1. Every minute by pg_cron (supabase/push-cron.sql) with the x-cron-secret
//      header: checks every user with a subscribed device and sends what is
//      due (see _shared/reminders.ts for the rules).
//   2. By a signed-in user with { "test": true }: sends a test notification
//      to that user's own devices only.
//
// Deploy with --no-verify-jwt (the cron call carries no user JWT); both paths
// authenticate themselves below.
//
// Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {
  planIdle,
  planPending,
  settingsFromRow,
  type OpenTask,
  type PlannedNotification,
} from '../_shared/reminders.ts';

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

interface Subscription {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Send to every device; drop subscriptions the push service says are gone. */
async function deliver(subs: Subscription[], n: Pick<PlannedNotification, 'title' | 'body' | 'tag' | 'url'>) {
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(n),
          { TTL: 60 * 60, urgency: 'high' },
        );
        sent += 1;
        await admin
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString() })
          .eq('user_id', s.user_id)
          .eq('endpoint', s.endpoint);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', s.user_id)
            .eq('endpoint', s.endpoint);
        } else {
          console.error('push failed', status, (err as Error).message);
        }
      }
    }),
  );
  return sent;
}

async function runScheduled() {
  const now = Date.now();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth');
  if (error) throw error;
  if (!subs?.length) return { users: 0, sent: 0 };

  const byUser = new Map<string, Subscription[]>();
  for (const s of subs as Subscription[]) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }
  const userIds = [...byUser.keys()];

  const [settingsRes, activeRes, groupsRes] = await Promise.all([
    admin.from('user_settings').select('*').in('user_id', userIds),
    admin.from('user_active_state').select('*').in('user_id', userIds),
    admin.from('groups').select('user_id, tasks').in('user_id', userIds),
  ]);
  for (const r of [settingsRes, activeRes, groupsRes]) if (r.error) throw r.error;

  let sent = 0;
  for (const userId of userIds) {
    const settings = settingsFromRow(settingsRes.data!.find((r) => r.user_id === userId));
    const activeRow = activeRes.data!.find((r) => r.user_id === userId);
    const openTasks: OpenTask[] = groupsRes.data!
      .filter((g) => g.user_id === userId)
      .flatMap((g) => (Array.isArray(g.tasks) ? g.tasks : []))
      .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));

    const active = activeRow
      ? {
          runningTaskId: activeRow.running_task_id,
          activeSessionStart: activeRow.active_session_start ? Number(activeRow.active_session_start) : null,
          lastActiveTimestamp: activeRow.last_active_timestamp ? Number(activeRow.last_active_timestamp) : null,
        }
      : null;
    const runningName = openTasks.find((t) => t.id === active?.runningTaskId)?.name ?? null;

    const planned = [
      planIdle(settings, active, runningName, now),
      planPending(settings, openTasks, now),
    ].filter((n): n is PlannedNotification => n !== null);

    for (const n of planned) {
      // Claim the occasion first; a duplicate key means it was already sent.
      const { error: claimError } = await admin
        .from('notification_log')
        .insert({ user_id: userId, kind: n.kind, ref: n.ref });
      if (claimError) {
        if (claimError.code !== '23505') console.error('log insert failed', claimError.message);
        continue;
      }
      sent += await deliver(byUser.get(userId)!, n);
    }
  }

  // Keep the log small; a week is far longer than any occasion lasts.
  await admin
    .from('notification_log')
    .delete()
    .lt('sent_at', new Date(now - 7 * 24 * 3600_000).toISOString());

  return { users: userIds.length, sent };
}

async function runTest(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Sign in first.' }, 401);

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .eq('user_id', data.user.id);
  if (!subs?.length) return json({ error: 'No device has notifications turned on.' }, 400);

  const sent = await deliver(subs as Subscription[], {
    title: 'Monotask notifications are on',
    body: 'This is how reminders will appear on this device.',
    tag: 'monotask-test',
    url: '/',
  });
  return json({ sent, devices: subs.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (req.headers.get('x-cron-secret') === env('CRON_SECRET')) {
      return json(await runScheduled());
    }
    const body = await req.json().catch(() => ({}));
    if (body?.test === true) return runTest(req);
    return json({ error: 'Not allowed.' }, 401);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
