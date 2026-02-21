import { useState, useRef, useEffect } from "react"
import { motion } from "motion/react"
import { useApp } from "../context/AppContext"
import { groupByDate, formatDateHeader, formatDuration } from "../lib/time"
import type { CompletedTask } from "../types"
import { Calendar, FolderOpen, Pencil } from "lucide-react"

function groupByGroupName(tasks: CompletedTask[]): Map<string, CompletedTask[]> {
  const map = new Map<string, CompletedTask[]>()
  for (const task of tasks) {
    const list = map.get(task.groupName) ?? []
    list.push(task)
    map.set(task.groupName, list)
  }
  return map
}

function CompletedTaskRow({
  task,
  onUpdateTime,
}: {
  task: CompletedTask
  onUpdateTime: (id: string, totalSeconds: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const totalMinutes = Math.round(task.totalSeconds / 60)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = () => {
    setInputVal(String(totalMinutes))
    setEditing(true)
  }

  const handleSave = () => {
    const minutes = parseInt(inputVal.trim(), 10)
    if (!Number.isNaN(minutes) && minutes >= 0) {
      onUpdateTime(task.id, minutes * 60)
    }
    setEditing(false)
  }

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 pl-8 py-2 flex items-center justify-between gap-4 group"
    >
      <span className="font-medium text-slate-800 dark:text-slate-200">
        {task.taskName}
      </span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="number"
              min={0}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave()
                if (e.key === "Escape") {
                  setInputVal(String(totalMinutes))
                  setEditing(false)
                }
              }}
              className="w-20 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">min</span>
          </div>
        ) : (
          <>
            <span className="font-mono text-sm text-slate-600 dark:text-slate-300 tabular-nums">
              {formatDuration(task.totalSeconds)}
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-300 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit time"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </motion.li>
  )
}

export function CompletedTasks() {
  const { completedTasks: tasks, updateCompletedTask } = useApp()
  const byDate = groupByDate(tasks)
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => (a > b ? -1 : 1))

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No completed tasks yet.</p>
        <p className="text-sm mt-1">Mark tasks as done to see them here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => {
        const items = byDate.get(dateKey)!
        const first = items[0]
        const headerDate = formatDateHeader(first.completedAt)
        const byGroup = groupByGroupName(items)
        const groupNames = Array.from(byGroup.keys()).sort()
        return (
          <motion.section
            key={dateKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/50 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {headerDate}
              </span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {groupNames.map((groupName) => {
                const groupTasks = byGroup.get(groupName)!
                return (
                  <div key={groupName} className="py-2">
                    <div className="px-4 py-1.5 flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-medium text-sm">{groupName}</span>
                    </div>
                    <ul className="mt-0.5">
                      {groupTasks.map((task) => (
                        <CompletedTaskRow
                          key={task.id}
                          task={task}
                          onUpdateTime={updateCompletedTask}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}
