/**
 * Export bundle helpers: name sanitizing, resource caps and the ZIP/download
 * plumbing shared by exportOBJ/exportGLTF and the UI.
 */

import { zipSync, strToU8 } from 'fflate';
import type { ExportBundle, ExportFile } from '../core/types';

export const EXPORT_LIMITS = {
  maxFiles: 64,
  maxFileBytes: 64 * 1024 * 1024,
  maxBundleBytes: 128 * 1024 * 1024,
} as const;

/**
 * Sanitize a file name: keep it ASCII, printable and path-safe. This is our
 * own policy — the character set is chosen independently.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = (name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._ +\-,'()!#&;\[\]]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  const safe = cleaned.length ? cleaned : 'untitled';
  return safe.length > 128 ? safe.slice(0, 128) : safe;
}

/** Derive a bundle-unique base name from the project name. */
export function sanitizeBaseName(name: string): string {
  const base = sanitizeFileName(name).replace(/\.[^.]+$/, '');
  return base.length ? base : 'pivo-ortho-export';
}

export function validateBundle(bundle: ExportBundle): void {
  if (!bundle || !Array.isArray(bundle.files) || bundle.files.length === 0) {
    throw new Error('validateBundle: bundle has no files');
  }
  if (bundle.files.length > EXPORT_LIMITS.maxFiles) {
    throw new Error(`validateBundle: too many files (${bundle.files.length} > ${EXPORT_LIMITS.maxFiles})`);
  }
  let total = 0;
  const seen = new Set<string>();
  for (const f of bundle.files) {
    if (!f || typeof f.name !== 'string' || !f.name.length) throw new Error('validateBundle: file without name');
    const safe = sanitizeFileName(f.name);
    if (seen.has(safe)) throw new Error(`validateBundle: duplicate file name ${safe}`);
    seen.add(safe);
    const size = typeof f.data === 'string' ? f.data.length : f.data.byteLength;
    if (size > EXPORT_LIMITS.maxFileBytes) {
      throw new Error(`validateBundle: ${safe} is too large (${size} bytes)`);
    }
    total += size;
    if (total > EXPORT_LIMITS.maxBundleBytes) {
      throw new Error('validateBundle: bundle exceeds size cap');
    }
  }
}

/** Trigger a browser download for one file. Must run in a browser context. */
export function downloadFile(file: ExportFile): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    throw new Error('downloadFile: requires a browser environment');
  }
  const safeName = sanitizeFileName(file.name);
  const body: BlobPart = typeof file.data === 'string'
    ? file.data
    : new Uint8Array(file.data); // copy: Blob parts must not be mutated views
  const blob = new Blob([body], { type: file.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/**
 * Download a bundle: single file downloads directly, multi-file bundles are
 * zipped into `<baseName>.zip`. Throws (visible failure, never silent) if the
 * bundle is invalid or the environment cannot download.
 */
export function downloadBundle(bundle: ExportBundle, baseName: string): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('downloadBundle: requires a browser environment');
  }
  if (!bundle || !Array.isArray(bundle.files) || bundle.files.length === 0) {
    throw new Error('downloadBundle: nothing to download');
  }
  const safeBase = sanitizeBaseName(baseName);
  if (bundle.files.length === 1) {
    downloadFile({ ...bundle.files[0], name: `${safeBase}-${bundle.files[0].name}` });
    return;
  }
  const zipBytes = zipBundle(bundle, safeBase);
  downloadFile({ name: `${safeBase}.zip`, data: zipBytes, mime: 'application/zip' });
}

export function isZipWorthy(bundle: ExportBundle): boolean {
  return bundle.files.length > 1;
}

/** ZIP a bundle's files together via fflate (deterministic order). */
export function zipBundle(bundle: ExportBundle, baseName: string): Uint8Array {
  validateBundle(bundle);
  const entries: Record<string, Uint8Array> = {};
  for (const f of bundle.files) {
    entries[sanitizeFileName(f.name)] = typeof f.data === 'string' ? strToU8(f.data) : f.data;
  }
  return zipSync(entries, { level: 6 });
}

export function makeExportFile(name: string, data: Uint8Array | string, mime: string): ExportFile {
  return { name: sanitizeFileName(name), data, mime };
}
