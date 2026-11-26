import { useMemo, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';
import { TimeEntryList } from './TimeEntryList';

interface TaskEntriesProps {
  /** Entries of an open task… */
  taskId?: string;
  /** …or of a completed one. */
  completedTaskId?: string;
  className?: string;
}

/**
 * A task's time entries behind an "N entries" toggle. Each start → pause of
 * the timer is one entry, so restarting a task adds a row rather than
 * stretching the previous one.
 */
export function TaskEntries({ taskId, completedTaskId, className }: TaskEntriesProps) {
  const { sessions, allSessions } = useApp();
  const [open, setOpen] = useState(false);

  const entries = useMemo(
    () =>
      sessions
        .filter((s) =>
          completedTaskId ? s.completedTaskId === completedTaskId : s.taskId === taskId,
        )
        .sort((a, b) => b.startTime - a.startTime), // newest first
    [sessions, taskId, completedTaskId],
  );

  const liveSlice = taskId
    ? allSessions.find((s) => s.id === `active-live-${taskId}`)
    : undefined;
  const live = liveSlice
    ? { startTime: liveSlice.startTime, seconds: liveSlice.durationSeconds }
    : null;

  const count = entries.length + (live ? 1 : 0);
  if (count === 0) return null;

  return (
    <div className={cn('relative z-10', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="w-3 h-3" />
        {count} {count === 1 ? 'entry' : 'entries'}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-foreground/5 bg-card/40 overflow-hidden">
          <TimeEntryList entries={entries} label="date" live={live} />
        </div>
      )}
    </div>
  );
}
