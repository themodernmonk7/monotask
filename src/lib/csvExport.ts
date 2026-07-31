import type { CompletedTask } from '../types';

/**
 * Format total seconds as HH:MM for Work hours column. Returns "00:00" if zero.
 */
export function formatWorkHours(seconds: number): string {
  if (!seconds || seconds <= 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Format timestamp for CSV date columns (Due Date, Completion Date)
 */
export function formatDateForCSV(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const CSV_HEADER_ROW =
  'Task Name,Owner,Custom Status,Tags,Start Date,Due Date,Duration,Priority,Created By,% Completed,Completion Date,Work hours,Billing Type';

function escapeCSVCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert completed tasks to CSV rows for export.
 * - Custom Status: Closed
 * - Start Date: empty (we don't store task created date)
 * - Due Date: when task finished (completedAt)
 * - Work hours: HH:MM from totalSeconds, or 00:00 if none
 * - Owner, Created By: empty
 */
function completedTasksToCSVRows(tasks: CompletedTask[]): string[][] {
  return tasks.map((task) => [
    task.taskName,
    '',
    'Closed',
    '',
    '',
    formatDateForCSV(task.completedAt),
    '-',
    'None',
    '',
    '100',
    formatDateForCSV(task.completedAt),
    formatWorkHours(task.totalSeconds),
    'None',
  ]);
}

/**
 * Build full CSV string and trigger download.
 */
export function downloadCompletedTasksCSV(tasks: CompletedTask[], filename: string): void {
  const rows = completedTasksToCSVRows(tasks);
  const csvContent = [CSV_HEADER_ROW, ...rows.map((row) => row.map(escapeCSVCell).join(','))].join(
    '\n',
  );
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
