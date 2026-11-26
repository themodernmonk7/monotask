import { useState, useRef, useEffect, useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import {
  groupByDate,
  formatDateHeader,
  formatDuration,
  formatElapsed,
  parseElapsed,
} from '../lib/time';
import type { CompletedTask } from '../types';
import {
  Calendar,
  FolderOpen,
  Pencil,
  History,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Undo2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/hooks/useApp';
import { DatePicker } from './DatePicker';
import { TaskEntries } from './TaskEntries';
import { cn } from '@/lib/utils';

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** Which completed tasks to show: one calendar day (default today), or all. */
type DateFilter = { mode: 'day'; day: string } | { mode: 'all' };

function groupByGroupName(
  tasks: CompletedTask[],
): Map<string, CompletedTask[]> {
  const map = new Map<string, CompletedTask[]>();
  for (const task of tasks) {
    const list = map.get(task.groupName) ?? [];
    list.push(task);
    map.set(task.groupName, list);
  }
  return map;
}

function CompletedTaskRow({
  task,
  onUpdateName,
  onUpdateTime,
  onReopen,
}: {
  task: CompletedTask;
  onUpdateName: (id: string, name: string) => void;
  onUpdateTime: (id: string, totalSeconds: number) => void;
  onReopen: (id: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [nameVal, setNameVal] = useState(task.taskName);
  const [timeVal, setTimeVal] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  useEffect(() => {
    if (editingTime) {
      timeInputRef.current?.focus();
      timeInputRef.current?.select();
    }
  }, [editingTime]);

  const startEditingTime = () => {
    setTimeVal(formatElapsed(task.totalSeconds));
    setEditingTime(true);
  };

  const handleSaveName = () => {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== task.taskName) {
      onUpdateName(task.id, trimmed);
    } else {
      setNameVal(task.taskName);
    }
    setEditingName(false);
  };

  const handleSaveTime = () => {
    const seconds = parseElapsed(timeVal.trim());
    if (seconds !== task.totalSeconds && seconds >= 0) {
      onUpdateTime(task.id, seconds);
    }
    setEditingTime(false);
  };

  return (
    <motion.li
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      className="px-4 py-2.5 space-y-2 group/row"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/60 shrink-0" />

          {editingName ? (
            <Input
              ref={nameInputRef}
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setNameVal(task.taskName);
                  setEditingName(false);
                }
              }}
              className="h-8 py-0 bg-muted/50 focus-visible:ring-primary/20"
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1 group/name">
              <span
                className="font-medium text-foreground/80 truncate cursor-text hover:text-foreground transition-colors text-wrap"
                onClick={() => {
                  setNameVal(task.taskName);
                  setEditingName(true);
                }}
              >
                {task.taskName}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setNameVal(task.taskName);
                  setEditingName(true);
                }}
                className="h-6 w-6 opacity-0 group-hover/name:opacity-100 transition-opacity"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editingTime ? (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                <Input
                  ref={timeInputRef}
                  value={timeVal}
                  onChange={(e) => setTimeVal(e.target.value)}
                  onBlur={handleSaveTime}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTime();
                    if (e.key === 'Escape') setEditingTime(false);
                  }}
                  placeholder="00:00:00"
                  className="w-24 h-8 px-2 text-xs font-mono bg-muted text-right"
                />
              </div>
              <span className="text-[8px] font-bold text-muted-foreground/50 uppercase tracking-tighter">
                HH:MM:SS
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatDuration(task.totalSeconds)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={startEditingTime}
                title="Edit total time"
                className="h-7 w-7 rounded-full text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-all hover:bg-muted"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onReopen(task.id)}
                title="Move back to tasks"
                aria-label="Move back to tasks"
                className="h-7 w-7 rounded-full text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-all hover:bg-muted hover:text-primary"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <TaskEntries completedTaskId={task.id} className="pl-[26px]" />
    </motion.li>
  );
}

