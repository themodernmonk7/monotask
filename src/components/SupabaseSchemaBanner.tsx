import { useState } from 'react';
import { Database, Copy, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';
// Single source of truth for the schema — keeps this banner from drifting.
import SCHEMA_SQL from '../../supabase/schema.sql?raw';

export function SupabaseSchemaBanner() {
  const { retryLoad, isLoading } = useApp();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 text-xs text-amber-200 space-y-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Database className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-300">
              Supabase connected! Setup your database tables
            </p>
            <p className="text-amber-200/80 text-[11px] mt-0.5">
              Nothing is being saved yet. Run the schema script in your Supabase
              SQL Editor, then hit Retry. It is safe to run more than once.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="xs"
            onClick={handleCopy}
            className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied SQL!' : 'Copy SQL'}</span>
          </Button>

          <Button
            size="xs"
            onClick={retryLoad}
            disabled={isLoading}
            className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            <span>Retry</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            className="h-7 w-7 text-amber-400 hover:bg-amber-500/20 rounded-lg"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="bg-black/40 rounded-xl p-3 border border-amber-500/20 font-mono text-[10px] text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto">
          <pre>{SCHEMA_SQL}</pre>
        </div>
      )}
    </div>
  );
}
