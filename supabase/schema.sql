-- Monotask Database Schema for Supabase
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query

-- 1. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_target_minutes INTEGER NOT NULL DEFAULT 420,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);

-- 2. Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  expanded BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own groups" ON public.groups
  FOR ALL USING (auth.uid() = user_id);

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

CREATE POLICY "Users can manage own completed tasks" ON public.completed_tasks
  FOR ALL USING (auth.uid() = user_id);

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

CREATE POLICY "Users can manage own work sessions" ON public.work_sessions
  FOR ALL USING (auth.uid() = user_id);

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

CREATE POLICY "Users can manage own note groups" ON public.note_groups
  FOR ALL USING (auth.uid() = user_id);

-- 6. User Active State (for persistent active timer across devices)
CREATE TABLE IF NOT EXISTS public.user_active_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  running_task_id TEXT,
  last_active_timestamp BIGINT,
  active_session_start BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_active_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own active state" ON public.user_active_state
  FOR ALL USING (auth.uid() = user_id);
