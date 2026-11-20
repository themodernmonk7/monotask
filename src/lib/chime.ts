export const CHIME_SRC = '/sounds/timer-reminder.wav';

/**
 * How many reminder chimes should have fired by now for a run that has been
 * going for `elapsedMs`, spaced `intervalMinutes` apart.
 *
 * Pure so the "every N minutes, repeating" cadence is testable without a
 * timer, an Audio element, or a browser: the caller just needs to notice when
 * this number goes up and play one chime per increase.
 */
export function chimeCountSince(elapsedMs: number, intervalMinutes: number): number {
  if (intervalMinutes <= 0 || elapsedMs <= 0) return 0;
  return Math.floor(elapsedMs / (intervalMinutes * 60_000));
}

// One shared element rather than `new Audio()` per play, so overlapping
// triggers (a scheduled chime landing right as someone hits Preview) restart
// the same sound instead of stacking two overlapping playbacks.
let sharedAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio(CHIME_SRC);
  return sharedAudio;
}

/**
 * Plays the reminder chime immediately. Safe to call from a scheduled check
 * (no fresh user gesture) because starting a timer — the only way this ever
 * gets scheduled — is itself a click, and browsers keep audio unlocked for
 * the rest of the page's life once any gesture has occurred.
 */
export function playChime(): void {
  try {
    const audio = getAudio();
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Blocked (e.g. truly no interaction yet) — not worth surfacing to the
      // user over a reminder sound.
    });
  } catch {
    // Audio unsupported in this environment — same, just skip it.
  }
}
