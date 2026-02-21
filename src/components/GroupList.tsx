import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Plus, FolderOpen, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
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

export function GroupList() {
  const {
    groups,
    runningTaskId,
    addGroup,
    removeGroup,
    toggleGroupExpanded,
    addTask,
  } = useApp();
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

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {groups.map((group) => {
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
                <Card
                  className={cn(
                    'overflow-hidden transition-all duration-500 border-border/40 shadow-sm hover:shadow-lg',
                    isExpanded ? 'bg-card shadow-lg' : 'bg-card/40',
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
                    className="w-full flex items-center gap-3 pb-4 px-5 text-left transition-all cursor-pointer group select-none"
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
                    </div>

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
                            {group.tasks.length} tasks within it. This action is
                            permanent.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-muted hover:bg-muted/80 border-none">
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
                          filter: 'blur(10px)',
                        }}
                        animate={{
                          height: 'auto',
                          opacity: 1,
                          filter: 'blur(0px)',
                        }}
                        exit={{ height: 0, opacity: 0, filter: 'blur(10px)' }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                      >
                        <div className="px-5 pb-5 pt-0 space-y-6">
                          <div className="h-px bg-border/40 mb-4" />
                          <form
                            onSubmit={(e) => handleAddTask(e, group.id)}
                            className="flex gap-2"
                          >
                            <Input
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
                              {group.tasks.map((task) => (
                                <TaskItem
                                  key={task.id}
                                  groupId={group.id}
                                  taskId={task.id}
                                  taskName={task.name}
                                  elapsedSeconds={task.elapsedSeconds}
                                  isRunning={runningTaskId === task.id}
                                />
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
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
