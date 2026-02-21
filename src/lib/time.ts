/**
 * Format seconds as HH:MM:SS (e.g. 1h 20m -> 01:20:00)
 */
export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/**
 * Short label for completed tasks (e.g. "1h 20m", "45m")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (rm === 0) return `${h}h`
  return `${h}h ${rm}m`
}

/**
 * Group completed tasks by date (timestamp -> date key for display)
 */
export function groupByDate<T extends { completedAt: number }>(tasks: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const task of tasks) {
    const d = new Date(task.completedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const list = map.get(key) ?? []
    list.push(task)
    map.set(key, list)
  }
  return map
}

/**
 * Format date for section header (e.g. "Feb 21, 2026")
 */
export function formatDateHeader(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
