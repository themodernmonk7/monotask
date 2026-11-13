import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { AuthProvider } from "./context/AuthContext"
import { useAuth } from "./hooks/useAuth"
import { AppProvider } from "./context/AppContext"
import { useApp } from "./hooks/useApp"
import { GroupList } from "./components/GroupList"
import { CompletedTasks } from "./components/CompletedTasks"
import { NotesSection } from "./components/NotesSection"
import { DailyTargetCard } from "./components/DailyTargetCard"
import { ReportsView } from "./components/ReportsView"
import { SettingsDialog } from "./components/SettingsDialog"
import { AuthModal } from "./components/AuthModal"
import { SupabaseSchemaBanner } from "./components/SupabaseSchemaBanner"
import {
  ListTodo,
  CheckSquare,
  BarChart3,
  StickyNote,
  Settings,
  Cloud,
  LogOut,
  User as UserIcon,
  RefreshCw,
} from "lucide-react"
import { cn } from "./lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

type TabId = "tasks" | "completed" | "reports" | "notes"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodo className="w-4 h-4" /> },
  { id: "completed", label: "Completed", icon: <CheckSquare className="w-4 h-4" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "notes", label: "Notes", icon: <StickyNote className="w-4 h-4" /> },
]

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("tasks")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const { user, signOut, loading: authLoading } = useAuth()
  const { isSyncing, tablesMissing } = useApp()

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
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Monotask
            </h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-0.5 ml-0.5">
              Focus · Flow · Finish
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Supabase Auth & Sync Indicator */}
            {!authLoading && (
              <>
                {user ? (
                  <div className="flex items-center gap-1.5 bg-muted/40 border border-white/5 rounded-full pl-2.5 pr-1 py-1 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                      {isSyncing ? (
                        <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                      ) : (
                        <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span className="font-mono text-[11px] text-foreground/80 max-w-[110px] truncate hidden sm:inline-block">
                        {user.email}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => signOut()}
                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Sign Out"
                    >
                      <LogOut className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAuthOpen(true)}
                    className="h-8 rounded-full border-white/10 hover:bg-muted/40 text-xs gap-1.5 font-medium px-3"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-primary" />
                    <span>Sign In</span>
                  </Button>
                )}
              </>
            )}

            <div className="hidden sm:flex px-3 py-1 rounded-full bg-primary/10 border border-primary/20 justify-center items-center">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Deep Work</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-8">
        {/* Supabase Schema Alert if tables are missing in the connected DB */}
        {user && tablesMissing && <SupabaseSchemaBanner />}

        {/* Prominent Daily Working Target Dashboard Card */}
        <DailyTargetCard />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8 bg-muted/50 rounded-xl h-11">
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
                  <span className="text-xs sm:text-sm font-medium">{tab.label}</span>
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
              <TabsContent value="reports" className="mt-0 outline-none">
                <ReportsView />
              </TabsContent>
              <TabsContent value="notes" className="mt-0 outline-none">
                <NotesSection />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  )
}

export default App
