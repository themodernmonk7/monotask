import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronDown, ChevronRight, Plus, FolderOpen, Trash2 } from "lucide-react"
import { useApp } from "../context/AppContext"
import { TaskItem } from "./TaskItem"

export function GroupList() {
  const {
    groups,
    runningTaskId,
    addGroup,
    removeGroup,
    toggleGroupExpanded,
    addTask,
  } = useApp()
  const [newGroupName, setNewGroupName] = useState("")
  const [newTaskNames, setNewTaskNames] = useState<Record<string, string>>({})

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newGroupName.trim()
    if (name) {
      addGroup(name)
      setNewGroupName("")
    }
  }

  const handleAddTask = (e: React.FormEvent, groupId: string) => {
    e.preventDefault()
    const name = (newTaskNames[groupId] ?? "").trim()
    if (name) {
      addTask(groupId, name)
      setNewTaskNames((prev) => ({ ...prev, [groupId]: "" }))
    }
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <form onSubmit={handleAddGroup} className="flex gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name..."
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Add Group
          </button>
        </form>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Create a group to start adding tasks.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddGroup} className="flex gap-2">
        <input
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="New group name..."
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          Add Group
        </button>
      </form>

      <ul className="space-y-2">
        <AnimatePresence>
          {groups.map((group) => (
            <motion.li
              key={group.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleGroupExpanded(group.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    toggleGroupExpanded(group.id)
                  }
                }}
                className="w-full flex items-center gap-2 py-3 px-4 text-left hover:bg-slate-100/80 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
              >
                {group.expanded !== false ? (
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex-1 truncate">
                  {group.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeGroup(group.id)
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Remove group"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <AnimatePresence>
                {group.expanded !== false && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 pt-1 space-y-2">
                      <form
                        onSubmit={(e) => handleAddTask(e, group.id)}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={newTaskNames[group.id] ?? ""}
                          onChange={(e) =>
                            setNewTaskNames((prev) => ({
                              ...prev,
                              [group.id]: e.target.value,
                            }))
                          }
                          placeholder="New task..."
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                        />
                        <button
                          type="submit"
                          className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                          title="Add task"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </form>
                      <ul className="space-y-1.5">
                        <AnimatePresence>
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
                          <p className="text-slate-500 dark:text-slate-400 text-sm py-2">
                            No tasks yet. Add one above.
                          </p>
                        )}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}
