import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Plus, AlertCircle } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { DatePicker } from './DatePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

/** Select value for "this work wasn't on the list yet". */
const NEW_TASK = '__new__';

/** Combine a yyyy-MM-dd date and an HH:mm time into an epoch timestamp. */
function toTimestamp(day: string, time: string): number | null {
  if (!day || !time) return null;
  const parsed = new Date(`${day}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

const labelClass = 'text-[11px] font-bold uppercase tracking-wider text-muted-foreground';
const fieldClass = 'w-full h-10 data-[size=default]:h-10 rounded-xl bg-card/50 border-foreground/10';

/**
 * Log work that wasn't tracked live — because the timer wasn't started, or
 * the task was never added at all. By default the task is also completed,
 * dated when the work ended, so it shows under that day in Completed.
 */
export function LogTimeDialog({ open, onOpenChange }: LogTimeDialogProps) {
  const { groups, addManualSession } = useApp();

  const [taskKey, setTaskKey] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskGroupId, setNewTaskGroupId] = useState('');
  const [day, setDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [completeTask, setCompleteTask] = useState(true);
  // Set on submit (the clock can't be read during render); cleared on edit.
  const [futureError, setFutureError] = useState<string | null>(null);
  const clearFuture = () => setFutureError(null);

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

  const isNew = taskKey === NEW_TASK;
  const selected = options.find((o) => o.key === taskKey) ?? null;
  const newTaskGroup = groups.find((g) => g.id === newTaskGroupId) ?? null;

  const start = toTimestamp(day, startTime);
  const end = toTimestamp(day, endTime);
  const durationSeconds =
    start !== null && end !== null && end > start
      ? Math.floor((end - start) / 1000)
      : 0;

  const error = !taskKey
    ? 'Pick a task.'
    : isNew && !newTaskName.trim()
      ? 'Name the task.'
      : isNew && !newTaskGroup
        ? 'Pick a group.'
        : start === null || end === null
          ? 'Enter a valid date and time.'
          : end <= start
            ? 'The end time must be after the start time.'
            : futureError;

  const reset = () => {
    setNotes('');
    setTaskKey('');
    setNewTaskName('');
    setCompleteTask(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (error || start === null || end === null) return;
    if (end > Date.now()) {
      setFutureError("You can't log time that hasn't happened yet.");
      return;
    }

    if (isNew) {
      if (!newTaskGroup) return;
      addManualSession({
        groupId: newTaskGroup.id,
        taskName: newTaskName,
        groupName: newTaskGroup.name,
        startTime: start,
        endTime: end,
        notes,
        completeTask,
      });
    } else {
      if (!selected) return;
      addManualSession({
        groupId: selected.groupId,
        taskId: selected.taskId,
        taskName: selected.label,
        groupName: selected.groupName,
        startTime: start,
        endTime: end,
        notes,
        completeTask,
      });
    }

    reset();
    onOpenChange(false);
  };

  const dayLabel =
    day === format(new Date(), 'yyyy-MM-dd')
      ? 'today'
      : day
        ? format(new Date(`${day}T00:00`), 'MMM d')
        : 'that day';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-foreground/10 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Clock className="w-5 h-5" />
            <DialogTitle>Log time manually</DialogTitle>
          </div>
          <DialogDescription>
            Forgot to start the timer, or never added the task? Add the work after the fact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="log-task" className={labelClass}>
              Task
            </label>
            <Select value={taskKey} onValueChange={setTaskKey}>
              <SelectTrigger id="log-task" className={fieldClass}>
                <SelectValue placeholder="Select a task…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_TASK}>
                  <Plus className="w-3.5 h-3.5" />
                  New task…
                </SelectItem>
                {groups
                  .filter((g) => g.tasks.length > 0)
                  .map((g) => (
                    <SelectGroup key={g.id}>
                      <SelectSeparator />
                      <SelectLabel>{g.name}</SelectLabel>
                      {g.tasks.map((t) => (
                        <SelectItem key={t.id} value={`${g.id}::${t.id}`}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {isNew && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <label htmlFor="log-new-name" className={labelClass}>
                  Task name
                </label>
                <Input
                  id="log-new-name"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="What did you work on?"
                  autoFocus
                  className="h-10 rounded-xl bg-card/50 border-foreground/10"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="log-new-group" className={labelClass}>
                  Group
                </label>
                <Select value={newTaskGroupId} onValueChange={setNewTaskGroupId}>
                  <SelectTrigger id="log-new-group" className={`${fieldClass} min-w-36`}>
                    <SelectValue placeholder="Group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="log-date" className={labelClass}>
              Date
            </label>
            <DatePicker
              id="log-date"
              value={day}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(d) => { setDay(d); clearFuture(); }}
              className="w-full h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="log-start" className={labelClass}>
                Start
              </label>
              <Input
                id="log-start"
                type="time"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); clearFuture(); }}
                className="bg-card/50 border-foreground/10 h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="log-end" className={labelClass}>
                End
              </label>
              <Input
                id="log-end"
                type="time"
                value={endTime}
                onChange={(e) => { setEndTime(e.target.value); clearFuture(); }}
                className="bg-card/50 border-foreground/10 h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="log-notes" className={labelClass}>
              Notes <span className="font-normal normal-case">(optional)</span>
            </label>
            <Textarea
              id="log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What did you work on?"
              className="bg-card/50 border-foreground/10 text-xs rounded-xl resize-y"
            />
          </div>

          <label
            htmlFor="log-complete"
            className="flex items-start justify-between gap-3 rounded-xl border border-foreground/10 bg-muted/20 px-3 py-2.5 cursor-pointer"
          >
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Mark task as completed</span>
              <span className="block text-[11px] text-muted-foreground">
                {completeTask
                  ? `Shows under ${dayLabel} in Completed. If you also worked on it later, it's dated then.`
                  : isNew
                    ? 'Adds the task to the group with this time, still open.'
                    : 'Adds the time; the task stays open.'}
              </span>
            </span>
            <Switch
              id="log-complete"
              checked={completeTask}
              onCheckedChange={setCompleteTask}
            />
          </label>

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
              {completeTask ? 'Log & complete' : 'Log time'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
