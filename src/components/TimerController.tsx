import { Play, Pause, Check } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { TimerDisplay } from './TimerDisplay';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';

interface TimerControllerProps {
  groupId: string;
  taskId: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

export function TimerController({
  groupId,
  taskId,
  elapsedSeconds,
  isRunning,
}: TimerControllerProps) {
  const { startTask, pauseTask, markTaskDone } = useApp();

  return (
    <div className="flex items-center gap-3">
      <TimerDisplay elapsedSeconds={elapsedSeconds} isRunning={isRunning} />

      <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] rounded-full border border-white/5 transition-all duration-500 hover:border-white/10 group-hover/task:bg-white/[0.05]">
        <Button
          variant="ghost"
          size="icon"
          onDoubleClick={() => markTaskDone(groupId, taskId)}
          className="h-8 w-8 rounded-full text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
          title="Double click to mark as done"
        >
          <Check className="w-4 h-4" />
        </Button>
        <AnimatePresence mode="wait">
          {isRunning ? (
            <motion.div
              key="pause"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => pauseTask()}
                className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400 transition-all"
                title="Pause"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => startTask(groupId, taskId)}
                className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-all"
                title="Start"
              >
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
