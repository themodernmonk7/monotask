import { useEffect, useState } from "react"
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
import { AuthScreen } from "./components/AuthScreen"
import { SupabaseSchemaBanner } from "./components/SupabaseSchemaBanner"
import {
  ListTodo,
  CheckSquare,
  BarChart3,
  StickyNote,
  Settings,
  Cloud,
  CloudOff,
  LogOut,
  Loader2,
  AlertCircle,
  X,
  Database,
  RefreshCw,
  CloudUpload,
  Plus,
  WifiOff,
} from "lucide-react"
import { cn } from "./lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  onRevealTask,
  taskElementId,
  requestFocusSearch,
  requestNewTask,
} from "./lib/uiEvents"
import { useDocumentTimer } from "./hooks/useDocumentTimer"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useTargetNotification } from "./hooks/useTargetNotification"
import { UndoToast } from "./components/UndoToast"
import { IdleDialog } from "./components/IdleDialog"
import { LogTimeDialog } from "./components/LogTimeDialog"

type TabId = "tasks" | "completed" | "reports" | "notes"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodo className="w-4 h-4" /> },
  { id: "completed", label: "Completed", icon: <CheckSquare className="w-4 h-4" /> },
  { id: "reports", label: "Reports", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "notes", label: "Notes", icon: <StickyNote className="w-4 h-4" /> },
]

/** Shared ambient background so every gate state looks like the same app. */
function Backdrop() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[150px] animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[150px] animate-pulse [animation-delay:2s]" />
    </div>
  )
}

function Splash({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center gap-4">
      <Backdrop />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
          Monotask
        </h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  )
}

/** Without Supabase credentials there is nowhere to store anything. */
function ConfigNotice() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center p-6">
      <Backdrop />
      <div className="relative z-10 max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
        <div className="flex items-center gap-2 text-amber-300">
          <Database className="w-5 h-5" />
          <h1 className="font-bold">Supabase isn’t configured</h1>
        </div>
        <p className="text-sm text-amber-200/80 leading-relaxed">
          Monotask stores your tasks in your own Supabase project. Add the
          following to a <code className="font-mono text-[11px]">.env</code> file
          and restart the dev server:
        </p>
        <pre className="bg-black/40 rounded-xl p-3 border border-amber-500/20 font-mono text-[11px] text-amber-100/90 overflow-x-auto">
{`VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...`}
        </pre>
        <p className="text-xs text-amber-200/60">
          See <code className="font-mono">.env.example</code> for a template.
        </p>
      </div>
    </div>
  )
}

function OfflineBanner() {
  const { isOffline, lastSyncedAt, pendingWrites, retryLoad, isLoading } = useApp()
  if (!isOffline) return null

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 mb-6 flex items-start gap-2.5 text-xs">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-amber-300">
          You’re offline — working from a local copy
        </p>
        <p className="text-amber-200/80 mt-0.5 leading-relaxed">
          {lastSyncedAt
            ? `Last synced ${new Date(lastSyncedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}. `
            : ""}
          {pendingWrites > 0
            ? `${pendingWrites} change${pendingWrites === 1 ? "" : "s"} will sync when you reconnect.`
            : "Changes you make will sync when you reconnect."}
        </p>
      </div>
      <Button
        size="xs"
        onClick={retryLoad}
        disabled={isLoading}
        className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg gap-1.5 shrink-0"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        Try now
      </Button>
    </div>
  )
}

function LoadErrorBanner() {
  const { loadError, retryLoad, isLoading } = useApp()
  if (!loadError) return null

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 mb-6 flex items-start gap-2.5 text-xs">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-destructive">
          Couldn’t load your data — nothing will be saved
        </p>
        <p className="text-destructive/80 mt-0.5 leading-relaxed break-words">
          {loadError}
        </p>
      </div>
      <Button
        size="xs"
        onClick={retryLoad}
        disabled={isLoading}
        className="bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30 rounded-lg gap-1.5 shrink-0"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        Retry
      </Button>
    </div>
  )
}

