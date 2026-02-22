import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
}: {
  task: CompletedTask;
  onUpdateName: (id: string, name: string) => void;
  onUpdateTime: (id: string, totalSeconds: number) => void;
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
      className="px-4 py-2.5 flex items-center justify-between gap-4 group/row"
    >
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
              className="font-medium text-foreground/80 truncate cursor-text hover:text-foreground transition-colors"
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
              className="h-7 w-7 rounded-full text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-all hover:bg-muted"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

export function CompletedTasks() {
  const {
    completedTasks: tasks,
    updateCompletedTask,
    updateCompletedTaskName,
  } = useApp();
  const byDate = groupByDate(tasks);
  const sortedDates = Array.from(byDate.keys()).sort((a, b) =>
    a > b ? -1 : 1,
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

  return (
    <div className="space-y-8 pb-10">
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
