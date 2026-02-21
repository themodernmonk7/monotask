import { useState } from "react"
import { motion } from "motion/react"
import { AppProvider } from "./context/AppContext"
import { GroupList } from "./components/GroupList"
import { CompletedTasks } from "./components/CompletedTasks"
import { NotesSection } from "./components/NotesSection"
import { ListTodo, CheckSquare, StickyNote } from "lucide-react"
import { cn } from "./lib/utils"

type TabId = "tasks" | "completed" | "notes"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodo className="w-4 h-4" /> },
  { id: "completed", label: "Completed", icon: <CheckSquare className="w-4 h-4" /> },
  { id: "notes", label: "Notes", icon: <StickyNote className="w-4 h-4" /> },
]

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("tasks")

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Monotask
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Task groups · One timer at a time
          </p>
        </div>
        <nav className="max-w-2xl mx-auto px-4 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "tasks" && <GroupList />}
          {activeTab === "completed" && <CompletedTasks />}
          {activeTab === "notes" && <NotesSection />}
        </motion.div>
      </main>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
