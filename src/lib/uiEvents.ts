/**
 * "Jump to this task" — dispatched by the daily target card's live tracker and
 * handled where the tab + scroll position actually live. A DOM event keeps the
 * card from needing to know about tab state or group expansion.
 */
const REVEAL_TASK_EVENT = 'monotask:reveal-task';

export interface RevealTaskDetail {
  taskId: string;
  groupId: string;
}

/** DOM id for a rendered task row, so it can be scrolled to. */
export function taskElementId(taskId: string): string {
  return `task-${taskId}`;
}

export function requestRevealTask(detail: RevealTaskDetail): void {
  window.dispatchEvent(new CustomEvent<RevealTaskDetail>(REVEAL_TASK_EVENT, { detail }));
}

/** Returns an unsubscribe function, so it can be returned straight from useEffect. */
export function onRevealTask(
  handler: (detail: RevealTaskDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<RevealTaskDetail>).detail);
  };
  window.addEventListener(REVEAL_TASK_EVENT, listener);
  return () => window.removeEventListener(REVEAL_TASK_EVENT, listener);
}

/**
 * "Focus the filter field" — the keyboard layer lives in App, the input lives
 * in GroupList, and neither should have to know about the other.
 */
const FOCUS_SEARCH_EVENT = 'monotask:focus-search';

export function requestFocusSearch(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
}

export function onFocusSearch(handler: () => void): () => void {
  window.addEventListener(FOCUS_SEARCH_EVENT, handler);
  return () => window.removeEventListener(FOCUS_SEARCH_EVENT, handler);
}

/** "Focus the new-task field of the first visible group." */
const NEW_TASK_EVENT = 'monotask:new-task';

export function requestNewTask(): void {
  window.dispatchEvent(new CustomEvent(NEW_TASK_EVENT));
}

export function onNewTask(handler: () => void): () => void {
  window.addEventListener(NEW_TASK_EVENT, handler);
  return () => window.removeEventListener(NEW_TASK_EVENT, handler);
}
