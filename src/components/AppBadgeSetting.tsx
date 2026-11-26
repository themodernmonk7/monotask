import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { badgeSupported, getBadgeMode, setBadgeMode, type BadgeMode } from '@/lib/appBadge';

/**
 * Per-device choice for the Dock / taskbar badge. Applied immediately (it's
 * this device's display, not account data), so it isn't part of Save.
 */
export function AppBadgeSetting() {
  const [mode, setMode] = useState<BadgeMode>(getBadgeMode);
  if (!badgeSupported()) return null;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <span className="text-sm font-medium flex items-center gap-2">
          <AppWindow className="w-3.5 h-3.5 text-primary" />
          App icon badge
        </span>
        <span className="block text-[11px] text-muted-foreground leading-relaxed">
          While a timer runs, show it on the installed app’s Dock or taskbar icon.
          This device only.
        </span>
      </div>
      <Select
        value={mode}
        onValueChange={(v) => {
          const next = v as BadgeMode;
          setMode(next);
          setBadgeMode(next);
        }}
      >
        <SelectTrigger aria-label="App icon badge" className="h-8 w-32 data-[size=default]:h-8 text-xs bg-muted/30 border-foreground/10 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Minutes</SelectItem>
          <SelectItem value="dot">Dot</SelectItem>
          <SelectItem value="off">Off</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
