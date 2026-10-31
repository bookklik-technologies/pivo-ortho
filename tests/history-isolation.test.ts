import { describe, expect, it } from 'vitest';
import { createProject, History, type Project } from '../src/core/index';

describe('history transaction isolation', () => {
  it('detaches retained drafts from committed documents and history', () => {
    const history = new History(createProject());
    let retained: Project | undefined;
    history.commit('rename', draft => { draft.name = 'committed'; retained = draft; });
    retained!.name = 'late';
    expect(history.current.name).toBe('committed');
    history.undo();
    history.redo();
    expect(history.current.name).toBe('committed');
  });

  it('rejects async callbacks without losing redo or leaking late writes', async () => {
    const history = new History(createProject());
    history.commit('rename', draft => { draft.name = 'saved'; });
    history.undo();
    const before = structuredClone(history.current);
    expect(() => history.commit('async', async draft => { await Promise.resolve(); draft.name = 'late'; throw new Error('late rejection'); })).toThrow(/synchronous/);
    await Promise.resolve();
    expect(history.current).toEqual(before);
    expect(history.canRedo).toBe(true);
  });

  it('rejects nested history operations', () => {
    const history = new History(createProject());
    expect(() => history.commit('nested', () => { history.reset(createProject()); })).toThrow(/nested/);
    expect(history.canUndo).toBe(false);
    history.commit('rename', draft => { draft.name = 'usable'; });
    expect(history.current.name).toBe('usable');
  });

  it('rejects non-finite and fractional history limits', () => {
    for (const limit of [NaN, Infinity, 0, -1, 1.5]) expect(() => new History(createProject(), limit)).toThrow(/limit/);
    for (const bytes of [NaN, Infinity, 0, -1]) expect(() => new History(createProject(), 2, bytes)).toThrow(/budget/);
  });
});