export function CompletedTasks() {
  const {
    completedTasks: tasks,
    updateCompletedTask,
    updateCompletedTaskName,
    reopenCompletedTask,
  } = useApp();
  const [filter, setFilter] = useState<DateFilter>(() => ({
    mode: 'day',
    day: dayKey(new Date()),
  }));

  const byDate = useMemo(() => groupByDate(tasks), [tasks]);
  const today = dayKey(new Date());

  const sortedDates = useMemo(() => {
    const all = Array.from(byDate.keys()).sort((a, b) => (a > b ? -1 : 1));
    return filter.mode === 'all' ? all : all.filter((k) => k === filter.day);
  }, [byDate, filter]);

  const shiftDay = (delta: number) => {
    const base = filter.mode === 'day' ? parseISO(filter.day) : new Date();
    const next = dayKey(addDays(base, delta));
    if (next > today) return; // nothing can be completed in the future
    setFilter({ mode: 'day', day: next });
  };

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => shiftDay(-1)}
          aria-label="Previous day"
          title="Previous day"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <DatePicker
          aria-label="Completed on"
          value={filter.mode === 'day' ? filter.day : ''}
          max={today}
          placeholder="All dates"
          displayFormat="EEE, MMM d"
          onChange={(day) => setFilter({ mode: 'day', day })}
          className="h-8 w-40 text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => shiftDay(1)}
          disabled={filter.mode === 'day' && filter.day >= today}
          aria-label="Next day"
          title="Next day"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={filter.mode === 'day' && filter.day === today}
          onClick={() => setFilter({ mode: 'day', day: today })}
          className={cn(
            'h-7 px-3 text-xs',
            filter.mode === 'day' && filter.day === today && 'bg-background shadow-sm',
          )}
        >
          Today
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={filter.mode === 'all'}
          onClick={() => setFilter({ mode: 'all' })}
          className={cn('h-7 px-3 text-xs', filter.mode === 'all' && 'bg-background shadow-sm')}
        >
          All dates
        </Button>
      </div>
    </div>
  );

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
          <History className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground/80">No history yet</h3>
          <p className="text-sm text-muted-foreground max-w-[200px]">
            Tasks you complete will appear here.
          </p>
        </div>
      </div>
    );
  }

  if (sortedDates.length === 0) {
    const label =
      filter.mode === 'day' && filter.day === today
        ? 'today'
        : filter.mode === 'day'
          ? `on ${format(parseISO(filter.day), 'MMM d, yyyy')}`
          : '';
    return (
      <div className="space-y-8 pb-10">
        {filterBar}
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
          <History className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tasks completed {label}.</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => setFilter({ mode: 'all' })}
            className="text-xs"
          >
            Show all dates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {filterBar}
      {sortedDates.map((dateKey) => {
        const items = byDate.get(dateKey)!;
        const first = items[0];
        const headerDate = formatDateHeader(first.completedAt);
        const byGroup = groupByGroupName(items);
        const groupNames = Array.from(byGroup.keys()).sort();

        return (
          <section key={dateKey} className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <Calendar className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground">
                {headerDate}
              </h2>
              <div className="h-px bg-muted flex-1" />
            </div>

            <div className="space-y-4">
              {groupNames.map((groupName) => {
                const groupTasks = byGroup.get(groupName)!;
                const totalGroupSeconds = groupTasks.reduce(
                  (sum, t) => sum + t.totalSeconds,
                  0,
                );
                return (
                  <Card
                    key={groupName}
                    className="overflow-hidden border-border/40 shadow-sm bg-card/50 gap-4 py-4 pt-0"
                  >
                    <div className="p-4 bg-muted/20 border-b border-border/40 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {groupName}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 font-black text-primary/80 uppercase tracking-tighter shadow-inner">
                          {groupTasks.length}
                        </span>
                      </div>
                      <p className="text-xs font-bold tracking-wider capitalize">
                        Total time:
                        <span className="font-mono text-sm text-muted-foreground tabular-nums ml-2">
                          {formatDuration(totalGroupSeconds)}
                        </span>
                      </p>
                    </div>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-border/20">
                        {groupTasks.map((task) => (
                          <CompletedTaskRow
                            key={task.id}
                            task={task}
                            onUpdateName={updateCompletedTaskName}
                            onUpdateTime={updateCompletedTask}
                            onReopen={reopenCompletedTask}
                          />
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
