-- Monotask Database Schema for Supabase
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
--
-- This script is safe to run as many times as you like. Tables use
-- IF NOT EXISTS, and every policy is dropped before being recreated because
-- Postgres has no CREATE POLICY IF NOT EXISTS.
--
-- Every table is scoped by user_id and protected by Row Level Security, so one
-- database serves any number of users while each only ever sees their own rows.

-- 1. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_target_minutes INTEGER NOT NULL DEFAULT 420,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  timer_reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  timer_reminder_minutes INTEGER NOT NULL DEFAULT 5,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  expanded BOOLEAN NOT NULL DEFAULT true,
  pinned BOOLEAN NOT NULL DEFAULT false,
  color TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own groups" ON public.groups;
CREATE POLICY "Users can manage own groups" ON public.groups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Completed Tasks Table
CREATE TABLE IF NOT EXISTS public.completed_tasks (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at BIGINT NOT NULL,
  ticket_id TEXT,
  start_time BIGINT,
  end_time BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.completed_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own completed tasks" ON public.completed_tasks;
CREATE POLICY "Users can manage own completed tasks" ON public.completed_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Work Sessions Table
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  ticket_id TEXT,
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  notes TEXT,
  completed_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own work sessions" ON public.work_sessions;
CREATE POLICY "Users can manage own work sessions" ON public.work_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Note Groups Table
CREATE TABLE IF NOT EXISTS public.note_groups (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.note_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own note groups" ON public.note_groups;
CREATE POLICY "Users can manage own note groups" ON public.note_groups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. User Active State (for persistent active timer across devices)
CREATE TABLE IF NOT EXISTS public.user_active_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  running_task_id TEXT,
  last_active_timestamp BIGINT,
  active_session_start BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_active_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own active state" ON public.user_active_state;
CREATE POLICY "Users can manage own active state" ON public.user_active_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Tags (shared per-user tag library; tasks reference these by id)
CREATE TABLE IF NOT EXISTS public.tags (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'sky',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tags" ON public.tags;
CREATE POLICY "Users can manage own tags" ON public.tags
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Shared Reports (public read-only links to a frozen report snapshot)
--
-- The snapshot is computed and frozen client-side at share time — this table
-- never gives a visitor live query access to your sessions or tasks, only a
-- fixed JSON summary you explicitly chose to share. Revoking sets `revoked`
-- rather than deleting, so a dead link fails closed instantly without a
-- round trip to find and remove the row first.
CREATE TABLE IF NOT EXISTS public.shared_reports (
  -- Generated server-side (pgcrypto, standard on Supabase) rather than
  -- client-side: this id doubles as the link's only access control, so it
  -- must come from a real CSPRNG, not the app's usual short client-generated
  -- ids used elsewhere for tasks/groups.
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  owner_name TEXT,
  snapshot JSONB NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

-- Owner: full control (create, list, revoke) over their own rows.
DROP POLICY IF EXISTS "Users can manage own shared reports" ON public.shared_reports;
CREATE POLICY "Users can manage own shared reports" ON public.shared_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Deliberately NO public SELECT policy here. A policy like
-- `USING (revoked = false)` was tried first and rejected: Postgres RLS
-- filters rows, it doesn't know or care that the app's client always adds
-- `.eq('id', ...)` — a policy that permits reading any non-revoked row lets
-- a direct REST call with no id filter at all list every user's shares. The
-- public anon key is not a secret (it ships in the browser bundle), so that
-- would be a real way to enumerate other people's reports.
--
-- Instead, a visitor's ONLY path to this table is the function below, which
-- structurally cannot return more than the one row whose id you already
-- have — there is no argument that lists or wildcards.
CREATE OR REPLACE FUNCTION public.get_shared_report(share_id UUID)
RETURNS TABLE (
  id UUID,
  period_label TEXT,
  report_type TEXT,
  owner_name TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT sr.id, sr.period_label, sr.report_type, sr.owner_name, sr.snapshot, sr.created_at
  FROM public.shared_reports sr
  WHERE sr.id = share_id AND sr.revoked = false;
$$;

REVOKE ALL ON FUNCTION public.get_shared_report(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_shared_report(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Multi-device safety
--
-- Several devices can be signed in to one account at once. These make the
-- server, not whichever device wrote last, the guard of two facts.
-- ---------------------------------------------------------------------------

-- (a) A completed task is never open again. A device holding a stale copy of
--     a group (a timer still running there, or an older app version) used to
--     write the group back with the task in it, resurrecting a task completed
--     elsewhere. Completions are recognised by the deterministic id
--     ('done-' || task id) and, for older ones, through the sessions
--     attributed to them. SECURITY INVOKER: RLS still applies.
CREATE INDEX IF NOT EXISTS work_sessions_user_task_idx
  ON public.work_sessions (user_id, task_id);

CREATE OR REPLACE FUNCTION public.strip_completed_tasks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tasks IS NULL OR jsonb_typeof(NEW.tasks) <> 'array' THEN
    RETURN NEW;
  END IF;

  NEW.tasks := coalesce((
    SELECT jsonb_agg(e.t ORDER BY e.ord)
    FROM jsonb_array_elements(NEW.tasks) WITH ORDINALITY AS e(t, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.completed_tasks c
      WHERE c.user_id = NEW.user_id
        AND (
          c.id = 'done-' || (e.t->>'id')
          OR c.id IN (
            SELECT w.completed_task_id FROM public.work_sessions w
            WHERE w.user_id = NEW.user_id
              AND w.task_id = e.t->>'id'
              AND w.completed_task_id IS NOT NULL
          )
        )
    )
  ), '[]'::jsonb);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_strip_completed_tasks ON public.groups;
CREATE TRIGGER groups_strip_completed_tasks
  BEFORE INSERT OR UPDATE OF tasks ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.strip_completed_tasks();

-- (b) Devices hear about each other's changes: add the app's tables to the
--     realtime feed (RLS still decides who receives what).
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['groups', 'completed_tasks', 'work_sessions', 'note_groups',
                             'tags', 'user_settings', 'user_active_state'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Migrations for databases created before a column existed. Safe to re-run.
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS timer_reminder_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS timer_reminder_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark'));
-- END MONOTASK MIGRATIONS
