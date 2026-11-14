export interface IdlePromptState {
  taskId: string;
  idleSeconds: number;
  /**
   * True when the idle time is already inside the task's elapsedSeconds (the
   * tab was open and the tick resumed on return), false when it was never
   * credited (a gap restored from the server after a reload).
   */
  alreadyCounted: boolean;
}

export interface IdleAdjustment {
  /** Seconds to add to (or subtract from) the task's elapsed total. */
  elapsedDelta: number;
  /**
   * Whether activeSessionStart must be moved to now. Declining idle time
   * requires it, or the derived live segment would still span the gap.
   */
  restartLiveSegment: boolean;
}

/**
 * Works out how to settle idle time, which is error-prone precisely because
 * the two cases need *opposite* arithmetic:
 *
 *   - Reload  (alreadyCounted: false) — the gap was never added, so keeping it
 *     must ADD, and discarding must do nothing.
 *   - Tab return (alreadyCounted: true) — the browser already counted it, so
 *     keeping it must do nothing, and discarding must SUBTRACT.
 *
 * Getting this backwards either inflates the day or silently steals real work,
 * which is why it lives here with tests rather than inline in a callback.
 */
export function resolveIdleAdjustment(
  prompt: IdlePromptState,
  decision: 'keep' | 'discard',
): IdleAdjustment {
  if (decision === 'keep') {
    return {
      elapsedDelta: prompt.alreadyCounted ? 0 : prompt.idleSeconds,
      restartLiveSegment: false,
    };
  }

  return {
    // `|| 0` normalises -0, which would otherwise leak into state and compare
    // unequal to 0 under Object.is.
    elapsedDelta: prompt.alreadyCounted ? -prompt.idleSeconds || 0 : 0,
    restartLiveSegment: true,
  };
}
