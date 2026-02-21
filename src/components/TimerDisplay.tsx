import { formatElapsed } from "../lib/time"
import { cn } from "@/lib/utils"

interface TimerDisplayProps {
  elapsedSeconds: number
  isRunning?: boolean
  className?: string
}

export function TimerDisplay({ elapsedSeconds, isRunning, className }: TimerDisplayProps) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums text-sm tracking-tight",
        isRunning ? "text-primary font-bold" : "text-muted-foreground font-medium",
        className
      )}
    >
      {formatElapsed(elapsedSeconds)}
    </span>
  )
}
