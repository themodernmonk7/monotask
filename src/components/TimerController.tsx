import { Play, Pause, Check } from "lucide-react"
import { useApp } from "../context/AppContext"
import { TimerDisplay } from "./TimerDisplay"
import { cn } from "../lib/utils"

interface TimerControllerProps {
  groupId: string
  taskId: string
  elapsedSeconds: number
  isRunning: boolean
}

export function TimerController({
  groupId,
  taskId,
  elapsedSeconds,
  isRunning,
}: TimerControllerProps) {
  const { startTask, pauseTask, markTaskDone } = useApp()

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <TimerDisplay elapsedSeconds={elapsedSeconds} isRunning={isRunning} />
      <div className="flex items-center gap-1">
        {isRunning ? (
          <button
            type="button"
            onClick={() => pauseTask()}
            className={cn(
              "p-2 rounded-lg transition-colors",
              "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
            )}
            title="Pause"
          >
            <Pause className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startTask(groupId, taskId)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
            )}
            title="Start"
          >
            <Play className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => markTaskDone(groupId, taskId)}
          className={cn(
            "p-2 rounded-lg transition-colors",
            "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          )}
          title="Mark as done"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
