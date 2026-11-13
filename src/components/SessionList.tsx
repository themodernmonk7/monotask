import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { Pencil, Trash2, Check, X, ListChecks } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDurationHuman } from '@/lib/analytics';
import { cn } from '@/lib/utils';

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
  const { sessions, updateSession, removeSession } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  const dayEntries = useMemo(
    () =>
      sessions
        .filter((s) => isSameDay(new Date(s.startTime), date))
        .sort((a, b) => a.startTime - b.startTime),
    [sessions, date],
  );

  const beginEdit = (id: string, startTime: number, endTime: number) => {
    setEditingId(id);
    setDraftStart(format(new Date(startTime), 'HH:mm'));
    setDraftEnd(format(new Date(endTime), 'HH:mm'));
  };

  const commitEdit = (id: string, originalStart: number) => {
    const day = format(new Date(originalStart), 'yyyy-MM-dd');
    const start = new Date(`${day}T${draftStart}`);
    const end = new Date(`${day}T${draftEnd}`);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      updateSession(id, { startTime: start.getTime(), endTime: end.getTime() });
    }
    setEditingId(null);
  };

  if (dayEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-muted/10 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          No recorded entries for this day.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <ListChecks className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Time entries
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          {dayEntries.length}
        </span>
      </div>

      <ul className="divide-y divide-white/5">
        {dayEntries.map((entry) => {
          const isEditing = editingId === entry.id;

          return (
            <li
              key={entry.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 group/entry transition-colors',
                isEditing ? 'bg-primary/5' : 'hover:bg-white/[0.02]',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground/90 truncate">
                  {entry.taskName}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {entry.groupName}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </p>
              </div>

              {isEditing ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Input
                    type="time"
                    value={draftStart}
                    onChange={(e) => setDraftStart(e.target.value)}
                    className="h-8 w-[104px] bg-background/50 border-primary/30 text-xs rounded-lg"
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input
                    type="time"
                    value={draftEnd}
                    onChange={(e) => setDraftEnd(e.target.value)}
                    className="h-8 w-[104px] bg-background/50 border-primary/30 text-xs rounded-lg"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => commitEdit(entry.id, entry.startTime)}
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
                      onClick={() => beginEdit(entry.id, entry.startTime, entry.endTime)}
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
    </div>
  );
}
