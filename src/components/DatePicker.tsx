import { useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Date and month pickers built on shadcn's Popover + Calendar, replacing the
 * browser-native inputs (which look different in every browser and ignore
 * the app theme).
 *
 * Values stay as the same strings the native inputs produced —
 * 'yyyy-MM-dd' for a day, 'yyyy-MM' for a month — so callers' state and
 * date maths are unchanged.
 */

const DAY_FORMAT = 'yyyy-MM-dd';
const MONTH_FORMAT = 'yyyy-MM';

function parseDay(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, DAY_FORMAT, new Date());
  return isValid(d) ? d : undefined;
}

interface DatePickerProps {
  /** 'yyyy-MM-dd', or '' for none. */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable day, 'yyyy-MM-dd'. */
  max?: string;
  /** Earliest selectable day, 'yyyy-MM-dd'. */
  min?: string;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  className?: string;
  /** How the chosen day reads on the button. */
  displayFormat?: string;
}

export function DatePicker({
  value,
  onChange,
  max,
  min,
  placeholder = 'Pick a date',
  id,
  'aria-label': ariaLabel,
  className,
  displayFormat = 'EEE, MMM d, yyyy',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);
  const maxDate = parseDay(max);
  const minDate = parseDay(min);

  const disabled = [
    ...(maxDate ? [{ after: maxDate }] : []),
    ...(minDate ? [{ before: minDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'justify-start gap-2 font-normal bg-card/50 border-foreground/10',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
          <span className="truncate">
            {selected ? format(selected, displayFormat) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate}
          endMonth={maxDate}
          startMonth={minDate}
          disabled={disabled}
          captionLayout="dropdown"
          onSelect={(d) => {
            if (!d) return; // clicking the selected day again keeps it
            onChange(format(d, DAY_FORMAT));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface MonthPickerProps {
  /** 'yyyy-MM'. */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable month, 'yyyy-MM'. */
  max?: string;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/** shadcn has no month picker; this is a year header over a 12-month grid. */
export function MonthPicker({
  value,
  onChange,
  max,
  id,
  'aria-label': ariaLabel,
  className,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parse(value, MONTH_FORMAT, new Date()) : undefined;
  const valid = selected && isValid(selected) ? selected : undefined;
  const [year, setYear] = useState(() => (valid ?? new Date()).getFullYear());

  const maxDate = max ? parse(max, MONTH_FORMAT, new Date()) : undefined;
  const isAfterMax = (y: number, m: number) =>
    maxDate !== undefined &&
    (y > maxDate.getFullYear() || (y === maxDate.getFullYear() && m > maxDate.getMonth()));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear((valid ?? new Date()).getFullYear());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'justify-start gap-2 font-normal bg-card/50 border-foreground/10',
            !valid && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
          {valid ? format(valid, 'MMMM yyyy') : 'Pick a month'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous year"
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">{year}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next year"
            disabled={maxDate !== undefined && year >= maxDate.getFullYear()}
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, m) => {
            const isSelected =
              valid !== undefined && valid.getFullYear() === year && valid.getMonth() === m;
            return (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'ghost'}
                disabled={isAfterMax(year, m)}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(format(new Date(year, m, 1), MONTH_FORMAT));
                  setOpen(false);
                }}
                className="h-8 text-xs"
              >
                {format(new Date(year, m, 1), 'MMM')}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
