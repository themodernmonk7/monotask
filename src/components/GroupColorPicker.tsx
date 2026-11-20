import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TAG_COLORS } from '@/types';
import type { TagColor } from '@/types';
import { TAG_SWATCH_CLASSES, TAG_COLOR_LABELS } from '@/lib/tagColors';
import { cn } from '@/lib/utils';

interface GroupColorPickerProps {
  color: TagColor | undefined;
  onPick: (color: TagColor) => void;
}

const PANEL_WIDTH = 176;
const VIEWPORT_MARGIN = 8;

/**
 * The group's color swatch doubles as its picker trigger. Portaled with fixed
 * positioning for the same reason TagPicker is: the group card, its expand
 * wrapper and the task-row animation wrapper all clip overflow, so an
 * absolutely positioned popover here would get cut off the same way the tag
 * dropdown originally did.
 */
export function GroupColorPicker({ color, onPick }: GroupColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
      ),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        title="Group color"
        aria-label="Change group color"
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ring-1 ring-inset ring-white/10 hover:ring-white/25',
          color ? TAG_SWATCH_CLASSES[color] : 'bg-muted-foreground/20',
        )}
      />

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: position.top, left: position.left, width: PANEL_WIDTH }}
            className="z-[100] rounded-xl border border-foreground/10 bg-card shadow-2xl p-2.5"
          >
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Group color">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  title={TAG_COLOR_LABELS[c]}
                  onClick={() => {
                    onPick(c);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all cursor-pointer',
                    TAG_SWATCH_CLASSES[c],
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-card ring-white/70'
                      : 'opacity-60 hover:opacity-100',
                  )}
                />
              ))}
            </div>
            {color && (
              <button
                type="button"
                onClick={() => {
                  onPick(color); // same color -> clears, per setGroupColor's toggle semantics
                  setOpen(false);
                }}
                className="w-full mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Clear color
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
