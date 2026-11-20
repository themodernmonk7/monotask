import { useEffect, useState } from 'react';
import {
  Loader2,
  FolderOpen,
  Ticket,
  Clock,
  CalendarX,
} from 'lucide-react';
import { fetchSharedReport } from '@/lib/sharedReports';
import type { SharedReportRow } from '@/lib/sharedReports';
import { formatDurationHuman } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface SharedReportViewProps {
  id: string;
}

/**
 * The public, unauthenticated page a `/share/:id` link opens. No app shell,
 * no sign-in, no other providers — just this one row, if RLS says it's still
 * readable. Always dark, same as the sign-in screens: there is no `settings`
 * to read a theme preference from here, this page has no account context
 * at all.
 */
export function SharedReportView({ id }: SharedReportViewProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'not-found' }
    | { status: 'error'; message: string }
    | { status: 'ready'; row: SharedReportRow }
  >({ status: 'loading' });

  useEffect(() => {
    document.documentElement.classList.add('dark');

    let alive = true;
    fetchSharedReport(id).then(({ data, error }) => {
      if (!alive) return;
      if (error) setState({ status: 'error', message: error });
      else if (!data) setState({ status: 'not-found' });
      else setState({ status: 'ready', row: data });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[150px]" />
      </div>

      <header className="relative z-10 border-b border-foreground/5 bg-background/60 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-br from-foreground via-foreground to-foreground/40 bg-clip-text text-transparent">
            Monotask
          </h1>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-0.5">
            Shared report
          </p>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-20">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Loading report…
          </div>
        )}

        {(state.status === 'not-found' || state.status === 'error') && (
          <div className="rounded-2xl border border-foreground/10 bg-card/40 p-8 text-center space-y-2">
            <CalendarX className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="font-bold">This link isn't available</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {state.status === 'error'
                ? state.message
                : "It may have been revoked, or the link isn't valid."}
            </p>
          </div>
        )}

        {state.status === 'ready' && <ReportBody row={state.row} />}
      </main>

      <footer className="relative z-10 max-w-2xl mx-auto px-6 pb-10 text-center">
        <p className="text-[11px] text-muted-foreground/60">
          A fixed snapshot shared from Monotask — it won't change if more time
          is logged later.
        </p>
      </footer>
    </div>
  );
}

function ReportBody({ row }: { row: SharedReportRow }) {
  const { snapshot } = row;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          {row.ownerName ? `Shared by ${row.ownerName} · ` : ''}
          {new Date(row.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
        <h2 className="text-xl font-bold tracking-tight mt-0.5">{row.periodLabel}</h2>
      </div>

      {snapshot.kind === 'daily' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total Logged" value={formatDurationHuman(snapshot.totalWorkingSeconds)} />
            <StatTile
              label={snapshot.status === 'overtime' ? 'Overtime' : 'Remaining'}
              value={
                snapshot.status === 'overtime'
                  ? `+${formatDurationHuman(snapshot.overtimeSeconds)}`
                  : formatDurationHuman(snapshot.remainingSeconds)
              }
              accent={snapshot.status === 'overtime' ? 'amber' : undefined}
            />
            <StatTile label="Target" value={formatDurationHuman(snapshot.targetSeconds)} />
            <StatTile label="Progress" value={`${snapshot.percentage}%`} accent={snapshot.status === 'completed' ? 'emerald' : undefined} />
          </div>
          <ProjectBreakdown projects={snapshot.projects} />
          <TicketBreakdown tickets={snapshot.tickets} />
        </>
      )}

      {snapshot.kind === 'weekly' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total Logged" value={formatDurationHuman(snapshot.totalWorkingSeconds)} />
            <StatTile label="Daily Average" value={formatDurationHuman(snapshot.averageWorkingSecondsPerDay)} />
            <StatTile label="Targets Hit" value={`${snapshot.daysTargetCompleted} days`} accent="emerald" />
            <StatTile label="Overtime" value={formatDurationHuman(snapshot.totalOvertimeSeconds)} accent={snapshot.totalOvertimeSeconds > 0 ? 'amber' : undefined} />
          </div>
          <div className="rounded-2xl border border-foreground/5 bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Day by day</span>
            </div>
            <ul className="divide-y divide-foreground/5">
              {snapshot.days.map((d) => (
                <li key={d.dateKey} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className={cn('font-medium', !d.isWorkingDay && 'text-muted-foreground/50')}>
                    {d.dayName}
                  </span>
                  <span className={cn('font-mono text-xs', d.status === 'completed' && 'text-primary', d.status === 'overtime' && 'text-amber-400')}>
                    {d.isWorkingDay ? formatDurationHuman(d.loggedSeconds) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ProjectBreakdown projects={snapshot.projects} />
          <TicketBreakdown tickets={snapshot.tickets} />
        </>
      )}

      {snapshot.kind === 'monthly' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total Logged" value={formatDurationHuman(snapshot.totalWorkingSeconds)} />
            <StatTile label="Daily Average" value={formatDurationHuman(snapshot.averageDailyWorkingSeconds)} />
            <StatTile label="Targets Hit" value={`${snapshot.daysTargetCompleted} / ${snapshot.workingDaysCount} days`} accent="emerald" />
            <StatTile label="Overtime" value={formatDurationHuman(snapshot.totalOvertimeSeconds)} accent={snapshot.totalOvertimeSeconds > 0 ? 'amber' : undefined} />
          </div>
          <ProjectBreakdown projects={snapshot.projects} />
          <TicketBreakdown tickets={snapshot.tickets} />
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber';
}) {
  return (
    <div className="bg-card/40 border border-foreground/5 rounded-xl p-4 space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <p
        className={cn(
          'font-mono text-xl font-bold',
          accent === 'emerald' && 'text-primary',
          accent === 'amber' && 'text-amber-400',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ProjectBreakdown({
  projects,
}: {
  projects: { projectName: string; totalSeconds: number; percentage: number; taskCount: number }[];
}) {
  if (projects.length === 0) return null;
  return (
    <div className="rounded-2xl border border-foreground/5 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5">
        <FolderOpen className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Projects</span>
      </div>
      <ul className="divide-y divide-foreground/5">
        {projects.map((p) => (
          <li key={p.projectName} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold truncate">{p.projectName}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatDurationHuman(p.totalSeconds)} · {p.percentage}%
              </span>
            </div>
            <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(100, p.percentage)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketBreakdown({
  tickets,
}: {
  tickets: { ticketId: string; taskName: string; projectName: string; totalSeconds: number }[];
}) {
  if (tickets.length === 0) return null;
  return (
    <div className="rounded-2xl border border-foreground/5 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5">
        <Ticket className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tickets</span>
      </div>
      <ul className="divide-y divide-foreground/5">
        {tickets.map((t) => (
          <li key={t.ticketId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{t.taskName}</p>
              <p className="text-[11px] text-muted-foreground">{t.projectName}</p>
            </div>
            <span className="font-mono text-xs shrink-0 ml-2">{formatDurationHuman(t.totalSeconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
