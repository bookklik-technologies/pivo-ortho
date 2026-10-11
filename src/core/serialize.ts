// Project serialization. Serialize is a straight JSON dump (valid state only);
// parse is strict: schema checks, resource limits, prototype-pollution guards.
import type { Project } from './types';
import { validateProject, MAX_PROJECT_BYTES, ValidationError } from './validate';

export function serializeProject(project: Project): string {
  validateProject(project);
  return JSON.stringify(project);
}

/** Parse a stored project string strictly; throws ValidationError on any deviation. */
export function parseProject(text: string): Project {
  if (typeof text !== 'string') throw new ValidationError('project data must be a string');
  if (text.length > MAX_PROJECT_BYTES) {
    throw new ValidationError(`project exceeds the ${MAX_PROJECT_BYTES} byte limit`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ValidationError(`project is not valid JSON: ${(e as Error).message}`);
  }
  rejectDangerousKeys(parsed, '$root');
  validateProject(parsed);
  return parsed as Project;
}

const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor']);

function rejectDangerousKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) rejectDangerousKeys(value[i], `${path}[${i}]`);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (DANGEROUS.has(key)) {
        throw new ValidationError(`project contains a forbidden key "${key}" at ${path}`);
      }
      rejectDangerousKeys((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
}
