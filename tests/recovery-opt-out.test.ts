import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each(['?recovery=off', '?embed=1&recovery=on'])('does not inspect, migrate, or discard browser backups: %s', async search => {
  vi.resetModules();
  vi.stubGlobal('location', { search });
  const access = vi.fn(() => { throw new Error('Unexpected recovery storage access'); });
  vi.stubGlobal('localStorage', { getItem: access, removeItem: access });
  vi.stubGlobal('indexedDB', { open: access });
  const { inspectRecovery, resolveRecovery } = await import('../src/ui/recovery');
  expect(await inspectRecovery()).toEqual([]);
  await expect(resolveRecovery({ id: 'saved', version: 1, at: 1, name: 'backup', data: '{}', legacyKey: 'pivo-ortho:recovery:v1' })).rejects.toThrow(/disabled/);
  expect(access).not.toHaveBeenCalled();
});
