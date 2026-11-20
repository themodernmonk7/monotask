import type {
  Group,
  CompletedTask,
  WorkSession,
  NoteGroup,
  Tag,
  AppSettings,
} from '../types';

/**
 * Shape of a downloaded backup. Versioned on its own (not tied to the DB
 * schema version) so a future format change can still recognise and read an
 * older file if this is ever extended with an import feature.
 */
export interface BackupFile {
  format: 'monotask-backup';
  version: 1;
  exportedAt: string; // ISO timestamp
  data: {
    groups: Group[];
    completedTasks: CompletedTask[];
    sessions: WorkSession[];
    noteGroups: NoteGroup[];
    tags: Tag[];
    settings: AppSettings;
  };
}

export function buildBackup(data: BackupFile['data']): BackupFile {
  return {
    format: 'monotask-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** yyyy-mm-dd, safe for a filename, no locale ambiguity. */
function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Downloads everything currently in memory as a JSON file — the full
 * working state, not a re-fetch, so it reflects exactly what you see on
 * screen even if a sync is still pending.
 */
export function downloadBackup(data: BackupFile['data']): void {
  const backup = buildBackup(data);
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `monotask-backup-${todayStamp()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
