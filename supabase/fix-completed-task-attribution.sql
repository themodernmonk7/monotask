-- Monotask — one-time repair for double-counted completed tasks
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
--
-- Completing a task while its timer was NOT running left every one of that
-- task's sessions without a completed_task_id. The app then counted the
-- completed task's total ON TOP of those sessions, inflating reports and the
-- CSV export.
--
-- The app no longer creates this state. This backfills the link for rows that
-- already have it, matching sessions to a completion by task name, project and
-- the window since that task was last completed (so a task completed more than
-- once splits its sessions correctly instead of dumping them all on the latest).
--
-- Safe to re-run: it only ever fills a NULL completed_task_id.

WITH bounds AS (
  SELECT
    id,
    user_id,
    task_name,
    group_name,
    completed_at,
    COALESCE(
      LAG(completed_at) OVER (
        PARTITION BY user_id, task_name, group_name
        ORDER BY completed_at
      ),
      0
    ) AS prev_completed_at
  FROM public.completed_tasks
)
UPDATE public.work_sessions w
   SET completed_task_id = b.id
  FROM bounds b
 WHERE w.user_id           = b.user_id
   AND w.completed_task_id IS NULL
   AND w.task_name         = b.task_name
   AND w.group_name        = b.group_name
   AND w.end_time         <= b.completed_at
   AND w.end_time          > b.prev_completed_at;

-- Report what is still unattributed, for sanity.
SELECT
  (SELECT count(*) FROM public.work_sessions WHERE completed_task_id IS NOT NULL)
    AS sessions_attributed,
  (SELECT count(*) FROM public.work_sessions WHERE completed_task_id IS NULL)
    AS sessions_unattributed;
