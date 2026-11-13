import { Search, X } from 'lucide-react';
import { useApp } from '@/hooks/useApp';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TAG_CHIP_CLASSES } from '@/lib/tagColors';
import type { RefObject } from 'react';

interface TagFilterBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  activeTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onClear: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  matchCount: number;
  totalCount: number;
}

/** Text search plus tag chips — what makes the tag library actually useful. */
export function TagFilterBar({
  query,
  onQueryChange,
  activeTagIds,
  onToggleTag,
  onClear,
  searchRef,
  matchCount,
  totalCount,
}: TagFilterBarProps) {
  const { tags } = useApp();
  const isFiltering = query.trim().length > 0 || activeTagIds.length > 0;

  return (
    <div className="space-y-2.5 mb-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClear();
              e.currentTarget.blur();
            }
          }}
          placeholder="Filter tasks…  (press / )"
          aria-label="Filter tasks"
          className="bg-muted/30 border-white/5 h-9 pl-9 pr-9 text-sm rounded-xl"
        />
        {isFiltering && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClear}
            title="Clear filters"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => {
            const active = activeTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                aria-pressed={active}
                className={cn(
                  'px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-tight transition-all cursor-pointer',
                  active
                    ? TAG_CHIP_CLASSES[tag.color]
                    : 'border-white/5 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                {tag.label}
              </button>
            );
          })}

          {isFiltering && (
            <span className="ml-auto text-[11px] text-muted-foreground font-mono tabular-nums">
              {matchCount} / {totalCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
