import { useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '@/hooks/useApp';
import { formatDurationHuman } from '@/lib/analytics';
import {
  Target,
  Settings,
  CheckCircle2,
  AlertCircle,
  Flame,
  Sparkles,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsDialog } from './SettingsDialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function DailyTargetCard() {
  const { todayProgress, runningTaskId, groups } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const runningTask = runningTaskId
    ? groups.flatMap((g) => g.tasks.map((t) => ({ ...t, groupName: g.name }))).find(
        (t) => t.id === runningTaskId
      )
    : null;

  const todayStr = format(new Date(), 'EEEE, MMM d');

  const {
    targetSeconds,
    loggedSeconds,
    remainingSeconds,
    overtimeSeconds,
    percentage,
    status,
  } = todayProgress;

  // Cap visual progress bar width at 100% for the main bar
  const visualPercent = Math.min(100, percentage);

  return (
    <>
      <Card className="relative overflow-hidden border-white/10 bg-card/60 backdrop-blur-xl shadow-xl mb-8 group/card">
        {/* Subtle background glow based on status */}
        <div
          className={cn(
            'absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[90px] pointer-events-none transition-all duration-700',
            status === 'overtime'
              ? 'bg-amber-500/10'
              : status === 'completed'
              ? 'bg-emerald-500/15'
              : 'bg-primary/10'
          )}
        />

        <CardContent className="p-5 md:p-6 space-y-5 relative z-10">
          {/* Top Bar: Title, Date, Status Badge, Settings Trigger */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center border transition-colors shadow-inner',
                  status === 'overtime'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : status === 'completed'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-primary/10 border-primary/20 text-primary'
                )}
              >
                {status === 'overtime' ? (
                  <Flame className="w-5 h-5 fill-current" />
                ) : status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Target className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight text-foreground">
                    Daily Working Target
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {todayStr}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Status Badge */}
              {status === 'overtime' && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold px-2.5 py-1 text-xs gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Overtime</span>
                </Badge>
              )}
              {status === 'completed' && (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold px-2.5 py-1 text-xs gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Target completed</span>
                </Badge>
              )}
              {status === 'below' && (
                <Badge
                  variant="outline"
                  className="bg-muted/40 border-white/10 text-muted-foreground font-medium px-2.5 py-1 text-xs gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-primary/70" />
                  <span>Below target</span>
                </Badge>
              )}

              {/* Configure Target Settings Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Configure daily target and working days"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Daily Target */}
            <div className="bg-muted/20 border border-white/5 rounded-xl p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Daily Target
              </span>
              <p className="font-mono text-xl md:text-2xl font-bold tracking-tight text-foreground">
                {formatDurationHuman(targetSeconds)}
              </p>
            </div>

            {/* 2. Total Logged */}
            <div className="bg-muted/20 border border-white/5 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Total Logged
                </span>
                {runningTask && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </div>
              <p
                className={cn(
                  'font-mono text-xl md:text-2xl font-bold tracking-tight',
                  runningTask ? 'text-primary' : 'text-foreground'
                )}
              >
                {formatDurationHuman(loggedSeconds)}
              </p>
            </div>

            {/* 3. Remaining */}
            <div className="bg-muted/20 border border-white/5 rounded-xl p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Remaining
              </span>
              <p
                className={cn(
                  'font-mono text-xl md:text-2xl font-bold tracking-tight',
                  remainingSeconds === 0 ? 'text-muted-foreground/40' : 'text-foreground/90'
                )}
              >
                {remainingSeconds > 0 ? formatDurationHuman(remainingSeconds) : '0m'}
              </p>
            </div>

            {/* 4. Overtime */}
            <div
              className={cn(
                'border rounded-xl p-3 space-y-1 transition-colors',
                overtimeSeconds > 0
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-muted/20 border-white/5'
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Overtime
              </span>
              <p
                className={cn(
                  'font-mono text-xl md:text-2xl font-bold tracking-tight',
                  overtimeSeconds > 0 ? 'text-amber-400' : 'text-muted-foreground/40'
                )}
              >
                {overtimeSeconds > 0 ? `+${formatDurationHuman(overtimeSeconds)}` : '0m'}
              </p>
            </div>
          </div>

          {/* Progress Bar & Percentage */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground text-[11px] uppercase tracking-wider">
                Completion Progress
              </span>
              <span className="font-mono font-bold text-foreground">
                {percentage}%
              </span>
            </div>

            <div className="h-3 w-full bg-muted/40 rounded-full overflow-hidden border border-white/5 p-0.5 relative">
              <motion.div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  status === 'overtime'
                    ? 'bg-gradient-to-r from-emerald-500 via-primary to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                    : status === 'completed'
                    ? 'bg-gradient-to-r from-emerald-500 to-primary shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-primary'
                )}
                initial={{ width: 0 }}
                animate={{ width: `${visualPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Live Running Indicator */}
          {runningTask && (
            <div className="flex items-center justify-between text-xs bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 text-primary">
              <div className="flex items-center gap-2 truncate min-w-0">
                <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
                <span className="text-muted-foreground text-[11px]">Tracking:</span>
                <span className="font-bold truncate text-foreground">
                  {runningTask.name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  ({runningTask.groupName})
                </span>
              </div>
              <span className="font-mono font-bold tabular-nums ml-2 shrink-0">
                Live
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
