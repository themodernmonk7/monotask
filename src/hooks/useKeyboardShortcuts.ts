import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  /** Space — resume the last task, or pause the running one. */
  onToggleTimer?: () => void;
  /** N — focus the new-task field. */
  onNewTask?: () => void;
  /** / — focus the filter field. */
  onSearch?: () => void;
  /** Escape — pause whatever is running. */
  onPause?: () => void;
  /** Cmd/Ctrl+Z — undo the last destructive action. */
  onUndo?: () => void;
}

/** Typing in a field (or a dialog) must never trigger a global shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Keep the latest handlers without re-binding the listener on every render.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const h = ref.current;

      // Undo works even while typing — it is the usual expectation.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (h.onUndo) {
          event.preventDefault();
          h.onUndo();
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isModalOpen()) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          if (!h.onToggleTimer) return;
          event.preventDefault(); // stop the page scrolling
          h.onToggleTimer();
          break;
        case 'n':
        case 'N':
          if (!h.onNewTask) return;
          event.preventDefault();
          h.onNewTask();
          break;
        case '/':
          if (!h.onSearch) return;
          event.preventDefault();
          h.onSearch();
          break;
        case 'Escape':
          h.onPause?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
