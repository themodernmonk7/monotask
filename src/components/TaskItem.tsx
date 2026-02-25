import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { TimerController } from './TimerController';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/useApp';
import { Trash2, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TaskItemProps {
  groupId: string;
  taskId: string;
  taskName: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

export function TaskItem({
  groupId,
  taskId,
  taskName,
  elapsedSeconds,
  isRunning,
}: TaskItemProps) {
  const { removeTask, updateTaskName } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(taskName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleUpdateName = () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== taskName) {
      updateTaskName(groupId, taskId, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
      }}
      className={cn(
        'flex flex-col items-start md:items-center md:flex-row  justify-between gap-4 py-3 px-4 rounded-xl border transition-all duration-500 group/task relative overflow-hidden',
        isRunning
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-[0_0_20px_-5px_oklch(var(--primary)_/_15%)]'
          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10',
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 relative z-10">
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full transition-all duration-500',
            isRunning
              ? 'bg-primary animate-pulse scale-125 shadow-[0_0_8px_oklch(var(--primary))]'
              : 'bg-muted-foreground/30',
          )}
        />

        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Input
              ref={inputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateName();
                if (e.key === 'Escape') {
                  setEditedName(taskName);
                  setIsEditing(false);
                }
              }}
              onBlur={handleUpdateName}
              className="h-8 bg-background/50 border-primary/30 focus-visible:ring-primary/20"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary"
              onClick={handleUpdateName}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0 group/name">
            <p
              className={cn(
                'font-semibold tracking-tight truncate transition-colors cursor-text text-wrap break-all',
                isRunning
                  ? 'text-primary'
                  : 'text-foreground/90 group-hover/task:text-foreground',
              )}
              onClick={() => setIsEditing(true)}
            >
              {taskName}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover/name:opacity-100 transition-opacity"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between md:justify-end gap-3 relative z-10 w-full md:w-fit shrink-0">
        <TimerController
          groupId={groupId}
          taskId={taskId}
          elapsedSeconds={elapsedSeconds}
          isRunning={isRunning}
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-white/5 backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Task?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will permanently remove "{taskName}". This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-muted hover:bg-muted/80 border-none">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removeTask(groupId, taskId)}
                className="bg-destructive hover:bg-destructive/80 text-white border-none"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Subtle background glow for running task */}
      {isRunning && (
        <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
      )}
    </motion.li>
  );
}
