import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { AppProvider } from "./context/AppContext"
import { GroupList } from "./components/GroupList"
import { CompletedTasks } from "./components/CompletedTasks"
import { NotesSection } from "./components/NotesSection"
import { ListTodo, CheckSquare, StickyNote } from "lucide-react"
import { cn } from "./lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TabId = "tasks" | "completed" | "notes"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodo className="w-4 h-4" /> },
  { id: "completed", label: "Completed", icon: <CheckSquare className="w-4 h-4" /> },
  { id: "notes", label: "Notes", icon: <StickyNote className="w-4 h-4" /> },
]

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("tasks")

  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[150px] animate-pulse [animation-delay:2s]" />
      </div>

      <header className="relative z-20 border-b border-white/5 bg-background/60 backdrop-blur-xl sticky top-0">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Monotask
            </h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-1 ml-0.5">
              Focus · Flow · Finish
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className=" px-3 py-1 rounded-full bg-primary/10 border border-primary/20 flex justify-center items-center">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Deep Work</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 p-1 bg-muted/50 rounded-xl h-11">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200"
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "transition-transform duration-200",
                    activeTab === tab.id ? "scale-110" : "scale-100 opacity-70"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="text-sm font-medium">{tab.label}</span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ 
                duration: 0.3, 
                ease: [0.23, 1, 0.32, 1] 
              }}
            >
              <TabsContent value="tasks" className="mt-0 outline-none">
                <GroupList />
              </TabsContent>
              <TabsContent value="completed" className="mt-0 outline-none">
                <CompletedTasks />
              </TabsContent>
              <TabsContent value="notes" className="mt-0 outline-none">
                <NotesSection />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
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
