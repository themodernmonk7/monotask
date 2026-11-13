import type { TagColor } from '@/types';

/**
 * Tailwind can only see class names that appear literally in source, so tag
 * colours are a static lookup rather than an interpolated `bg-${color}-500`.
 */
export const TAG_CHIP_CLASSES: Record<TagColor, string> = {
  slate: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  red: 'bg-red-500/15 text-red-300 border-red-400/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
  pink: 'bg-pink-500/15 text-pink-300 border-pink-400/30',
};

export const TAG_SWATCH_CLASSES: Record<TagColor, string> = {
  slate: 'bg-slate-400',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  pink: 'bg-pink-400',
};

export const TAG_COLOR_LABELS: Record<TagColor, string> = {
  slate: 'Slate',
  red: 'Red',
  amber: 'Amber',
  emerald: 'Emerald',
  sky: 'Sky',
  violet: 'Violet',
  pink: 'Pink',
};
