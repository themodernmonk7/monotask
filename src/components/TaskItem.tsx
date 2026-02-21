import { motion } from "motion/react"
import { TimerController } from "./TimerController"
import { cn } from "../lib/utils"

interface TaskItemProps {
  groupId: string
  taskId: string
  taskName: string
  elapsedSeconds: number
  isRunning: boolean
}

export function TaskItem({
  groupId,
  taskId,
  taskName,
  elapsedSeconds,
  isRunning,
}: TaskItemProps) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-center justify-between gap-4 py-2 px-3 rounded-lg border transition-colors",
        isRunning
          ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-700 dark:bg-emerald-900/20"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50"
      )}
    >
      <span className="font-medium text-slate-800 dark:text-slate-200 truncate min-w-0">
        {taskName}
      </span>
      <TimerController
        groupId={groupId}
        taskId={taskId}
        elapsedSeconds={elapsedSeconds}
        isRunning={isRunning}
      />
    </motion.li>
  )
}
