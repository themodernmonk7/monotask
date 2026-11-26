import { useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Trash2, Check, X, Radio } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDurationHuman } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { WorkSession } from '@/types';

interface TimeEntryListProps {
  /** Recorded entries, in the order to show them. */
  entries: WorkSession[];
  /** Name the task on each row (a day's list), or the date (one task's list). */
  label: 'task' | 'date';
  /** The timer running right now, shown as a live row on top. */
  live?: { startTime: number; seconds: number } | null;
  className?: string;
}

/**
 * Time entries, editable in place. Every start/pause of a timer is its own
 * entry, so a task restarted three times lists three rows.
 *
 * Only real session rows appear here; the live row is display-only until the
 * timer is paused and it becomes an entry.
 */
export function TimeEntryList({ entries, label, live, className }: TimeEntryListProps) {
  const { updateSession, removeSession } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  const beginEdit = (entry: WorkSession) => {
    setEditingId(entry.id);
    setDraftStart(format(new Date(entry.startTime), 'HH:mm'));
    setDraftEnd(format(new Date(entry.endTime), 'HH:mm'));
  };

  const commitEdit = (entry: WorkSession) => {
    const day = format(new Date(entry.startTime), 'yyyy-MM-dd');
    const start = new Date(`${day}T${draftStart}`);
    const end = new Date(`${day}T${draftEnd}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      updateSession(entry.id, { startTime: start.getTime(), endTime: end.getTime() });
    }
    setEditingId(null);
  };

  return (
    <ul className={cn('divide-y divide-foreground/5', className)}>
      {live && (
        <li className="flex items-center gap-3 px-4 py-2.5 bg-primary/5">
          <div className="min-w-0 flex-1 flex items-center gap-2 text-primary">
            <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
            <span className="text-sm font-medium">Running</span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
            {format(new Date(live.startTime), 'h:mm a')} – now
          </span>
          <span className="font-mono text-xs font-bold text-primary tabular-nums w-16 text-right">
            {formatDurationHuman(live.seconds)}
          </span>
          <span className="w-[60px]" aria-hidden />
        </li>
      )}

      {entries.map((entry) => {
        const isEditing = editingId === entry.id;
        return (
          <li
            key={entry.id}
            data-entry-id={entry.id}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 group/entry transition-colors',
              isEditing ? 'bg-primary/5' : 'hover:bg-foreground/[0.02]',
            )}
          >
            <div className="min-w-0 flex-1">
              {label === 'task' ? (
                <>
                  <p className="text-sm font-medium text-foreground/90 truncate">
                    {entry.taskName}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {entry.groupName}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground/90 truncate">
                    {format(new Date(entry.startTime), 'EEE, MMM d')}
                  </p>
                  {entry.notes && (
                    <p className="text-[11px] text-muted-foreground truncate">{entry.notes}</p>
                  )}
                </>
              )}
            </div>

            {isEditing ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type="time"
                  aria-label="Start time"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="h-8 w-[104px] bg-background/50 border-primary/30 text-xs rounded-lg"
                />
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="time"
                  aria-label="End time"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="h-8 w-[104px] bg-background/50 border-primary/30 text-xs rounded-lg"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => commitEdit(entry)}
                  title="Save"
                  className="text-primary hover:bg-primary/10"
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  title="Cancel"
                  className="text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
                  {format(new Date(entry.startTime), 'h:mm a')} –{' '}
                  {format(new Date(entry.endTime), 'h:mm a')}
                </span>
                <span className="font-mono text-xs font-bold text-foreground tabular-nums w-16 text-right">
                  {formatDurationHuman(entry.durationSeconds)}
                </span>

                <div className="flex items-center gap-0.5 opacity-0 group-hover/entry:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => beginEdit(entry)}
                    title="Edit times"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeSession(entry.id)}
                    title="Delete entry"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
