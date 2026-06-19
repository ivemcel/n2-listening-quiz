/**
 * Multi-layered data backup and recovery.
 *
 * Strategy:
 *   Primary:  zustand persist key (n2-listening-store)
 *   Backup:   mirror key updated on every change (n2-listening-store-backup)
 *   Snapshot: daily snapshot, kept for 7 days (n2-listening-store-snap-YYYY-MM-DD)
 *
 * On app start, if primary is missing/corrupt, auto-restore from backup → snapshot.
 */

const PRIMARY_KEY = 'n2-listening-store';
const BACKUP_KEY = 'n2-listening-store-backup';
const SNAP_PREFIX = 'n2-listening-store-snap-';
const MAX_SNAPSHOTS = 7;
const LAST_BACKUP_DATE_KEY = 'n2-listening-store-last-backup-date';

// ─── Write ──────────────────────────────────────────────────

/** Mirror the primary store value to backup + daily snapshot. */
export function writeBackup() {
  try {
    const raw = localStorage.getItem(PRIMARY_KEY);
    if (!raw) return;

    // Verify it's valid JSON
    JSON.parse(raw);

    // Write mirror backup
    localStorage.setItem(BACKUP_KEY, raw);

    // Write daily snapshot (once per day)
    const today = new Date().toISOString().slice(0, 10); // "2026-06-19"
    const lastDate = localStorage.getItem(LAST_BACKUP_DATE_KEY);
    if (lastDate !== today) {
      const snapKey = SNAP_PREFIX + today;
      localStorage.setItem(snapKey, raw);
      localStorage.setItem(LAST_BACKUP_DATE_KEY, today);

      // Prune old snapshots (keep only MAX_SNAPSHOTS most recent)
      pruneSnapshots();
    }
  } catch {
    // localStorage might be full or unavailable — fail silently
  }
}

// ─── Read / Recovery ────────────────────────────────────────

/**
 * Attempt to recover data if primary key is missing or corrupt.
 * Returns { recovered: boolean, source: string | null, data: any | null }
 */
export function tryRecover() {
  // 1. Primary key is fine — nothing to do
  const primary = safeRead(PRIMARY_KEY);
  if (primary) return { recovered: false, source: null, data: null };

  // 2. Try backup key
  const backup = safeRead(BACKUP_KEY);
  if (backup) {
    restore(backup, BACKUP_KEY);
    return { recovered: true, source: '备份', data: backup.raw };
  }

  // 3. Try latest snapshot
  const snapshots = getSnapshots();
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snap = safeRead(snapshots[i]);
    if (snap) {
      restore(snap, snapshots[i]);
      return { recovered: true, source: `${snapshots[i].replace(SNAP_PREFIX, '')} 快照`, data: snap.raw };
    }
  }

  return { recovered: false, source: null, data: null };
}

/** Restore parsed data to the primary key. */
function restore(parsed, sourceKey) {
  try {
    localStorage.setItem(PRIMARY_KEY, parsed.raw);
    console.log(`🛟 N2数据已从 ${sourceKey} 恢复`);
  } catch {
    // fail silently
  }
}

// ─── Helpers ────────────────────────────────────────────────

function safeRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { raw, parsed };
  } catch {
    // Corrupt entry — remove it so it doesn't block future recovery
    try { localStorage.removeItem(key); } catch {}
    return null;
  }
}

function getSnapshots() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SNAP_PREFIX)) keys.push(k);
    }
    return keys.sort(); // chronological order
  } catch {
    return [];
  }
}

function pruneSnapshots() {
  const keys = getSnapshots();
  if (keys.length <= MAX_SNAPSHOTS) return;
  const toRemove = keys.slice(0, keys.length - MAX_SNAPSHOTS);
  for (const k of toRemove) {
    try { localStorage.removeItem(k); } catch {}
  }
}

// ─── Export helpers ─────────────────────────────────────────

/** Get total data size in bytes for info display. */
export function getDataSize() {
  try {
    const raw = localStorage.getItem(PRIMARY_KEY);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
}

/** Get list of available snapshots with dates. */
export function getSnapshotDates() {
  return getSnapshots().map(k => k.replace(SNAP_PREFIX, ''));
}
