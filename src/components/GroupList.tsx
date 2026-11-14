import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Plus, FolderOpen, Trash2, Pin } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { TaskItem } from './TaskItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { MAX_PINNED_GROUPS } from '@/types';
import { TagFilterBar } from './TagFilterBar';
import { onFocusSearch, onNewTask } from '@/lib/uiEvents';

export function GroupList() {
  const {
    groups,
    runningTaskId,
    addGroup,
    removeGroup,
    reorderGroups,
    toggleGroupExpanded,
    toggleGroupPinned,
    pinnedGroupCount,
    addTask,
    reorderTasks,
  } = useApp();
  const [query, setQuery] = useState('');
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const visibleGroupsRef = useRef<typeof groups>([]);

  useEffect(() => onFocusSearch(() => searchRef.current?.focus()), []);

  // The "N" shortcut focuses the first visible group's add-task field,
  // expanding that group first when it is collapsed.
  useEffect(
    () =>
      onNewTask(() => {
        const first = visibleGroupsRef.current[0];
        if (!first) return;
        const needsExpand = first.expanded === false;
        if (needsExpand) toggleGroupExpanded(first.id);
        window.setTimeout(
          () => document.getElementById(`new-task-${first.id}`)?.focus(),
          needsExpand ? 450 : 0,
        );
      }),
    [toggleGroupExpanded],
  );

  const totalCount = useMemo(
    () => groups.reduce((n, g) => n + g.tasks.length, 0),
    [groups],
  );

  // Filter tasks, then drop groups left with nothing to show.
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle && activeTagIds.length === 0) return groups;

    return groups
      .map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => {
          const matchesText =
            !needle ||
            t.name.toLowerCase().includes(needle) ||
            (t.description ?? '').toLowerCase().includes(needle) ||
            g.name.toLowerCase().includes(needle);

          const matchesTags =
            activeTagIds.length === 0 ||
            activeTagIds.every((id) => (t.tagIds ?? []).includes(id));

          return matchesText && matchesTags;
        }),
      }))
      .filter((g) => g.tasks.length > 0);
  }, [groups, query, activeTagIds]);

  useEffect(() => {
    visibleGroupsRef.current = visibleGroups;
  }, [visibleGroups]);

  const matchCount = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.tasks.length, 0),
    [visibleGroups],
  );

  const isFiltering = query.trim().length > 0 || activeTagIds.length > 0;

  const toggleTagFilter = (tagId: string) =>
    setActiveTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );

  const clearFilters = () => {
    setQuery('');
    setActiveTagIds([]);
  };

  const [newGroupName, setNewGroupName] = useState('');
  const [newTaskNames, setNewTaskNames] = useState<Record<string, string>>({});

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (name) {
      addGroup(name);
      setNewGroupName('');
    }
  };

  const handleAddTask = (e: React.FormEvent, groupId: string) => {
    e.preventDefault();
    const name = (newTaskNames[groupId] ?? '').trim();
    if (name) {
      addTask(groupId, name);
      setNewTaskNames((prev) => ({ ...prev, [groupId]: '' }));
    }
  };

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed bg-muted/30">
          <CardContent>
            <form onSubmit={handleAddGroup} className="flex items-center gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Name your new group..."
                className="bg-background/50"
              />
              <Button type="submit" className="">
                <Plus className="w-4 h-4 mr-2" />
                Add Group
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
            <FolderOpen className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Create a group to organize your tasks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAddGroup}
        className="flex items-center gap-2 p-4 bg-muted/30 rounded-xl border"
      >
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="New group name..."
          className="bg-transparent border-none shadow-none focus-visible:ring-0"
        />
        <Button type="submit" size="sm" className="rounded-lg shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Group
        </Button>
      </form>

      <TagFilterBar
        query={query}
        onQueryChange={setQuery}
        activeTagIds={activeTagIds}
        onToggleTag={toggleTagFilter}
        onClear={clearFilters}
        searchRef={searchRef}
        matchCount={matchCount}
        totalCount={totalCount}
      />

      {isFiltering && visibleGroups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-muted/10 p-8 text-center">
          <p className="text-sm font-medium text-foreground/80">No matching tasks</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try a different search or clear the tag filters.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="mt-4 rounded-lg border-white/10"
          >
            Clear filters
          </Button>
        </div>
      )}

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {visibleGroups.map((group, groupIndex) => {
            const isRunningInGroup = group.tasks.some(
              (t) => t.id === runningTaskId,
            );
            const isExpanded = group.expanded !== false;

            return (
              <motion.div
                key={group.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  draggable={!isFiltering}
                  onDragStart={(e: React.DragEvent) => {
                    e.dataTransfer.setData('text/plain', `group:${groupIndex}`);
                    e.dataTransfer.effectAllowed = 'move';
                    (e.currentTarget as HTMLElement).classList.add(
                      'opacity-50',
                    );
                  }}
                  onDragEnd={(e: React.DragEvent) => {
                    (e.currentTarget as HTMLElement).classList.remove(
                      'opacity-50',
                    );
                  }}
                  onDragOver={(e: React.DragEvent) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e: React.DragEvent) => {
                    e.preventDefault();
                    const data = e.dataTransfer.getData('text/plain');
                    if (data.startsWith('group:')) {
                      const sourceIndex = parseInt(data.split(':')[1], 10);
                      if (sourceIndex !== groupIndex) {
                        reorderGroups(sourceIndex, groupIndex);
                      }
                    }
                  }}
                >
                  <Card
                    className={cn(
                      'overflow-hidden border-border/40 shadow-sm hover:shadow-lg gap-0 py-0',
                      isExpanded ? 'bg-card shadow-lg' : 'bg-card/40',
                      group.pinned && 'border-amber-500/25',
                      !isExpanded &&
                        isRunningInGroup &&
                        'running-group-highlight',
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleGroupExpanded(group.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroupExpanded(group.id);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left cursor-pointer group select-none"
                    >
                      <div className="relative flex items-center justify-center">
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                          <ChevronRight
                            className={cn(
                              'w-4 h-4 transition-colors',
                              isRunningInGroup
                                ? 'text-primary'
                                : 'text-muted-foreground group-hover:text-foreground',
                            )}
                          />
                        </motion.div>
                      </div>

                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <FolderOpen
                          className={cn(
                            'w-4.5 h-4.5 transition-all duration-500',
                            isExpanded || isRunningInGroup
                              ? 'text-primary scale-110'
                              : 'text-muted-foreground',
                          )}
                        />
                        <span
                          className={cn(
                            'font-bold tracking-tight truncate transition-colors',
                            isRunningInGroup
                              ? 'text-primary'
                              : 'text-foreground/90',
                          )}
                        >
                          {group.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 font-black text-primary/80 uppercase tracking-tighter shadow-inner">
                          {group.tasks.length}
                        </span>
                        {group.pinned && (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 font-black text-amber-300/90 uppercase tracking-tighter shrink-0">
                            <Pin className="w-2.5 h-2.5 fill-current" />
                            Pinned
                          </span>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupPinned(group.id);
                        }}
                        disabled={
                          !group.pinned && pinnedGroupCount >= MAX_PINNED_GROUPS
                        }
                        title={
                          group.pinned
                            ? 'Unpin group'
                            : pinnedGroupCount >= MAX_PINNED_GROUPS
                              ? `Only ${MAX_PINNED_GROUPS} groups can be pinned`
                              : 'Pin group to the top'
                        }
                        aria-pressed={Boolean(group.pinned)}
                        aria-label={group.pinned ? 'Unpin group' : 'Pin group'}
                        className={cn(
                          'h-8 w-8 rounded-full transition-all z-20',
                          group.pinned
                            ? 'text-amber-300 hover:bg-amber-500/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                        )}
                      >
                        <Pin
                          className={cn('w-3.5 h-3.5', group.pinned && 'fill-current')}
                        />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all z-20"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-white/5 backdrop-blur-xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                              This will delete "{group.name}" and all{' '}
                              {group.tasks.length} tasks within it. This action
                              is permanent.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              onClick={(e) => e.stopPropagation()}
                              className="bg-muted hover:bg-muted/80 border-none"
                            >
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeGroup(group.id)}
                              className="bg-destructive hover:bg-destructive/80 text-white border-none"
                            >
                              Delete Group
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{
                            height: 0,
                            opacity: 0,
                          }}
                          animate={{
                            height: 'auto',
                            opacity: 1,
                          }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: 0.4,
                            ease: [0.23, 1, 0.32, 1],
                          }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="px-4 pb-4 pt-0">
                            <div className="h-px bg-border/40 mb-6" />
                            <form
                              onSubmit={(e) => handleAddTask(e, group.id)}
                              className="flex gap-2 mb-6"
                            >
                              <Input
                                id={`new-task-${group.id}`}
                                value={newTaskNames[group.id] ?? ''}
                                onChange={(e) =>
                                  setNewTaskNames((prev) => ({
                                    ...prev,
                                    [group.id]: e.target.value,
                                  }))
                                }
                                placeholder="Add a new task..."
                                className="bg-muted/30 border-none shadow-none text-sm h-9"
                              />
                              <Button
                                type="submit"
                                size="icon"
                                variant="secondary"
                                className="h-9 w-9 shrink-0 rounded-lg"
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </form>

                            <div className="grid gap-2">
                              <AnimatePresence mode="popLayout" initial={false}>
                                {group.tasks.map((task, taskIndex) => (
                                  <div
                                    key={task.id}
                                    draggable={!isFiltering}
                                    onDragStart={(e: React.DragEvent) => {
                                      e.stopPropagation();
                                      e.dataTransfer.setData(
                                        'text/plain',
                                        `task:${group.id}:${taskIndex}`,
                                      );
                                      e.dataTransfer.effectAllowed = 'move';
                                      (
                                        e.currentTarget as HTMLElement
                                      ).classList.add('opacity-50');
                                    }}
                                    onDragEnd={(e: React.DragEvent) => {
                                      (
                                        e.currentTarget as HTMLElement
                                      ).classList.remove('opacity-50');
                                    }}
                                    onDragOver={(e: React.DragEvent) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e: React.DragEvent) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const data =
                                        e.dataTransfer.getData('text/plain');
                                      if (data.startsWith('task:')) {
                                        const [
                                          ,
                                          sourceGroupId,
                                          sourceTaskIndexStr,
                                        ] = data.split(':');
                                        const sourceTaskIndex = parseInt(
                                          sourceTaskIndexStr,
                                          10,
                                        );
                                        if (
                                          sourceGroupId === group.id &&
                                          sourceTaskIndex !== taskIndex
                                        ) {
                                          reorderTasks(
                                            group.id,
                                            sourceTaskIndex,
                                            taskIndex,
                                          );
                                        }
                                      }
                                    }}
                                  >
                                    <TaskItem
                                      groupId={group.id}
                                      task={task}
                                      isRunning={runningTaskId === task.id}
                                    />
                                  </div>
                                ))}
                              </AnimatePresence>
                              {group.tasks.length === 0 && (
                                <div className="text-center py-6 bg-muted/10 rounded-lg border border-dashed">
                                  <p className="text-xs text-muted-foreground font-medium">
                                    No tasks in this group.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
