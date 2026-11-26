import { useEffect, useState } from 'react';
import { BellRing, Smartphone, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  disablePush,
  enablePush,
  getPushState,
  needsHomeScreenInstall,
  sendTestPush,
  type PushState,
} from '@/lib/push';

export interface NotificationDraft {
  idlePushEnabled: boolean;
  pendingReminderEnabled: boolean;
  pendingReminderStart: string;
  pendingReminderIntervalMinutes: number;
  pendingReminderCount: number;
}

const INTERVALS = [15, 30, 45, 60, 90, 120];
const COUNTS = [1, 2, 3, 4, 5, 6, 8, 10];

const intervalLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${m / 60} h` : `${m / 60} h`);

const sectionLabel =
  'text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2';
const triggerClass = 'h-8 w-full data-[size=default]:h-8 text-xs bg-muted/30 border-foreground/10';

/** The "Notifications" part of Settings. Reminder fields are a draft saved with the form. */
export function NotificationSettings({
  draft,
  onChange,
  timezone,
}: {
  draft: NotificationDraft;
  onChange: (next: Partial<NotificationDraft>) => void;
  timezone: string;
}) {
  const { user } = useAuth();
  const [device, setDevice] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => alive && setDevice(s));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () =>
    run(async () => {
      if (!user) return;
      const state = await enablePush(user.id);
      setDevice(state);
      if (state === 'denied') {
        setMessage('Notifications are blocked for this site. Allow them in your browser settings.');
      }
    });

  const turnOff = () =>
    run(async () => {
      if (!user) return;
      await disablePush(user.id);
      setDevice('off');
    });

  const test = () =>
    run(async () => {
      const { sent, devices } = await sendTestPush();
      setMessage(`Test sent to ${sent} of ${devices} device${devices === 1 ? '' : 's'}.`);
    });

  const deviceText: Record<PushState | 'loading', string> = {
    loading: 'Checking this device…',
    on: 'On for this device.',
    off: 'Off for this device.',
    denied: 'Blocked in this browser’s settings.',
    unconfigured: 'Not available in this build (missing push key).',
    unsupported: needsHomeScreenInstall()
      ? 'On iPhone, add Monotask to your Home Screen first (Share → Add to Home Screen).'
      : 'This browser doesn’t support push notifications.',
  };

  const anyEnabled = draft.idlePushEnabled || draft.pendingReminderEnabled;

  return (
    <div className="space-y-4">
      <label className={sectionLabel}>
        <BellRing className="w-3.5 h-3.5 text-primary" />
        <span>Notifications</span>
      </label>

      {/* This device */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-muted/20 px-3 py-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <Smartphone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid="push-device-state">
            {deviceText[device]}
          </p>
        </div>
        {device === 'on' ? (
          <div className="flex gap-1.5 shrink-0">
            <Button type="button" size="sm" variant="ghost" onClick={test} disabled={busy} className="h-7 text-xs gap-1">
              <Send className="w-3 h-3" />
              Test
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={turnOff} disabled={busy} className="h-7 text-xs border-foreground/10">
              Turn off
            </Button>
          </div>
        ) : device === 'off' ? (
          <Button type="button" size="sm" onClick={turnOn} disabled={busy} className="h-7 text-xs shrink-0">
            Turn on
          </Button>
        ) : null}
      </div>
      {message && <p className="text-[11px] text-primary">{message}</p>}

      {/* Were you working while away? */}
      <div className="flex items-start justify-between gap-3">
        <label htmlFor="idle-push" className="space-y-0.5 cursor-pointer">
          <span className="block text-sm font-medium">“Were you working while away?”</span>
          <span className="block text-[11px] text-muted-foreground leading-relaxed">
            When a timer keeps running but none of your devices has been active
            for 30 minutes.
          </span>
        </label>
        <Switch
          id="idle-push"
          checked={draft.idlePushEnabled}
          onCheckedChange={(v) => onChange({ idlePushEnabled: v })}
        />
      </div>

      {/* Open-task reminder */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <label htmlFor="pending-push" className="space-y-0.5 cursor-pointer">
            <span className="block text-sm font-medium">Remind me about open tasks</span>
            <span className="block text-[11px] text-muted-foreground leading-relaxed">
              One summary of what’s still open, on working days, so you can mark
              finished work done.
            </span>
          </label>
          <Switch
            id="pending-push"
            checked={draft.pendingReminderEnabled}
            onCheckedChange={(v) => onChange({ pendingReminderEnabled: v })}
          />
        </div>

        {draft.pendingReminderEnabled && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Starting at</span>
              <Input
                type="time"
                aria-label="First reminder time"
                value={draft.pendingReminderStart}
                // Any minute of the day. A cleared field keeps the last valid
                // time rather than saving an empty one.
                onChange={(e) => {
                  if (/^\d{2}:\d{2}$/.test(e.target.value)) {
                    onChange({ pendingReminderStart: e.target.value });
                  }
                }}
                className="h-8 text-xs bg-muted/30 border-foreground/10"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Every</span>
              <Select
                value={String(draft.pendingReminderIntervalMinutes)}
                onValueChange={(v) => onChange({ pendingReminderIntervalMinutes: Number(v) })}
              >
                <SelectTrigger aria-label="Reminder interval" className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {intervalLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Times a day</span>
              <Select
                value={String(draft.pendingReminderCount)}
                onValueChange={(v) => onChange({ pendingReminderCount: Number(v) })}
              >
                <SelectTrigger aria-label="Reminders per day" className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {anyEnabled && (
        <p className="text-[11px] text-muted-foreground">
          Times are in <span className="font-mono">{timezone}</span>. Reminders go to
          every device you turned notifications on for.
          {device !== 'on' && device !== 'loading' && ' Turn them on for this device above.'}
        </p>
      )}
    </div>
  );
}
