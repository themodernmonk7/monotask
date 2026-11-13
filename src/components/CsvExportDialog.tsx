import { useState, useMemo } from 'react';
import { useApp } from '@/hooks/useApp';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Calendar as CalendarIcon,
  Check,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
} from 'date-fns';
import {
  getAllSlicesInRange,
  generateDetailedTimeLogCsv,
  generateSummaryCsv,
  downloadCsvFile,
  formatDurationHuman,
} from '@/lib/analytics';
import { cn } from '@/lib/utils';

export type ExportType = 'detailed' | 'summary';
export type ExportScope = 'day' | 'week' | 'month' | 'custom';

interface CsvExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultScope?: ExportScope;
  defaultDate?: Date;
}

export function CsvExportDialog({
  open,
  onOpenChange,
  defaultScope = 'day',
  defaultDate = new Date(),
}: CsvExportDialogProps) {
  const { allSessions, settings } = useApp();

  const [exportType, setExportType] = useState<ExportType>('detailed');
  const [scope, setScope] = useState<ExportScope>(defaultScope);

  const [selectedDate, setSelectedDate] = useState(() =>
    format(defaultDate, 'yyyy-MM-dd')
  );
  const [selectedMonth, setSelectedMonth] = useState(() =>
    format(defaultDate, 'yyyy-MM')
  );
  const [customStart, setCustomStart] = useState(() =>
    format(defaultDate, 'yyyy-MM-01')
  );
  const [customEnd, setCustomEnd] = useState(() =>
    format(defaultDate, 'yyyy-MM-dd')
  );

  // Compute actual date range and period label based on selected scope
  const { rangeStart, rangeEnd, periodLabel, filename } = useMemo(() => {
    let start: Date;
    let end: Date;
    let label = '';
    let name = '';

    if (scope === 'day') {
      const d = parseISO(selectedDate);
      start = d;
      end = d;
      label = format(d, 'yyyy-MM-dd');
      name = `monotask-daily-${format(d, 'yyyy-MM-dd')}.csv`;
    } else if (scope === 'week') {
      const d = parseISO(selectedDate);
      start = startOfWeek(d, { weekStartsOn: 1 });
      end = endOfWeek(d, { weekStartsOn: 1 });
      const weekStartStr = format(start, 'yyyy-MM-dd');
      const weekEndStr = format(end, 'yyyy-MM-dd');
      label = `Week of ${weekStartStr} to ${weekEndStr}`;
      name = `monotask-weekly-${weekStartStr}.csv`;
    } else if (scope === 'month') {
      const parts = selectedMonth.split('-');
      const year = parseInt(parts[0], 10) || defaultDate.getFullYear();
      const month = (parseInt(parts[1], 10) || defaultDate.getMonth() + 1) - 1;
      const ref = new Date(year, month, 1);
      start = startOfMonth(ref);
      end = endOfMonth(ref);
      label = format(ref, 'MMMM yyyy');
      name = `monotask-monthly-${format(ref, 'yyyy-MM')}.csv`;
    } else {
      start = parseISO(customStart);
      end = parseISO(customEnd);
      label = `${customStart} to ${customEnd}`;
      name = `monotask-custom-${customStart}-to-${customEnd}.csv`;
    }

    if (exportType === 'summary') {
      name = name.replace('monotask-', 'monotask-summary-');
    }

    return { rangeStart: start, rangeEnd: end, periodLabel: label, filename: name };
  }, [
    scope,
    selectedDate,
    selectedMonth,
    customStart,
    customEnd,
    exportType,
    defaultDate,
  ]);

  // Slices matching range
  const slices = useMemo(() => {
    return getAllSlicesInRange(allSessions, rangeStart, rangeEnd);
  }, [allSessions, rangeStart, rangeEnd]);

  const totalSeconds = useMemo(() => {
    return slices.reduce((sum, s) => sum + s.durationSeconds, 0);
  }, [slices]);

  // Expected target seconds for this period
  const expectedTargetSeconds = useMemo(() => {
    if (scope === 'day') {
      const dayOfWeek = rangeStart.getDay();
      return settings.workingDays.includes(dayOfWeek)
        ? settings.dailyTargetMinutes * 60
        : 0;
    }
    if (scope === 'week') {
      return settings.workingDays.length * settings.dailyTargetMinutes * 60;
    }
    if (scope === 'month') {
      let count = 0;
      let cur = new Date(rangeStart);
      while (cur.getTime() <= rangeEnd.getTime()) {
        if (settings.workingDays.includes(cur.getDay())) count++;
        cur = new Date(cur.getTime() + 86400000);
      }
      return count * settings.dailyTargetMinutes * 60;
    }
    // Custom: count working days
    let count = 0;
    let cur = new Date(rangeStart);
    while (cur.getTime() <= rangeEnd.getTime()) {
      if (settings.workingDays.includes(cur.getDay())) count++;
      cur = new Date(cur.getTime() + 86400000);
    }
    return count * settings.dailyTargetMinutes * 60;
  }, [scope, rangeStart, rangeEnd, settings]);

  const handleExport = () => {
    let csv = '';
    if (exportType === 'detailed') {
      csv = generateDetailedTimeLogCsv(slices);
    } else {
      csv = generateSummaryCsv(periodLabel, slices, expectedTargetSeconds);
    }
    downloadCsvFile(filename, csv);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Download className="w-5 h-5" />
            <DialogTitle>Export Time Logs (CSV)</DialogTitle>
          </div>
          <DialogDescription>
            Download detailed task session logs or aggregated summaries in UTF-8 CSV format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Format Selection: Detailed vs Summary */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportType('detailed')}
                className={cn(
                  'flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer',
                  exportType === 'detailed'
                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                    : 'bg-muted/10 border-white/5 hover:bg-muted/20 hover:border-white/10'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                    <FileText className="w-4 h-4 text-primary" />
                    <span>Detailed Log</span>
                  </div>
                  {exportType === 'detailed' && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  One row per recorded session with exact start/end times and notes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportType('summary')}
                className={cn(
                  'flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer',
                  exportType === 'summary'
                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                    : 'bg-muted/10 border-white/5 hover:bg-muted/20 hover:border-white/10'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    <span>Summary</span>
                  </div>
                  {exportType === 'summary' && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Aggregated project and period totals with target vs actual hours.
                </p>
              </button>
            </div>
          </div>

          {/* Scope Selection: Day / Week / Month / Custom */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Reporting Period
            </label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-muted/30 rounded-xl border border-white/5">
              {(['day', 'week', 'month', 'custom'] as ExportScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'py-1.5 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer',
                    scope === s
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s === 'custom' ? 'Custom Range' : s}
                </button>
              ))}
            </div>
          </div>

          {/* Date Selector Inputs based on scope */}
          <div className="space-y-3 bg-muted/10 border border-white/5 rounded-xl p-3">
            {scope === 'day' && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  Select Date
                </span>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-card/50 border-white/10 font-mono text-sm"
                />
              </div>
            )}

            {scope === 'week' && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  Select any day in the target week
                </span>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-card/50 border-white/10 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Selected Week: {periodLabel}
                </p>
              </div>
            )}

            {scope === 'month' && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  Select Month
                </span>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-card/50 border-white/10 font-mono text-sm"
                />
              </div>
            )}

            {scope === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-card/50 border-white/10 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-card/50 border-white/10 font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Export File & Summary Preview */}
          <div className="bg-muted/30 border border-white/5 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Output File:</span>
              <span className="font-mono font-bold text-foreground truncate max-w-[260px]">
                {filename}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Matched Sessions / Slices:</span>
              <span className="font-mono font-bold text-foreground">
                {slices.length} entries
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Working Time:</span>
              <span className="font-mono font-bold text-primary">
                {formatDurationHuman(totalSeconds)} ({(totalSeconds / 3600).toFixed(2)}h)
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            className="rounded-xl gap-2 font-bold"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
