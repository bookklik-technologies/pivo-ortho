// Atomic undo/redo history. Only commit() mutates durable state: it clones the
// document, lets the caller mutate the draft, validates, and stores a snapshot
// only if the mutation succeeded. Failed mutations leave history untouched.
import type { Project } from './types';
import { deepClone } from './util';
import { validateProject } from './validate';

interface Snapshot {
  label: string;
  project: Project;
}

export class History {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private _current: Project;
  private limit: number;

  constructor(project: Project, limit = 50) {
    if (limit < 1) throw new Error('history limit must be at least 1');
    this.limit = limit;
    validateProject(project);
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
    const draft = deepClone(this._current);
    mutate(draft);
    validateProject(draft);
    this.pushUndo({ label, project: this._current });
    this.future = [];
    this._current = draft;
    return this._current;
  }

  undo(): Project {
    const prev = this.past.pop();
    if (!prev) throw new Error('nothing to undo');
    this.future.push({ label: prev.label, project: this._current });
    this._current = prev.project;
    return this._current;
  }

  redo(): Project {
    const next = this.future.pop();
    if (!next) throw new Error('nothing to redo');
    this.past.push({ label: next.label, project: this._current });
    this._current = next.project;
    return this._current;
  }

  /** Replace the document (load/new); history resets intentionally. */
  reset(project: Project): void {
    validateProject(project);
    this.past = [];
    this.future = [];
    validateProject(project);
    this._current = deepClone(project);
  }

  private pushUndo(snapshot: Snapshot): void {
    this.past.push(snapshot);
    while (this.past.length > this.limit) this.past.shift();
  }
}
