import { RecoveryStore, type RecoveryEntry } from './suite-recovery';
import { recoveryEnabled } from './recovery-policy';

export const recovery = new RecoveryStore('pivo-ortho-recovery-v2');
const LEGACY_KEY = 'pivo-ortho:recovery:v1';

export async function inspectRecovery(): Promise<RecoveryEntry[]> {
  if (!recoveryEnabled) return [];
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(LEGACY_KEY); } catch { /* IndexedDB may still be available. */ }
  if (legacy !== null) await recovery.importLegacy(LEGACY_KEY, 'Previous Ortho session', legacy);
  return recovery.list();
}

export async function resolveRecovery(entry: RecoveryEntry): Promise<void> {
  if (!recoveryEnabled) throw new Error('Browser recovery is disabled');
  // Delete the legacy source only after a successful durable migration and an explicit decision.
  if (entry.legacyKey === LEGACY_KEY) {
    const current = localStorage.getItem(LEGACY_KEY);
    if (current === entry.data) localStorage.removeItem(LEGACY_KEY);
  }
  await recovery.discard(entry);
}
