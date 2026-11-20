import { useEffect, useState } from 'react';
import { Share2, Copy, Check, Link2, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  createSharedReport,
  listMySharedReports,
  revokeSharedReport,
  sharedReportUrl,
} from '@/lib/sharedReports';
import type { ReportSnapshot, SharedReportSummary } from '@/lib/sharedReports';

interface ShareReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodLabel: string;
  snapshot: ReportSnapshot;
}

/**
 * A share is a frozen summary, not a live view — created once, from exactly
 * what's on screen right now, and never updates again even if more time gets
 * logged for that period later. That's a deliberate privacy/safety choice:
 * a link never grows to reveal data its recipient wasn't shown originally.
 */
export function ShareReportDialog({
  open,
  onOpenChange,
  periodLabel,
  snapshot,
}: ShareReportDialogProps) {
  const { user, displayName } = useAuth();

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [links, setLinks] = useState<SharedReportSummary[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadLinks = async () => {
    if (!user) return;
    const { data } = await listMySharedReports(user.id);
    setLinks(data);
  };

  useEffect(() => {
    if (!open) return;
    setNewLink(null);
    setCreateError(null);
    setCopied(false);
    void loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    setCreateError(null);

    const { id, error } = await createSharedReport(
      user.id,
      periodLabel,
      displayName,
      snapshot,
    );

    setCreating(false);
    if (error || !id) {
      setCreateError(error || 'Could not create the link.');
      return;
    }

    setNewLink(sharedReportUrl(id));
    void loadLinks();
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be denied — the link is still on screen to select.
    }
  };

  const handleRevoke = async (id: string) => {
    if (!user) return;
    setRevokingId(id);
    await revokeSharedReport(id, user.id);
    setRevokingId(null);
    void loadLinks();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Share2 className="w-5 h-5" />
            <DialogTitle>Share this report</DialogTitle>
          </div>
          <DialogDescription>
            Anyone with the link can view a read-only summary for{' '}
            <span className="font-medium text-foreground">{periodLabel}</span> —
            no sign-in needed. It's a snapshot of what's on screen now, not a
            live view: logging more time later won't change what they see.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {!newLink ? (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full rounded-xl gap-2 font-bold"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              Create share link
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl p-2.5">
              <input
                readOnly
                value={newLink}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent text-xs font-mono text-foreground/90 outline-none"
              />
              <Button
                type="button"
                size="xs"
                onClick={() => handleCopy(newLink)}
                className="rounded-lg gap-1.5 shrink-0"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}

          {createError && (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              {createError}
            </p>
          )}

          {links && links.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Your shared links
              </span>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 bg-muted/20 border border-foreground/5 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground/90 truncate">
                        {link.periodLabel}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {link.reportType} ·{' '}
                        {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleCopy(sharedReportUrl(link.id))}
                        title="Copy link"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRevoke(link.id)}
                        disabled={revokingId === link.id}
                        title="Revoke link"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {revokingId === link.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
