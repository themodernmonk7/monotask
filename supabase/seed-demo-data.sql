-- Monotask — random demo data for one user
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
--
-- Generates ~3 weeks of plausible tracked work: tags, groups, tasks with
-- descriptions, work sessions, completed tasks and notes.
--
-- Safe to re-run: every row it creates is prefixed `seed_` and is deleted
-- first, so your real data is never touched.
--
-- >>> EDIT THIS IF YOU ARE NOT IN IST <<<
--   v_tz controls what wall-clock times the sessions land on in your browser.
--   Use your own zone, e.g. 'UTC', 'America/New_York', 'Europe/London'.

DO $$
DECLARE
  v_email  TEXT := 'xadjrhvfjxxqqferom@vtmpj.net';
  v_tz     TEXT := 'Asia/Kolkata';
  v_days   INT  := 21;   -- how far back to generate

  v_user_id UUID;

  v_day        DATE;
  v_start      TIMESTAMPTZ;
  v_end        TIMESTAMPTZ;
  v_sessions   INT;
  v_dur_min    INT;
  v_hour       INT;
  v_minute     INT;
  v_cursor_min INT;
  v_allow_done BOOLEAN;

  v_seq        INT := 0;
  v_i          INT;
  v_j          INT;

  v_task       RECORD;
  v_grp        RECORD;
  v_tasks_json JSONB;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'No account found for %. Sign up in the app first, then re-run this.', v_email;
  END IF;

  RAISE NOTICE 'Seeding data for % (%)', v_email, v_user_id;

  ---------------------------------------------------------------------------
  -- Clear previous seed rows only
  ---------------------------------------------------------------------------
  DELETE FROM public.work_sessions   WHERE user_id = v_user_id AND id LIKE 'seed\_%';
  DELETE FROM public.completed_tasks WHERE user_id = v_user_id AND id LIKE 'seed\_%';
  DELETE FROM public.groups          WHERE user_id = v_user_id AND id LIKE 'seed\_%';
  DELETE FROM public.note_groups     WHERE user_id = v_user_id AND id LIKE 'seed\_%';
  DELETE FROM public.tags            WHERE user_id = v_user_id AND id LIKE 'seed\_%';

  ---------------------------------------------------------------------------
  -- Tag library
  ---------------------------------------------------------------------------
  INSERT INTO public.tags (id, user_id, label, color) VALUES
    ('seed_tag_deep',     v_user_id, 'Deep Work',   'violet'),
    ('seed_tag_meeting',  v_user_id, 'Meeting',     'sky'),
    ('seed_tag_bug',      v_user_id, 'Bug',         'red'),
    ('seed_tag_review',   v_user_id, 'Code Review', 'amber'),
    ('seed_tag_admin',    v_user_id, 'Admin',       'slate'),
    ('seed_tag_shipped',  v_user_id, 'Shipped',     'emerald'),
    ('seed_tag_research', v_user_id, 'Research',    'pink');

  ---------------------------------------------------------------------------
  -- Tasks to generate, staged in a temp table
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE seed_task_plan (
    group_id    TEXT,
    group_name  TEXT,
    group_order INT,
    pinned      BOOLEAN,
    task_id     TEXT,
    task_name   TEXT,
    description TEXT,
    tag_ids     JSONB,
    completed   BOOLEAN,
    elapsed     INT DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO seed_task_plan
    (group_id, group_name, group_order, pinned, task_id, task_name, description, tag_ids, completed)
  VALUES
    -- Platform (pinned)
    ('seed_g_platform','Platform',0,TRUE,'seed_t_sync','Supabase sync refactor',
     'Replace the dual-write localStorage layer with optimistic updates and rollback.',
     '["seed_tag_deep"]'::jsonb, FALSE),
    ('seed_g_platform','Platform',0,TRUE,'seed_t_rls','Audit RLS policies',
     'Confirm every table scopes reads and writes to auth.uid().',
     '["seed_tag_deep","seed_tag_review"]'::jsonb, FALSE),
    ('seed_g_platform','Platform',0,TRUE,'seed_t_timer','Fix timer drift on wake',
     'Elapsed seconds jumped after the laptop slept. Credit the gap on restore.',
     '["seed_tag_bug"]'::jsonb, TRUE),
    ('seed_g_platform','Platform',0,TRUE,'seed_t_csv','CSV export formatting',
     '12h times, readable dates, a Time Spent column and a total row.',
     '["seed_tag_shipped"]'::jsonb, TRUE),

    -- Mobile App (pinned)
    ('seed_g_mobile','Mobile App',1,TRUE,'seed_t_offline','Offline queue spike',
     'Can writes be buffered and replayed when the connection returns?',
     '["seed_tag_research"]'::jsonb, FALSE),
    ('seed_g_mobile','Mobile App',1,TRUE,'seed_t_tags','Tag picker polish',
     'Portal the dropdown so it stops being clipped by overflow-hidden parents.',
     '["seed_tag_deep","seed_tag_bug"]'::jsonb, FALSE),
    ('seed_g_mobile','Mobile App',1,TRUE,'seed_t_onboard','Onboarding walkthrough',
     NULL, '["seed_tag_shipped"]'::jsonb, TRUE),

    -- Client Work
    ('seed_g_client','Client Work',2,FALSE,'seed_t_dash','Reporting dashboard',
     'Weekly and monthly rollups with per-project breakdowns.',
     '["seed_tag_deep"]'::jsonb, FALSE),
    ('seed_g_client','Client Work',2,FALSE,'seed_t_handoff','Handoff documentation',
     'Write the runbook before the engagement wraps.',
     '["seed_tag_admin"]'::jsonb, FALSE),
    ('seed_g_client','Client Work',2,FALSE,'seed_t_invoice','October invoicing',
     NULL, '["seed_tag_admin","seed_tag_shipped"]'::jsonb, TRUE),

    -- Meetings & Admin
    ('seed_g_admin','Meetings & Admin',3,FALSE,'seed_t_standup','Daily standup',
     'Fifteen minutes, every morning.',
     '["seed_tag_meeting"]'::jsonb, FALSE),
    ('seed_g_admin','Meetings & Admin',3,FALSE,'seed_t_1on1','1:1s',
     NULL, '["seed_tag_meeting"]'::jsonb, FALSE),
    ('seed_g_admin','Meetings & Admin',3,FALSE,'seed_t_planning','Sprint planning',
     'Groom the backlog and size the next two weeks.',
     '["seed_tag_meeting","seed_tag_admin"]'::jsonb, FALSE),
    ('seed_g_admin','Meetings & Admin',3,FALSE,'seed_t_inbox','Inbox & expenses',
     NULL, '["seed_tag_admin"]'::jsonb, TRUE);

  ---------------------------------------------------------------------------
  -- Work sessions across the last v_days days (weekdays only)
  ---------------------------------------------------------------------------
  FOR v_i IN 0..v_days LOOP
    v_day := CURRENT_DATE - v_i;

    -- Skip weekends
    CONTINUE WHEN EXTRACT(DOW FROM v_day) IN (0, 6);

    -- 3-6 sessions a day, starting somewhere in the 9-10am hour
    v_sessions   := 3 + floor(random() * 4)::INT;
    v_cursor_min := 9 * 60 + floor(random() * 60)::INT;

    -- Finished tasks only accrue time more than a week back; recent days are
    -- spent on what is still open. Keeps the completed timeline believable.
    v_allow_done := v_i > 7;

    FOR v_j IN 1..v_sessions LOOP
      SELECT * INTO v_task
      FROM seed_task_plan
      WHERE v_allow_done OR NOT completed
      ORDER BY random()
      LIMIT 1;

      -- Standups are short; everything else is a real block of work
      IF v_task.task_id = 'seed_t_standup' THEN
        v_dur_min := 10 + floor(random() * 10)::INT;
      ELSE
        v_dur_min := 25 + floor(random() * 95)::INT;
      END IF;

      v_hour   := v_cursor_min / 60;
      v_minute := v_cursor_min % 60;

      -- Stop if the day has run past 7pm
      EXIT WHEN v_hour >= 19;

      v_start := (v_day::TEXT || ' ' || lpad(v_hour::TEXT, 2, '0') || ':' ||
                  lpad(v_minute::TEXT, 2, '0') || ':00')::TIMESTAMP AT TIME ZONE v_tz;
      v_end   := v_start + make_interval(mins => v_dur_min);

      v_seq := v_seq + 1;

      INSERT INTO public.work_sessions (
        id, user_id, task_id, task_name, group_name,
        start_time, end_time, duration_seconds, completed_task_id
      ) VALUES (
        'seed_s_' || v_seq,
        v_user_id,
        v_task.task_id,
        v_task.task_name,
        v_task.group_name,
        (EXTRACT(EPOCH FROM v_start) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM v_end) * 1000)::BIGINT,
        v_dur_min * 60,
        CASE WHEN v_task.completed THEN 'seed_c_' || v_task.task_id ELSE NULL END
      );

      UPDATE seed_task_plan
         SET elapsed = elapsed + v_dur_min * 60
       WHERE task_id = v_task.task_id;

      -- Next session starts after a 5-25 minute break
      v_cursor_min := v_cursor_min + v_dur_min + 5 + floor(random() * 20)::INT;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Completed tasks (totals match the sessions that reference them)
  ---------------------------------------------------------------------------
  INSERT INTO public.completed_tasks (
    id, user_id, task_name, group_name, total_seconds, completed_at, notes
  )
  SELECT
    'seed_c_' || p.task_id,
    v_user_id,
    p.task_name,
    p.group_name,
    GREATEST(p.elapsed, 600),
    -- Finished when its last session ended, so the timeline stays coherent.
    COALESCE(
      (SELECT max(w.end_time)
         FROM public.work_sessions w
        WHERE w.user_id = v_user_id
          AND w.completed_task_id = 'seed_c_' || p.task_id),
      (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
    ),
    p.description
  FROM seed_task_plan p
  WHERE p.completed;

  ---------------------------------------------------------------------------
  -- Groups, with their remaining (uncompleted) tasks as JSONB
  ---------------------------------------------------------------------------
  FOR v_grp IN
    SELECT DISTINCT group_id, group_name, group_order, pinned
    FROM seed_task_plan
    ORDER BY group_order
  LOOP
    SELECT COALESCE(
             jsonb_agg(
               jsonb_strip_nulls(
                 jsonb_build_object(
                   'id',             p.task_id,
                   'name',           p.task_name,
                   'elapsedSeconds', p.elapsed,
                   'description',    p.description,
                   'tagIds',         p.tag_ids
                 )
               )
             ),
             '[]'::jsonb
           )
      INTO v_tasks_json
      FROM seed_task_plan p
     WHERE p.group_id = v_grp.group_id
       AND NOT p.completed;

    INSERT INTO public.groups
      (id, user_id, name, tasks, expanded, pinned, order_index)
    VALUES
      (v_grp.group_id, v_user_id, v_grp.group_name, v_tasks_json,
       TRUE, v_grp.pinned, v_grp.group_order);
  END LOOP;

  ---------------------------------------------------------------------------
  -- Notes
  ---------------------------------------------------------------------------
  INSERT INTO public.note_groups (id, user_id, title, notes, order_index) VALUES
    ('seed_n_general', v_user_id, 'General',
     '[{"id":"seed_n1","text":"Re-run the schema script after pulling","checked":true},
       {"id":"seed_n2","text":"Ask design about the empty state","checked":false},
       {"id":"seed_n3","text":"Book the quarterly review","checked":false}]'::jsonb, 0),
    ('seed_n_ideas', v_user_id, 'Ideas',
     '[{"id":"seed_n4","text":"Keyboard shortcut to start the last task","checked":false},
       {"id":"seed_n5","text":"Weekly email summary of tracked hours","checked":false},
       {"id":"seed_n6","text":"Pomodoro mode","checked":false}]'::jsonb, 1);

  ---------------------------------------------------------------------------
  -- Settings
  ---------------------------------------------------------------------------
  INSERT INTO public.user_settings (user_id, daily_target_minutes, working_days)
  VALUES (v_user_id, 420, '[1,2,3,4,5]'::jsonb)
  ON CONFLICT (user_id) DO UPDATE
    SET daily_target_minutes = EXCLUDED.daily_target_minutes,
        working_days         = EXCLUDED.working_days;

  RAISE NOTICE 'Done: % work sessions across % days.', v_seq, v_days;
END $$;
