import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Target, Calendar, Check, Bell, Play, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playChime } from '@/lib/chime';
import { downloadBackup } from '@/lib/backup';
import type { AppSettings } from '@/types';
import { NotificationSettings, type NotificationDraft } from './NotificationSettings';
import { deviceTimezone } from '@/lib/push';
import { AppBadgeSetting } from './AppBadgeSetting';

const REMINDER_PRESETS = [5, 10, 15, 30];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon', full: 'Monday' },
  { value: 2, label: 'Tue', full: 'Tuesday' },
  { value: 3, label: 'Wed', full: 'Wednesday' },
  { value: 4, label: 'Thu', full: 'Thursday' },
  { value: 5, label: 'Fri', full: 'Friday' },
  { value: 6, label: 'Sat', full: 'Saturday' },
  { value: 0, label: 'Sun', full: 'Sunday' },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SettingsForm({
  settings,
  onSave,
  onCancel,
  onDownloadBackup,
}: {
  settings: AppSettings;
  onSave: (next: Partial<AppSettings>) => void;
  onCancel: () => void;
  onDownloadBackup: () => void;
}) {
  const [hours, setHours] = useState(() =>
    Math.floor(settings.dailyTargetMinutes / 60)
  );
  const [minutes, setMinutes] = useState(
    () => settings.dailyTargetMinutes % 60
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    () => settings.workingDays
  );
  const [reminderEnabled, setReminderEnabled] = useState(
    () => settings.timerReminderEnabled
  );
  const [reminderMinutes, setReminderMinutes] = useState(
    () => settings.timerReminderMinutes
  );

  const [notifications, setNotifications] = useState<NotificationDraft>(() => ({
    idlePushEnabled: settings.idlePushEnabled,
    pendingReminderEnabled: settings.pendingReminderEnabled,
    pendingReminderStart: settings.pendingReminderStart,
    pendingReminderIntervalMinutes: settings.pendingReminderIntervalMinutes,
    pendingReminderCount: settings.pendingReminderCount,
  }));

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least one working day
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort();
    });
  };

  const setPreset = (preset: 'mon-fri' | 'mon-sat' | 'all') => {
    if (preset === 'mon-fri') setSelectedDays([1, 2, 3, 4, 5]);
    if (preset === 'mon-sat') setSelectedDays([1, 2, 3, 4, 5, 6]);
    if (preset === 'all') setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const handleSave = () => {
    const totalMinutes = Math.max(1, hours * 60 + minutes);
    onSave({
      dailyTargetMinutes: totalMinutes,
      workingDays: selectedDays,
      timerReminderEnabled: reminderEnabled,
      timerReminderMinutes: reminderMinutes,
      ...notifications,
      // Reminder times are meant in the zone of the device you set them on.
      timezone: deviceTimezone(),
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-primary mb-1">
          <Target className="w-5 h-5" />
          <DialogTitle>Time Tracking Settings</DialogTitle>
        </div>
        <DialogDescription>
          Configure your daily working hour target and standard working days.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-2">
        {/* Daily Target Setting */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Daily Target</span>
            <span className="text-primary font-mono text-sm lowercase">
              {hours}h {minutes > 0 ? `${minutes}m` : ''} ({hours * 60 + minutes} mins)
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Hours</span>
              <Input
                type="number"
                min="0"
                max="24"
                value={hours}
                onChange={(e) =>
                  setHours(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
                className="bg-muted/30 border-foreground/10 font-mono text-base"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Minutes</span>
              <Input
                type="number"
                min="0"
                max="59"
                step="5"
                value={minutes}
                onChange={(e) =>
                  setMinutes(
                    Math.min(
                      59,
                      Math.max(0, parseInt(e.target.value, 10) || 0)
                    )
                  )
                }
                className="bg-muted/30 border-foreground/10 font-mono text-base"
              />
            </div>
          </div>

          {/* Quick target presets */}
          <div className="flex items-center gap-1.5 pt-1">
            {[6, 7, 8, 9].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setHours(h);
                  setMinutes(0);
                }}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer font-medium',
                  hours === h && minutes === 0
                    ? 'bg-primary/20 border-primary/40 text-primary font-bold'
                    : 'bg-muted/20 border-foreground/5 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                {h} Hours {h === 7 ? '(Default)' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-foreground/5" />

        {/* Working Days Setting */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Working Days</span>
            </label>
            <span className="text-xs text-muted-foreground">
              {selectedDays.length} days / week
            </span>
          </div>

          {/* Day Pills */}
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    'flex flex-col items-center justify-center py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer',
                    isSelected
                      ? 'bg-primary/20 border-primary/40 text-primary shadow-[0_0_10px_oklch(var(--primary)/15%)]'
                      : 'bg-muted/10 border-foreground/5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
                  )}
                >
                  <span>{day.label}</span>
                  {isSelected && (
                    <Check className="w-3 h-3 mt-0.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2 pt-1 text-xs">
            <span className="text-muted-foreground/60 text-[11px]">Presets:</span>
            <button
              type="button"
              onClick={() => setPreset('mon-fri')}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Mon–Fri
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              type="button"
              onClick={() => setPreset('mon-sat')}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Mon–Sat
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              type="button"
              onClick={() => setPreset('all')}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Every day
            </button>
          </div>
        </div>

        <div className="h-px bg-foreground/5" />

        {/* Timer Reminder Sound Setting */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="reminder-toggle"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-primary" />
              <span>Timer Reminder</span>
            </label>
            <Switch
              id="reminder-toggle"
              checked={reminderEnabled}
              onCheckedChange={setReminderEnabled}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Play a short sound on a repeat while a timer is running, so it's
            easy to notice it's still going — even if you've switched to
            another tab or app.
          </p>

          {reminderEnabled && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-1.5">
                {REMINDER_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setReminderMinutes(m)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer font-medium',
                      reminderMinutes === m
                        ? 'bg-primary/20 border-primary/40 text-primary font-bold'
                        : 'bg-muted/20 border-foreground/5 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    )}
                  >
                    {m} min
                  </button>
                ))}
                <Input
                  type="number"
                  min="1"
                  max="180"
                  value={reminderMinutes}
                  onChange={(e) =>
                    setReminderMinutes(
                      Math.min(180, Math.max(1, parseInt(e.target.value, 10) || 1))
                    )
                  }
                  className="bg-muted/30 border-foreground/10 font-mono text-sm h-7 w-16 ml-auto"
                  aria-label="Custom reminder interval in minutes"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => playChime()}
                className="rounded-lg gap-1.5 text-xs border-foreground/10"
              >
                <Play className="w-3 h-3 fill-current" />
                Preview sound
              </Button>
            </div>
          )}
        </div>

        <div className="h-px bg-foreground/5" />

        <AppBadgeSetting />

        <NotificationSettings
          draft={notifications}
          onChange={(next) => setNotifications((prev) => ({ ...prev, ...next }))}
          timezone={deviceTimezone()}
        />

        <div className="h-px bg-foreground/5" />

        {/* Backup */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Your Data</span>
          </label>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Download everything — tasks, sessions, notes, tags and settings —
            as one JSON file you keep for yourself.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDownloadBackup}
            className="rounded-lg gap-1.5 text-xs border-foreground/10"
          >
            <Download className="w-3.5 h-3.5" />
            Download my data
          </Button>
        </div>
      </div>

      <DialogFooter className="mt-4 gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="text-muted-foreground"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} className="rounded-xl">
          Save Settings
        </Button>
      </DialogFooter>
    </>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, updateSettings, groups, completedTasks, sessions, noteGroups, tags } =
    useApp();

  const handleSave = (next: Partial<AppSettings>) => {
    updateSettings(next);
    onOpenChange(false);
  };

  const handleDownloadBackup = () => {
    downloadBackup({ groups, completedTasks, sessions, noteGroups, tags, settings });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <SettingsForm
            settings={settings}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
            onDownloadBackup={handleDownloadBackup}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
