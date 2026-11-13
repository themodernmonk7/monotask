import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '@/hooks/useApp';
import {
  getDailyReportData,
  getWeeklyReportData,
  getMonthlyReportData,
  formatDurationHuman,
  calculateStreak,
  comparePeriods,
} from '@/lib/analytics';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Ticket,
  Clock,
  Calendar,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CsvExportDialog } from './CsvExportDialog';
import { SessionList } from './SessionList';
import {
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { cn } from '@/lib/utils';

type ReportTab = 'daily' | 'weekly' | 'monthly';

export function ReportsView() {
  const { allSessions, settings } = useApp();

  const [activeTab, setActiveTab] = useState<ReportTab>('daily');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [exportOpen, setExportOpen] = useState(false);

  // Navigation handlers
  const handlePrev = () => {
    if (activeTab === 'daily') setCurrentDate((d) => subDays(d, 1));
    else if (activeTab === 'weekly') setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subMonths(d, 1));
  };

  const handleNext = () => {
    if (activeTab === 'daily') setCurrentDate((d) => addDays(d, 1));
    else if (activeTab === 'weekly') setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addMonths(d, 1));
  };

  const handleJumpToCurrent = () => {
    setCurrentDate(new Date());
  };

  // Report Data Calculations
  const dailyData = useMemo(() => {
    return getDailyReportData(allSessions, currentDate, settings);
  }, [allSessions, currentDate, settings]);

  const streak = useMemo(
    () => calculateStreak(allSessions, settings),
    [allSessions, settings],
  );

  const weekComparison = useMemo(() => {
    const thisStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const thisEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const lastStart = subWeeks(thisStart, 1);
    const lastEnd = subWeeks(thisEnd, 1);
    return comparePeriods(allSessions, thisStart, thisEnd, lastStart, lastEnd);
  }, [allSessions, currentDate]);

  const weeklyData = useMemo(() => {
    return getWeeklyReportData(allSessions, currentDate, settings);
  }, [allSessions, currentDate, settings]);

  const monthlyData = useMemo(() => {
    return getMonthlyReportData(allSessions, currentDate, settings);
  }, [allSessions, currentDate, settings]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header: Sub-tabs and Export Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Segmented Control: Daily / Weekly / Monthly */}
        <div className="grid grid-cols-3 p-1 bg-muted/40 rounded-xl border border-white/5 h-10 w-full sm:w-72">
          {(['daily', 'weekly', 'monthly'] as ReportTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'text-xs font-bold rounded-lg capitalize transition-all cursor-pointer flex items-center justify-center',
                activeTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Export CSV Trigger Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(true)}
          className="rounded-xl border-white/10 hover:bg-muted/40 gap-2 shrink-0 font-medium"
        >
          <Download className="w-4 h-4 text-primary" />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Date Navigation Bar */}
      <div className="flex items-center justify-between bg-card/40 border border-white/5 rounded-2xl p-2.5 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrev}
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
          title="Previous period"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary/70 shrink-0 hidden sm:block" />
          <span className="font-bold text-sm text-foreground tracking-tight text-center">
            {activeTab === 'daily' && format(currentDate, 'EEEE, MMMM d, yyyy')}
            {activeTab === 'weekly' &&
              `${format(weeklyData.startDate, 'MMM d')} – ${format(
                weeklyData.endDate,
                'MMM d, yyyy'
              )} (Week ${format(weeklyData.startDate, 'w')})`}
            {activeTab === 'monthly' && monthlyData.monthName}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={handleJumpToCurrent}
            className="text-[10px] uppercase tracking-wider font-bold h-6 px-2 text-primary/80 hover:text-primary hover:bg-primary/10 rounded-md"
          >
            {activeTab === 'daily'
              ? 'Today'
              : activeTab === 'weekly'
              ? 'This Week'
              : 'This Month'}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleNext}
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
          title="Next period"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Streak + week-over-week momentum */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-card/40 border-white/5 p-4 flex items-center gap-3">
          <span
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center border shrink-0',
              streak.current > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-muted/30 border-white/5 text-muted-foreground',
            )}
          >
            <Flame
              className={cn('w-5 h-5', streak.current > 0 && 'fill-current')}
            />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold text-foreground leading-tight">
              {streak.current}{' '}
              <span className="text-sm font-sans font-medium text-muted-foreground">
                day{streak.current === 1 ? '' : 's'}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {streak.current > 0
                ? `Target streak · best ${streak.longest}`
                : 'Hit your daily target to start a streak'}
            </p>
          </div>
        </Card>

        <Card className="bg-card/40 border-white/5 p-4 flex items-center gap-3">
          {(() => {
            const up = weekComparison.deltaSeconds > 0;
            const flat = weekComparison.deltaSeconds === 0;
            const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
            return (
              <>
                <span
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center border shrink-0',
                    flat
                      ? 'bg-muted/30 border-white/5 text-muted-foreground'
                      : up
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-sky-500/10 border-sky-500/30 text-sky-400',
                  )}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xl font-bold text-foreground leading-tight">
                    {flat
                      ? '—'
                      : `${up ? '+' : '−'}${formatDurationHuman(
                          Math.abs(weekComparison.deltaSeconds),
                        )}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    vs last week
                    {weekComparison.percentChange !== null &&
                      ` · ${weekComparison.percentChange > 0 ? '+' : ''}${
                        weekComparison.percentChange
                      }%`}
                  </p>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      {/* Views Container */}
      <AnimatePresence mode="wait">
        {activeTab === 'daily' && (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Daily Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Logged
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(dailyData.totalWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {(dailyData.totalWorkingSeconds / 3600).toFixed(2)}h
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Target vs Actual
                </span>
                {/* No truncate here: "7h / 12m 28s" would clip to "7h / 1…" */}
                <p className="font-mono text-lg md:text-xl font-bold text-foreground leading-tight break-words">
                  {formatDurationHuman(dailyData.targetSeconds)} /{' '}
                  <span className="text-primary">
                    {formatDurationHuman(dailyData.totalWorkingSeconds)}
                  </span>
                </p>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {dailyData.percentage}% of target
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {dailyData.status === 'overtime' ? 'Overtime' : 'Remaining'}
                </span>
                <p
                  className={cn(
                    'font-mono text-2xl font-bold',
                    dailyData.status === 'overtime'
                      ? 'text-amber-400'
                      : 'text-foreground'
                  )}
                >
                  {dailyData.status === 'overtime'
                    ? `+${formatDurationHuman(dailyData.overtimeSeconds)}`
                    : formatDurationHuman(dailyData.remainingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {dailyData.status === 'overtime'
                    ? 'Exceeded daily target'
                    : dailyData.status === 'completed'
                    ? 'Target completed'
                    : 'Needed to reach target'}
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Tasks / Tickets
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {dailyData.taskCount}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {dailyData.ticketCount} identified ticket{dailyData.ticketCount !== 1 ? 's' : ''}
                </span>
              </Card>
            </div>

            {/* Daily Empty State */}
            {dailyData.totalWorkingSeconds === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-card/20 rounded-2xl border border-dashed border-white/10">
                <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-foreground/80">No time logged</h3>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    No task sessions recorded for {format(currentDate, 'MMM d, yyyy')}.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Project-wise Breakdown */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Project-wise Breakdown
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {dailyData.projects.map((proj) => (
                      <div
                        key={proj.projectName}
                        className="p-4 space-y-2 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-foreground truncate">
                              {proj.projectName}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono shrink-0">
                              {proj.taskCount} task{proj.taskCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-bold text-foreground">
                              {formatDurationHuman(proj.totalSeconds)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                              {proj.percentage}%
                            </span>
                          </div>
                        </div>
                        {/* Visual Bar */}
                        <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${proj.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Ticket-wise Breakdown */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Ticket & Task Details
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {dailyData.tickets.map((t) => (
                      <div
                        key={`${t.projectName}-${t.taskName}`}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {t.ticketId !== '-' ? (
                              <Badge
                                variant="outline"
                                className="bg-primary/10 border-primary/30 text-primary font-mono text-[10px] px-1.5 py-0"
                              >
                                {t.ticketId}
                              </Badge>
                            ) : null}
                            <span className="font-medium text-sm text-foreground truncate">
                              {t.taskName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t.projectName}</span>
                            <span>•</span>
                            <span>{t.sessionCount} session{t.sessionCount !== 1 ? 's' : ''}</span>
                            {t.notes ? (
                              <>
                                <span>•</span>
                                <span className="italic truncate max-w-xs">{t.notes}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-sm text-foreground">
                            {formatDurationHuman(t.totalSeconds)}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                            {t.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            <SessionList date={currentDate} />
          </motion.div>
        )}

        {/* Weekly View */}
        {activeTab === 'weekly' && (
          <motion.div
            key="weekly"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Weekly Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Working Hours
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(weeklyData.totalWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {(weeklyData.totalWorkingSeconds / 3600).toFixed(2)} hours logged
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Expected Working Hours
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(weeklyData.totalExpectedWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {settings.workingDays.length} working days @ {settings.dailyTargetMinutes / 60}h/day
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Average / Day
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(weeklyData.averageWorkingSecondsPerDay)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Per working day
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Target Completed
                </span>
                <p className="font-mono text-2xl font-bold text-emerald-400">
                  {weeklyData.daysTargetCompleted} day{weeklyData.daysTargetCompleted !== 1 ? 's' : ''}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Met or exceeded daily goal
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Days Below Target
                </span>
                <p className="font-mono text-2xl font-bold text-muted-foreground">
                  {weeklyData.daysBelowTarget} day{weeklyData.daysBelowTarget !== 1 ? 's' : ''}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Working days under target
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Overtime
                </span>
                <p
                  className={cn(
                    'font-mono text-2xl font-bold',
                    weeklyData.totalOvertimeSeconds > 0
                      ? 'text-amber-400'
                      : 'text-muted-foreground/40'
                  )}
                >
                  {weeklyData.totalOvertimeSeconds > 0
                    ? `+${formatDurationHuman(weeklyData.totalOvertimeSeconds)}`
                    : '0m'}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Across all days
                </span>
              </Card>
            </div>

            {/* Weekly Daily Breakdown Chart */}
            <Card className="bg-card/40 border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span>Daily Hours vs Target</span>
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Target: {settings.dailyTargetMinutes / 60}h/day
                </span>
              </div>

              {/* 7-Day Visual Bars */}
              <div className="grid grid-cols-7 gap-2 pt-2 pb-1">
                {weeklyData.days.map((day) => {
                  const targetSec = day.targetSeconds;
                  const maxSec = Math.max(
                    targetSec > 0 ? targetSec * 1.3 : 1,
                    day.loggedSeconds,
                    25200 // at least 7 hours scale
                  );
                  const heightPercent = Math.min(
                    100,
                    Math.round((day.loggedSeconds / maxSec) * 100)
                  );
                  const targetLinePercent = Math.min(
                    100,
                    Math.round((targetSec / maxSec) * 100)
                  );

                  return (
                    <div
                      key={day.dateKey}
                      className="flex flex-col items-center gap-2 group/bar"
                    >
                      {/* Bar Container */}
                      <div className="w-full h-36 bg-muted/20 rounded-xl relative flex flex-col justify-end p-1 border border-white/5 overflow-hidden">
                        {/* Target Line if working day */}
                        {targetSec > 0 && (
                          <div
                            className="absolute left-0 right-0 border-t border-dashed border-primary/40 z-10"
                            style={{ bottom: `${targetLinePercent}%` }}
                            title={`Target: ${formatDurationHuman(targetSec)}`}
                          />
                        )}

                        {/* Actual Logged Bar */}
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPercent}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={cn(
                            'w-full rounded-lg transition-all',
                            day.status === 'overtime'
                              ? 'bg-gradient-to-t from-primary to-amber-400'
                              : day.status === 'completed'
                              ? 'bg-emerald-500'
                              : day.loggedSeconds > 0
                              ? 'bg-primary/70'
                              : 'bg-transparent'
                          )}
                        />
                      </div>

                      {/* Day Label & Hours */}
                      <div className="text-center space-y-0.5">
                        <span
                          className={cn(
                            'text-xs font-bold block',
                            day.isWorkingDay ? 'text-foreground' : 'text-muted-foreground/50'
                          )}
                        >
                          {day.dayName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 font-mono block">
                          {format(day.date, 'd')}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-foreground block">
                          {day.loggedSeconds > 0
                            ? (day.loggedSeconds / 3600).toFixed(1) + 'h'
                            : '–'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Weekly Empty State or Details */}
            {weeklyData.totalWorkingSeconds === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-card/20 rounded-2xl border border-dashed border-white/10">
                <Clock className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No sessions recorded for this week.
                </p>
              </div>
            ) : (
              <>
                {/* Weekly Project Breakdown */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Project-wise Breakdown (Weekly)
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {weeklyData.projects.map((proj) => (
                      <div
                        key={proj.projectName}
                        className="p-4 space-y-2 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-foreground truncate">
                              {proj.projectName}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono shrink-0">
                              {proj.taskCount} task{proj.taskCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-bold text-foreground">
                              {formatDurationHuman(proj.totalSeconds)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                              {proj.percentage}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${proj.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Weekly Ticket Breakdown */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Ticket & Task Details (Weekly)
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {weeklyData.tickets.map((t) => (
                      <div
                        key={`${t.projectName}-${t.taskName}`}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {t.ticketId !== '-' ? (
                              <Badge
                                variant="outline"
                                className="bg-primary/10 border-primary/30 text-primary font-mono text-[10px] px-1.5 py-0"
                              >
                                {t.ticketId}
                              </Badge>
                            ) : null}
                            <span className="font-medium text-sm text-foreground truncate">
                              {t.taskName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t.projectName}</span>
                            <span>•</span>
                            <span>{t.sessionCount} session{t.sessionCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-sm text-foreground">
                            {formatDurationHuman(t.totalSeconds)}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                            {t.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}

        {/* Monthly View */}
        {activeTab === 'monthly' && (
          <motion.div
            key="monthly"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Monthly Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Working Hours
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(monthlyData.totalWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {(monthlyData.totalWorkingSeconds / 3600).toFixed(2)}h total
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Expected Working Hours
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(monthlyData.totalExpectedWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {monthlyData.workingDaysCount} working days in month
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Average Daily Hours
                </span>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {formatDurationHuman(monthlyData.averageDailyWorkingSeconds)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Per working day
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Days Target Completed
                </span>
                <p className="font-mono text-2xl font-bold text-emerald-400">
                  {monthlyData.daysTargetCompleted} days
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Reached or exceeded goal
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Days Below Target
                </span>
                <p className="font-mono text-2xl font-bold text-muted-foreground">
                  {monthlyData.daysBelowTarget} days
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Working days under target
                </span>
              </Card>

              <Card className="bg-card/40 border-white/5 p-4 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Overtime
                </span>
                <p
                  className={cn(
                    'font-mono text-2xl font-bold',
                    monthlyData.totalOvertimeSeconds > 0
                      ? 'text-amber-400'
                      : 'text-muted-foreground/40'
                  )}
                >
                  {monthlyData.totalOvertimeSeconds > 0
                    ? `+${formatDurationHuman(monthlyData.totalOvertimeSeconds)}`
                    : '0m'}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Sum of overtime hours
                </span>
              </Card>
            </div>

            {/* Monthly Empty State or Details */}
            {monthlyData.totalWorkingSeconds === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-card/20 rounded-2xl border border-dashed border-white/10">
                <Clock className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  No task sessions recorded for {monthlyData.monthName}.
                </p>
              </div>
            ) : (
              <>
                {/* Monthly Project Distribution */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Project-wise Time Distribution
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {monthlyData.projects.map((proj) => (
                      <div
                        key={proj.projectName}
                        className="p-4 space-y-2 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-foreground truncate">
                              {proj.projectName}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono shrink-0">
                              {proj.taskCount} task{proj.taskCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-bold text-foreground">
                              {formatDurationHuman(proj.totalSeconds)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                              {proj.percentage}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${proj.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Monthly Ticket Distribution */}
                <Card className="bg-card/40 border-white/5 overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-primary" />
                      <CardTitle className="text-sm font-bold tracking-tight">
                        Ticket-wise Time Distribution
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-white/5">
                    {monthlyData.tickets.map((t) => (
                      <div
                        key={`${t.projectName}-${t.taskName}`}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {t.ticketId !== '-' ? (
                              <Badge
                                variant="outline"
                                className="bg-primary/10 border-primary/30 text-primary font-mono text-[10px] px-1.5 py-0"
                              >
                                {t.ticketId}
                              </Badge>
                            ) : null}
                            <span className="font-medium text-sm text-foreground truncate">
                              {t.taskName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{t.projectName}</span>
                            <span>•</span>
                            <span>{t.sessionCount} session{t.sessionCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-sm text-foreground">
                            {formatDurationHuman(t.totalSeconds)}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground w-10 text-right">
                            {t.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV Export Dialog */}
      <CsvExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultScope={activeTab === 'daily' ? 'day' : activeTab === 'weekly' ? 'week' : 'month'}
        defaultDate={currentDate}
      />
    </div>
  );
}
