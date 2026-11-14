import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TimerController } from './TimerController';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/useApp';
import { Trash2, Check, Pencil, Tag, X, AlignLeft, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TAG_CHIP_CLASSES } from '@/lib/tagColors';
import { TagPicker } from './TagPicker';
import { onRevealTask, taskElementId } from '@/lib/uiEvents';
import type { Task } from '@/types';
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
  task: Task;
  isRunning: boolean;
}

export function TaskItem({ groupId, task, isRunning }: TaskItemProps) {
  const {
    removeTask,
    updateTaskName,
    updateTaskDescription,
    toggleTaskTag,
    moveTask,
    groups,
    tags: tagLibrary,
  } = useApp();

  const { id: taskId, name: taskName, elapsedSeconds } = task;
  const tagIds = useMemo(() => task.tagIds ?? [], [task.tagIds]);

  // Resolve ids against the shared library; ids with no tag are simply skipped.
  const tags = useMemo(
    () =>
      tagIds
        .map((id) => tagLibrary.find((t) => t.id === id))
        .filter((t): t is (typeof tagLibrary)[number] => Boolean(t)),
    [tagIds, tagLibrary],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(taskName);
  const inputRef = useRef<HTMLInputElement>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draftDescription, setDraftDescription] = useState(task.description ?? '');

  const [highlighted, setHighlighted] = useState(false);
  const highlightTimeout = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onRevealTask((detail) => {
      if (detail.taskId !== taskId) return;
      setHighlighted(true);
      if (highlightTimeout.current) window.clearTimeout(highlightTimeout.current);
      highlightTimeout.current = window.setTimeout(() => setHighlighted(false), 1800);
    });
    return () => {
      unsubscribe();
      if (highlightTimeout.current) window.clearTimeout(highlightTimeout.current);
    };
  }, [taskId]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Keep the draft in step when the task changes underneath us (e.g. a rollback).
  useEffect(() => {
    setDraftDescription(task.description ?? '');
  }, [task.description]);

  useEffect(() => {
    setEditedName(taskName);
  }, [taskName]);

  const handleUpdateName = () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== taskName) {
      updateTaskName(groupId, taskId, trimmed);
    }
    setIsEditing(false);
  };

  const commitDescription = () => {
    if (draftDescription.trim() !== (task.description ?? '').trim()) {
      updateTaskDescription(groupId, taskId, draftDescription);
    }
  };

  const hasDetails = Boolean(task.description) || tags.length > 0;

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
      id={taskElementId(taskId)}
      className={cn(
        'flex flex-col gap-3 py-3 px-4 rounded-xl border transition-all duration-500 group/task relative overflow-hidden scroll-mt-24',
        isRunning
          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-[0_0_20px_-5px_oklch(var(--primary)_/_15%)]'
          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10',
        highlighted && 'ring-2 ring-primary/70 border-primary/60',
      )}
    >
      <div className="flex flex-col items-start md:items-center md:flex-row justify-between gap-4 w-full">
        <div className="flex items-center gap-3 min-w-0 flex-1 relative z-10">
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-500 shrink-0',
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
                className="h-6 w-6 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
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

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-label={detailsOpen ? 'Hide task details' : 'Add description and tags'}
            title={detailsOpen ? 'Hide details' : 'Description & tags'}
            className={cn(
              'h-8 w-8 rounded-full transition-all',
              detailsOpen || hasDetails
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>

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
      </div>

      {/* Compact summary when details are collapsed */}
      {!detailsOpen && hasDetails && (
        <div className="relative z-10 flex flex-col gap-2 pl-[18px]">
          {task.description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-wrap">
              {task.description}
            </p>
          )}
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className={cn(
                    'px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-tight',
                    TAG_CHIP_CLASSES[tag.color],
                  )}
                >
                  {tag.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Editor */}
      <AnimatePresence initial={false}>
        {detailsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            style={{ overflow: 'hidden' }}
            className="relative z-10"
          >
            <div className="pt-1 pl-[18px] space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor={`desc-${taskId}`}
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <AlignLeft className="w-3 h-3 text-primary" />
                  Description
                </label>
                <Textarea
                  id={`desc-${taskId}`}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onBlur={commitDescription}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setDraftDescription(task.description ?? '');
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="What does done look like?"
                  rows={3}
                  className="bg-background/40 border-white/10 text-xs rounded-xl resize-y min-h-[64px]"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-primary" />
                  Tags
                </span>

                {tags.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <li
                        key={tag.id}
                        className={cn(
                          'pl-2 pr-1 py-0.5 rounded-full border text-[10px] font-bold tracking-tight flex items-center gap-1',
                          TAG_CHIP_CLASSES[tag.color],
                        )}
                      >
                        {tag.label}
                        <button
                          type="button"
                          onClick={() => toggleTaskTag(groupId, taskId, tag.id)}
                          aria-label={`Remove tag ${tag.label}`}
                          className="rounded-full p-0.5 hover:bg-white/15 transition-colors cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <TagPicker
                  selectedIds={tagIds}
                  onToggle={(tagId) => toggleTaskTag(groupId, taskId, tagId)}
                />
              </div>

              {groups.length > 1 && (
                <div className="space-y-1.5">
                  <label
                    htmlFor={`move-${taskId}`}
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <FolderInput className="w-3 h-3 text-primary" />
                    Move to group
                  </label>
                  <select
                    id={`move-${taskId}`}
                    value={groupId}
                    onChange={(e) => moveTask(groupId, e.target.value, taskId)}
                    className="w-full h-8 rounded-lg bg-background/40 border border-white/10 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.id === groupId ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle background glow for running task */}
      {isRunning && (
        <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
      )}
    </motion.li>
  );
}
