import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TAG_CHIP_CLASSES, TAG_SWATCH_CLASSES, TAG_COLOR_LABELS } from '@/lib/tagColors';
import { TAG_COLORS } from '@/types';
import type { TagColor } from '@/types';

interface TagPickerProps {
  selectedIds: string[];
  onToggle: (tagId: string) => void;
}

const PANEL_WIDTH = 256; // matches w-64
const PANEL_MAX_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;

interface PanelPosition {
  top: number;
  left: number;
  openUp: boolean;
  maxHeight: number;
}

/**
 * Picks from the user's shared tag library. Tags are never created per-task —
 * typing a name that doesn't exist yet offers "Create tag", which adds it to
 * the library so every other task can reuse it.
 *
 * The panel renders in a portal with fixed positioning: the task row, the
 * details animation wrapper and the group expander all clip overflow, so an
 * absolutely positioned dropdown would be cut off inside them.
 */
export function TagPicker({ selectedIds, onToggle }: TagPickerProps) {
  const { tags, createTag, deleteTag } = useApp();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [color, setColor] = useState<TagColor>('sky');
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    // Prefer below; flip up only when below is cramped and above has more room.
    const openUp = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;

    setPosition({
      top: openUp ? rect.top - VIEWPORT_MARGIN : rect.bottom + VIEWPORT_MARGIN,
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
      ),
      openUp,
      // Floor it so a cramped viewport yields a usable panel rather than a sliver.
      maxHeight: Math.max(
        200,
        Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
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
    // Follow the trigger when anything scrolls or the window resizes.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    inputRef.current?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  const trimmed = query.trim();

  const filtered = useMemo(() => {
    if (!trimmed) return tags;
    const needle = trimmed.toLowerCase();
    return tags.filter((t) => t.label.toLowerCase().includes(needle));
  }, [tags, trimmed]);

  const exactMatch = useMemo(
    () => tags.some((t) => t.label.toLowerCase() === trimmed.toLowerCase()),
    [tags, trimmed],
  );

  const canCreate = trimmed.length > 0 && !exactMatch;

  const handleCreate = () => {
    const tag = createTag(trimmed, color);
    if (!tag) return;
    if (!selectedIds.includes(tag.id)) onToggle(tag.id);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="h-8 rounded-lg gap-1.5 text-xs font-semibold"
      >
        <TagIcon className="w-3.5 h-3.5" />
        {selectedIds.length > 0 ? `${selectedIds.length} tagged` : 'Add tags'}
      </Button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: PANEL_WIDTH,
              maxHeight: position.maxHeight,
              transform: position.openUp ? 'translateY(-100%)' : undefined,
            }}
            className="z-[100] flex flex-col rounded-xl border border-white/10 bg-card shadow-2xl p-2 gap-2 overflow-hidden"
          >
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Search or create…"
              maxLength={24}
              className="h-8 bg-background/40 border-white/10 text-xs rounded-lg shrink-0"
            />

            <ul className="flex-1 min-h-0 overflow-y-auto space-y-0.5" role="listbox">
              {filtered.map((tag) => {
                const selected = selectedIds.includes(tag.id);
                return (
                  <li key={tag.id} className="group/tag flex items-center gap-1">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onToggle(tag.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer text-left"
                    >
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          TAG_SWATCH_CLASSES[tag.color],
                        )}
                      />
                      <span className="text-xs truncate flex-1">{tag.label}</span>
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTag(tag.id)}
                      aria-label={`Delete tag ${tag.label} from library`}
                      title="Delete from library"
                      className="p-1 rounded-md text-muted-foreground opacity-0 group-hover/tag:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}

              {filtered.length === 0 && !canCreate && (
                <li className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  No tags yet — type a name to create one.
                </li>
              )}
            </ul>

            {canCreate && (
              <div className="border-t border-white/5 pt-2 space-y-2 shrink-0">
                <div
                  role="radiogroup"
                  aria-label="New tag colour"
                  className="flex items-center gap-1 px-1"
                >
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={color === c}
                      aria-label={TAG_COLOR_LABELS[c]}
                      title={TAG_COLOR_LABELS[c]}
                      onClick={() => setColor(c)}
                      className={cn(
                        'w-4 h-4 rounded-full transition-all cursor-pointer shrink-0',
                        TAG_SWATCH_CLASSES[c],
                        color === c
                          ? 'ring-2 ring-offset-2 ring-offset-card ring-white/70'
                          : 'opacity-50 hover:opacity-100',
                      )}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCreate}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-primary truncate">
                    Create “{trimmed}”
                  </span>
                  <span
                    className={cn(
                      'ml-auto px-1.5 py-0.5 rounded-full border text-[9px] font-bold shrink-0',
                      TAG_CHIP_CLASSES[color],
                    )}
                  >
                    {TAG_COLOR_LABELS[color]}
                  </span>
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
