import { formatElapsed } from "../lib/time"
import { cn } from "../lib/utils"

interface TimerDisplayProps {
  elapsedSeconds: number
  isRunning?: boolean
  className?: string
}

export function TimerDisplay({ elapsedSeconds, isRunning, className }: TimerDisplayProps) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums text-sm",
        isRunning && "text-emerald-600 dark:text-emerald-400 font-medium",
        className
      )}
    >
      {formatElapsed(elapsedSeconds)}
    </span>
  )
}
