import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Plus, AlertCircle } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDurationHuman } from '@/lib/analytics';

interface LogTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Combine a yyyy-MM-dd date and an HH:mm time into an epoch timestamp. */
function toTimestamp(day: string, time: string): number | null {
  if (!day || !time) return null;
  const parsed = new Date(`${day}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/**
 * Log work that wasn't tracked live — the single most common real-world gap
 * in any timer, because people forget to press start.
 */
export function LogTimeDialog({ open, onOpenChange }: LogTimeDialogProps) {
  const { groups, addManualSession } = useApp();

  const [taskKey, setTaskKey] = useState('');
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');

  const options = useMemo(
    () =>
      groups.flatMap((g) =>
        g.tasks.map((t) => ({
          key: `${g.id}::${t.id}`,
          groupId: g.id,
          taskId: t.id,
          label: t.name,
          groupName: g.name,
        })),
      ),
    [groups],
  );

  const selected = options.find((o) => o.key === taskKey) ?? null;

  const start = toTimestamp(day, startTime);
  const end = toTimestamp(day, endTime);
  const durationSeconds =
    start !== null && end !== null && end > start
      ? Math.floor((end - start) / 1000)
      : 0;

  const error =
    !selected
      ? 'Pick a task.'
      : start === null || end === null
        ? 'Enter a valid date and time.'
        : end <= start
          ? 'The end time must be after the start time.'
          : null;

  const reset = () => {
    setNotes('');
    setTaskKey('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error || !selected || start === null || end === null) return;

    addManualSession({
      groupId: selected.groupId,
      taskId: selected.taskId,
      taskName: selected.label,
      groupName: selected.groupName,
      startTime: start,
      endTime: end,
      notes,
    });

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Clock className="w-5 h-5" />
            <DialogTitle>Log time manually</DialogTitle>
          </div>
          <DialogDescription>
            Forgot to start the timer? Add the session after the fact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="log-task"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Task
            </label>
            <select
              id="log-task"
              value={taskKey}
              onChange={(e) => setTaskKey(e.target.value)}
              className="w-full h-10 rounded-xl bg-card/50 border border-white/10 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="">Select a task…</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.tasks.map((t) => (
                    <option key={t.id} value={`${g.id}::${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {options.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Add a task first — manual entries attach to an existing task.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="log-date"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Date
            </label>
            <Input
              id="log-date"
              type="date"
              value={day}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setDay(e.target.value)}
              className="bg-card/50 border-white/10 h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="log-start"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Start
              </label>
              <Input
                id="log-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-card/50 border-white/10 h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="log-end"
                className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                End
              </label>
              <Input
                id="log-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-card/50 border-white/10 h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="log-notes"
              className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Notes <span className="font-normal normal-case">(optional)</span>
            </label>
            <Textarea
              id="log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What did you work on?"
              className="bg-card/50 border-white/10 text-xs rounded-xl resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            {error ? (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Adds{' '}
                <span className="font-mono font-bold text-primary">
                  {formatDurationHuman(durationSeconds)}
                </span>
              </span>
            )}

            <Button
              type="submit"
              disabled={Boolean(error)}
              className="rounded-xl gap-2 font-bold shrink-0"
            >
              <Plus className="w-4 h-4" />
              Log time
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
