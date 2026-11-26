import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { ListChecks } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { TimeEntryList } from './TimeEntryList';

interface SessionListProps {
  /** Day to show entries for. */
  date: Date;
}

/**
 * The day's recorded sessions, editable in place.
 *
 * Only real `sessions` rows appear here — `allSessions` also contains
 * synthesised slices (live timer, unrecorded task time, legacy completions)
 * which have no database row and therefore cannot be edited.
 */
export function SessionList({ date }: SessionListProps) {
  const { sessions } = useApp();

  const dayEntries = useMemo(
    () =>
      sessions
        .filter((s) => isSameDay(new Date(s.startTime), date))
        .sort((a, b) => a.startTime - b.startTime),
    [sessions, date],
  );

  if (dayEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-foreground/10 bg-muted/10 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          No recorded entries for this day.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/5 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5">
        <ListChecks className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Time entries
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          {dayEntries.length}
        </span>
      </div>
      <TimeEntryList entries={dayEntries} label="task" />
    </div>
  );
}
