import { AnimatePresence, motion } from 'motion/react';
import { Undo2, X } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';

/** Bottom-centred affordance for reversing the last destructive action. */
export function UndoToast() {
  const { undoLabel, undo, dismissUndo } = useApp();

  return (
    <AnimatePresence>
      {undoLabel && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl pl-4 pr-2 py-2.5"
        >
          <span className="text-xs text-foreground/90 font-medium max-w-[50vw] truncate">
            {undoLabel}
          </span>

          <Button
            size="xs"
            onClick={undo}
            className="rounded-lg gap-1.5 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25 font-bold"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={dismissUndo}
            title="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
