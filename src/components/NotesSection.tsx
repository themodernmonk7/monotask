import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { StickyNote, Plus, Trash2 } from "lucide-react"
import { useApp } from "../context/AppContext"
import { cn } from "../lib/utils"

export function NotesSection() {
  const { notes, addNote, toggleNote, removeNote } = useApp()
  const [newNoteText, setNewNoteText] = useState("")

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const text = newNoteText.trim()
    if (text) {
      addNote(text)
      setNewNoteText("")
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </form>

      {notes.length === 0 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <StickyNote className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No notes yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {notes.map((note) => (
              <motion.li
                key={note.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-3 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
              >
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={note.checked}
                    onChange={() => toggleNote(note.id)}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span
                    className={cn(
                      "text-slate-800 dark:text-slate-200",
                      note.checked && "line-through text-slate-500 dark:text-slate-400"
                    )}
                  >
                    {note.text}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => removeNote(note.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                  title="Remove note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
