import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Supabase is mocked at the network layer so E2E needs no real project and no
 * credentials. The app is exercised exactly as shipped — only the server is
 * swapped out.
 */

export const TEST_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'tester@example.com',
  fullName: 'Ada Lovelace',
};

/** Must match VITE_SUPABASE_URL in playwright.config.ts. */
export const SUPABASE_URL = 'https://test.supabase.co';
const STORAGE_KEY = 'sb-test-auth-token';

export interface SeedData {
  groups: unknown[];
  completed_tasks: unknown[];
  work_sessions: unknown[];
  note_groups: unknown[];
  tags: unknown[];
  user_settings: unknown;
  user_active_state: unknown;
  shared_reports: Array<{
    id: string;
    user_id: string;
    period_label: string;
    report_type: string;
    owner_name: string | null;
    snapshot: unknown;
    revoked: boolean;
    created_at: string;
  }>;
}

export function defaultSeed(): SeedData {
  return {
    groups: [
      {
        id: 'g-platform',
        user_id: TEST_USER.id,
        name: 'Platform',
        tasks: [
          {
            id: 't-sync',
            name: 'Supabase sync refactor',
            elapsedSeconds: 1800,
            description: 'Replace the dual-write layer.',
            tagIds: ['tag-deep'],
          },
          { id: 't-rls', name: 'Audit RLS policies', elapsedSeconds: 600, tagIds: [] },
        ],
        expanded: true,
        pinned: true,
        order_index: 0,
      },
      {
        id: 'g-admin',
        user_id: TEST_USER.id,
        name: 'Meetings',
        tasks: [{ id: 't-standup', name: 'Daily standup', elapsedSeconds: 300, tagIds: ['tag-meeting'] }],
        expanded: true,
        pinned: false,
        order_index: 1,
      },
    ],
    completed_tasks: [],
    work_sessions: [],
    note_groups: [
      { id: 'n-general', user_id: TEST_USER.id, title: 'General', notes: [], order_index: 0 },
    ],
    shared_reports: [],
    tags: [
      { id: 'tag-deep', user_id: TEST_USER.id, label: 'Deep Work', color: 'violet' },
      { id: 'tag-meeting', user_id: TEST_USER.id, label: 'Meeting', color: 'sky' },
    ],
    user_settings: {
      user_id: TEST_USER.id,
      daily_target_minutes: 420,
      working_days: [1, 2, 3, 4, 5],
      timer_reminder_enabled: false,
      timer_reminder_minutes: 5,
    },
    user_active_state: {
      user_id: TEST_USER.id,
      running_task_id: null,
      last_active_timestamp: null,
      active_session_start: null,
    },
  };
}

/** Put a valid-looking session in localStorage so the app starts signed in. */
export async function signIn(page: Page): Promise<void> {
  const session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user: {
      id: TEST_USER.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: TEST_USER.email,
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: TEST_USER.fullName },
      created_at: new Date().toISOString(),
    },
  };

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
}

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  });

/**
 * Serve the REST + auth endpoints from an in-memory seed.
 * Returns a handle so a test can flip the backend offline mid-run.
 */
export async function mockSupabase(page: Page, seed: SeedData = defaultSeed()) {
  const state = { offline: false, seed, writes: [] as { table: string; body: unknown }[] };

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    if (state.offline) {
      await route.abort('internetdisconnected');
      return;
    }

    const url = new URL(route.request().url());
    const method = route.request().method();

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*',
        },
      });
      return;
    }

    if (url.pathname.startsWith('/auth/v1')) {
      await json(route, { user: null, session: null });
      return;
    }

    // RPC calls (currently only get_shared_report) go through their own path
    // rather than the generic table read/write handling below, and model the
    // real function's behaviour: it only ever returns a non-revoked row by
    // exact id, never a list.
    if (url.pathname === '/rest/v1/rpc/get_shared_report') {
      const body = route.request().postDataJSON() as { share_id?: string };
      const row = state.seed.shared_reports.find(
        (r) => r.id === body.share_id && !r.revoked,
      );
      await json(route, row ?? null);
      return;
    }

    const table = url.pathname.replace('/rest/v1/', '');

    if (method === 'GET') {
      const rows = state.seed[table as keyof SeedData];
      // user_settings / user_active_state are fetched with maybeSingle().
      await json(route, Array.isArray(rows) ? rows : (rows ?? null));
      return;
    }

    // Writes are recorded AND applied, so a later refetch returns what was
    // written — matching how a real server behaves. Without this, any refetch
    // would appear to erase local edits and hide real bugs behind a fixture
    // artefact.
    const body = (() => {
      try {
        return route.request().postDataJSON();
      } catch {
        return null;
      }
    })();
    state.writes.push({ table, body });

    // The real id is server-generated (DEFAULT gen_random_uuid()), never
    // sent by the client — mirror that instead of falling through to the
    // generic handler below, which would insert a row with no id at all.
    if (method === 'POST' && table === 'shared_reports' && body) {
      const row = {
        id: randomUUID(),
        revoked: false,
        created_at: new Date().toISOString(),
        ...(body as Record<string, unknown>),
      };
      state.seed.shared_reports.push(row as (typeof state.seed.shared_reports)[number]);
      // The client chains .select('id').single(), which sets an Accept
      // header real PostgREST honours by returning a bare object instead of
      // a one-element array — mirror that, or supabase-js reads `data` as
      // the array itself and `data.id` comes back undefined.
      await json(route, row);
      return;
    }

    if (method === 'PATCH' && table === 'shared_reports') {
      const patch = body as Record<string, unknown> | null;
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const userId = url.searchParams.get('user_id')?.replace('eq.', '');
      state.seed.shared_reports = state.seed.shared_reports.map((r) =>
        r.id === id && (!userId || r.user_id === userId) && patch
          ? { ...r, ...patch }
          : r,
      );
      await json(route, []);
      return;
    }

    if (method === 'POST' && body) {
      const incoming = (Array.isArray(body) ? body : [body]) as { id?: string }[];
      const existing = state.seed[table as keyof SeedData];

      if (Array.isArray(existing)) {
        const rows = [...existing] as { id?: string }[];
        for (const row of incoming) {
          const at = rows.findIndex((r) => r.id === row.id);
          if (at >= 0) rows[at] = row;
          else rows.push(row);
        }
        (state.seed as Record<string, unknown>)[table] = rows;
      } else {
        (state.seed as Record<string, unknown>)[table] = incoming[0];
      }
    }

    await json(route, []);
  });

  return {
    goOffline: () => {
      state.offline = true;
    },
    goOnline: () => {
      state.offline = false;
    },
    writes: () => state.writes,
    // Current state of any table, post-writes — simpler and more honest than
    // reconstructing it from the write log for tables (like shared_reports)
    // where the server assigns fields the client never sends.
    getSeed: () => state.seed,
  };
}
