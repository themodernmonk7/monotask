import { Coffee, Check, Trash2 } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDurationHuman } from '@/lib/analytics';

/**
 * A timer that ran through a long absence gets confirmed rather than counted
 * silently — otherwise one forgotten timer quietly inflates the whole week.
 */
export function IdleDialog() {
  const { idlePrompt, resolveIdle } = useApp();

  return (
    <Dialog
      open={Boolean(idlePrompt)}
      onOpenChange={(open) => {
        // Dismissing without choosing is treated as discarding the idle time,
        // which is the safer default for a timesheet.
        if (!open && idlePrompt) resolveIdle('discard');
      }}
    >
      <DialogContent className="sm:max-w-md bg-card border-white/10 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Coffee className="w-5 h-5" />
            <DialogTitle>Were you still working?</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground leading-relaxed">
            The timer for{' '}
            <span className="font-semibold text-foreground">
              {idlePrompt?.taskName}
            </span>{' '}
            kept running for{' '}
            <span className="font-mono font-bold text-amber-400">
              {formatDurationHuman(idlePrompt?.idleSeconds ?? 0)}
            </span>{' '}
            while Monotask was in the background.
          </DialogDescription>
        </DialogHeader>

        {idlePrompt && (
          <p className="text-[11px] text-muted-foreground/80 -mt-1">
            Away since{' '}
            {new Date(idlePrompt.since).toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            onClick={() => resolveIdle('discard')}
            variant="outline"
            className="flex-1 rounded-xl gap-2 border-white/10"
          >
            <Trash2 className="w-4 h-4" />
            Discard the time
          </Button>
          <Button
            onClick={() => resolveIdle('keep')}
            className="flex-1 rounded-xl gap-2 font-bold"
          >
            <Check className="w-4 h-4" />
            Keep it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
