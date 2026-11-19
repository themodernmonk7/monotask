import { useState, useRef } from 'react';
import { Play, Pause, Check } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { TimerDisplay } from './TimerDisplay';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TimerControllerProps {
  groupId: string;
  taskId: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

/**
 * Start/Pause and "mark done" used to be two same-shaped circular icon
 * buttons sitting right next to each other — and Done only fired on a
 * DOUBLE click, which a plain first click gave no sign of, so clicking twice
 * (as anyone does when nothing seems to happen) silently completed the task.
 *
 * Fixed on both counts: Start/Pause is now a labeled pill (not icon-only, so
 * it never reads as "the same button" as Done), Done is a small square
 * outline button — a different shape, separated by a visible divider — and
 * it responds to a single, ordinary click. Safety for that single click
 * comes from the existing undo toast (markTaskDone already calls
 * offerUndo), not from a confirmation dialog that would slow down the
 * common case.
 */
export function TimerController({
  groupId,
  taskId,
  elapsedSeconds,
  isRunning,
}: TimerControllerProps) {
  const { startTask, pauseTask, markTaskDone } = useApp();
  const [pulse, setPulse] = useState(0);
  const pulseTimeout = useRef<number | null>(null);

  const handleMarkDone = () => {
    markTaskDone(groupId, taskId);
    // Purely decorative — a quick ring confirms the click landed, independent
    // of whether the row is about to animate out.
    setPulse((p) => p + 1);
    if (pulseTimeout.current) window.clearTimeout(pulseTimeout.current);
    pulseTimeout.current = window.setTimeout(() => setPulse(0), 500);
  };

  return (
    <div className="flex items-center gap-3">
      <TimerDisplay elapsedSeconds={elapsedSeconds} isRunning={isRunning} />

      <div className="flex items-center gap-2">
        <AnimatePresence mode="wait">
          {isRunning ? (
            <motion.div
              key="pause"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => pauseTask()}
                className="h-8 rounded-full gap-1.5 px-3 text-xs font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400 transition-all"
                title="Pause"
              >
                <Pause className="w-3 h-3 fill-current" />
                Pause
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startTask(groupId, taskId)}
                className="h-8 rounded-full gap-1.5 px-3 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                title="Start"
              >
                <Play className="w-3 h-3 fill-current" />
                Start
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <Separator orientation="vertical" className="h-5 bg-white/10" />

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMarkDone}
            className="h-8 w-8 rounded-lg border border-white/10 text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all"
            title="Mark as done"
            aria-label="Mark as done"
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          {pulse > 0 && (
            <motion.span
              key={pulse}
              initial={{ opacity: 0.8, scale: 0.85 }}
              animate={{ opacity: 0, scale: 1.3 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={cn(
                'absolute inset-0 rounded-lg border-2 border-primary pointer-events-none',
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
