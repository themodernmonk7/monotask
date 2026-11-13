import { useState } from 'react';
import { Database, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SCHEMA_SQL = `-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_target_minutes INTEGER NOT NULL DEFAULT 420,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

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
CREATE POLICY "Users can manage own groups" ON public.groups FOR ALL USING (auth.uid() = user_id);

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
CREATE POLICY "Users can manage own completed tasks" ON public.completed_tasks FOR ALL USING (auth.uid() = user_id);

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
CREATE POLICY "Users can manage own work sessions" ON public.work_sessions FOR ALL USING (auth.uid() = user_id);

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
CREATE POLICY "Users can manage own note groups" ON public.note_groups FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_active_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  running_task_id TEXT,
  last_active_timestamp BIGINT,
  active_session_start BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.user_active_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own active state" ON public.user_active_state FOR ALL USING (auth.uid() = user_id);`;

export function SupabaseSchemaBanner() {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 text-xs text-amber-200 space-y-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Database className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-300">
              Supabase connected! Setup your database tables
            </p>
            <p className="text-amber-200/80 text-[11px] mt-0.5">
              To enable cloud syncing, run the Monotask schema script in your Supabase SQL Editor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="xs"
            onClick={handleCopy}
            className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied SQL!' : 'Copy SQL'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="h-7 w-7 text-amber-400 hover:bg-amber-500/20 rounded-lg"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="bg-black/40 rounded-xl p-3 border border-amber-500/20 font-mono text-[10px] text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto">
          <pre>{SCHEMA_SQL}</pre>
        </div>
      )}
    </div>
  );
}
