// Atomic undo/redo history. Only commit() mutates durable state: it clones the
// document, lets the caller mutate the draft, validates, and stores a snapshot
// only if the mutation succeeded. Failed mutations leave history untouched.
import type { Project } from './types';
import { deepClone } from './util';
import { serializeProject } from './serialize';

interface Snapshot {
  label: string;
  project: Project;
}

export class History {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private _current: Project;
  private limit: number;
  private costs = new WeakMap<Project,number>();
  private committing = false;

  constructor(project: Project, limit = 50, private maxBytes = 128 * 1024 * 1024) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('history limit must be a positive safe integer');
    if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error('history byte budget must be positive');
    this.limit = limit;
    serializeProject(project);
    this._current = deepClone(project);
  }

  get current(): Project {
    return this._current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string {
    return this.canUndo ? this.past[this.past.length - 1].label : '';
  }

  get redoLabel(): string {
    return this.canRedo ? this.future[this.future.length - 1].label : '';
  }

  /**
   * Run `mutate` against a deep clone of the current project. If it throws,
   * the current document and history are left untouched and the error
   * propagates. On success the draft is validated and becomes the new current
   * document; the previous state is pushed onto the undo stack.
   */
  commit(label: string, mutate: (draft: Project) => void): Project {
    if (this.committing) throw new Error('History mutations cannot be nested');
    const draft = deepClone(this._current);
    this.committing = true;
    let committed: Project;
    try {
      const result: unknown = mutate(draft);
      if (result !== null && (typeof result === 'object' || typeof result === 'function') && typeof (result as { then?: unknown }).then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw new Error('History mutations must be synchronous');
      }
      serializeProject(draft);
      committed = deepClone(draft);
    } finally {
      this.committing = false;
    }
    this.pushUndo({ label, project: this._current });
    this.future = [];
    this._current = committed;
    return this._current;
  }

  undo(): Project {
    if (this.committing) throw new Error('History mutations cannot be nested');
    const prev = this.past.pop();
    if (!prev) throw new Error('nothing to undo');
    this.future.push({ label: prev.label, project: this._current });
    this._current = prev.project;
    return this._current;
  }

  redo(): Project {
    if (this.committing) throw new Error('History mutations cannot be nested');
    const next = this.future.pop();
    if (!next) throw new Error('nothing to redo');
    this.past.push({ label: next.label, project: this._current });
    this._current = next.project;
    return this._current;
  }

  /** Replace the document (load/new); history resets intentionally. */
  reset(project: Project): void {
    if (this.committing) throw new Error('History mutations cannot be nested');
    serializeProject(project);
    this.past = [];
    this.future = [];
    this._current = deepClone(project);
  }

  private pushUndo(snapshot: Snapshot): void {
    this.past.push(snapshot);
    this.future = [];
    while (this.past.length > this.limit || (this.retainedBytes > this.maxBytes && this.past.length > 1)) this.past.shift();
  }

  get retainedBytes(): number {
    return [...this.past, ...this.future].reduce((total, entry) => {
      let bytes=this.costs.get(entry.project);
      if(bytes===undefined){bytes=new TextEncoder().encode(JSON.stringify(entry.project)).byteLength*2;this.costs.set(entry.project,bytes);}
      return total+bytes;
    },0);
  }
}