function SyncErrorBanner() {
  const { syncError, dismissSyncError } = useApp()
  if (!syncError) return null

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 mb-6 flex items-start gap-2.5 text-xs">
      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-destructive">Couldn’t save your last change</p>
        <p className="text-destructive/80 mt-0.5 leading-relaxed break-words">
          {syncError}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={dismissSyncError}
        className="text-destructive hover:bg-destructive/20 shrink-0"
        title="Dismiss"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  )
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("tasks")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logTimeOpen, setLogTimeOpen] = useState(false)

  const { user, displayName, signOut } = useAuth()
  const {
    isLoading,
    tablesMissing,
    syncError,
    isSaveBlocked,
    pendingWrites,
    isOffline,
    groups,
    toggleGroupExpanded,
    runningTaskId,
    sessions,
    startTask,
    pauseTask,
    undo,
    todayProgress,
  } = useApp()

  const runningTask = runningTaskId
    ? groups
        .flatMap((g) => g.tasks.map((t) => ({ ...t, groupId: g.id })))
        .find((t) => t.id === runningTaskId)
    : null

  // Live timer in the tab title + favicon, so it stays visible from any tab.
  useDocumentTimer(
    runningTask?.name ?? null,
    runningTask?.elapsedSeconds ?? 0,
    Boolean(runningTaskId),
  )

  useTargetNotification(
    todayProgress.loggedSeconds,
    todayProgress.targetSeconds,
    !isLoading,
  )

  useKeyboardShortcuts({
    onToggleTimer: () => {
      if (runningTaskId) {
        pauseTask()
        return
      }
      // Resume whatever was worked on most recently, if it still exists.
      const lastTaskId = sessions[0]?.taskId
      const target =
        groups
          .flatMap((g) => g.tasks.map((t) => ({ ...t, groupId: g.id })))
          .find((t) => t.id === lastTaskId) ??
        groups.flatMap((g) => g.tasks.map((t) => ({ ...t, groupId: g.id })))[0]

      if (target) {
        setActiveTab("tasks")
        startTask(target.groupId, target.id)
      }
    },
    onPause: () => {
      if (runningTaskId) pauseTask()
    },
    onSearch: () => {
      setActiveTab("tasks")
      requestFocusSearch()
    },
    onNewTask: () => {
      setActiveTab("tasks")
      requestNewTask()
    },
    onUndo: undo,
  })

  // Clicking the live tracker jumps to the task: switch tab, expand its group, scroll.
  useEffect(
    () =>
      onRevealTask(({ taskId, groupId }) => {
        setActiveTab("tasks")
        const group = groups.find((g) => g.id === groupId)
        if (group && !group.expanded) toggleGroupExpanded(groupId)
        // Wait for the tab panel to mount and the group to finish expanding.
        window.setTimeout(() => {
          document
            .getElementById(taskElementId(taskId))
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 500)
      }),
    [groups, toggleGroupExpanded],
  )

  if (isLoading) return <Splash label="Loading your workspace…" />

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-500 font-sans">
      <Backdrop />

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
            <div className="flex items-center gap-1.5 bg-muted/40 border border-white/5 rounded-full pl-2.5 pr-1 py-1 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                {isOffline ? (
                  <WifiOff
                    className="w-3.5 h-3.5 text-amber-400"
                    aria-label="Offline — changes will sync later"
                  />
                ) : isSaveBlocked || syncError ? (
                  <CloudOff
                    className="w-3.5 h-3.5 text-destructive"
                    aria-label="Not saving"
                  />
                ) : pendingWrites > 0 ? (
                  <CloudUpload
                    className="w-3.5 h-3.5 text-amber-400 animate-pulse"
                    aria-label={`${pendingWrites} change(s) waiting to sync`}
                  />
                ) : (
                  <Cloud
                    className="w-3.5 h-3.5 text-emerald-400"
                    aria-label="Saved to your account"
                  />
                )}
                <span
                  title={user?.email}
                  className="text-[11px] font-semibold text-foreground/80 max-w-[110px] truncate hidden sm:inline-block"
                >
                  {displayName ?? user?.email}
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

            <div className="hidden sm:flex px-3 py-1 rounded-full bg-primary/10 border border-primary/20 justify-center items-center">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Deep Work</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLogTimeOpen(true)}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Log time manually"
            >
              <Plus className="w-4 h-4" />
            </Button>

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
        {tablesMissing && <SupabaseSchemaBanner />}
        <OfflineBanner />
        <LoadErrorBanner />
        <SyncErrorBanner />

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
      <LogTimeDialog open={logTimeOpen} onOpenChange={setLogTimeOpen} />
      <IdleDialog />
      <UndoToast />
    </div>
  )
}

/** Decides what the signed-out / loading / signed-in world looks like. */
function AuthGate() {
  const { user, loading, isConfigured } = useAuth()

  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  if (!isConfigured) return <ConfigNotice />
  if (loading) return <Splash label="Checking your session…" />
  if (!user) return <AuthScreen />

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

export default App
