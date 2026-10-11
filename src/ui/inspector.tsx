// PiVo Ortho — inspector: numeric transforms, face flags, primitive add.
import React from 'react';
import type { Axis, Mesh, Vec3 } from '../core/types';
import { createPrimitive, deleteFace, deleteVertices, extrudeFace, mergeVertices, mirrorMesh } from '../core';
import { useStore, emptySelection } from './store';
import { degToRad, radToDeg } from './units';

const PRIMS: Array<{ type: 'cube' | 'plane' | 'pyramid' | 'cylinder' | 'prism'; label: string }> = [
  { type: 'cube', label: 'Cube' },
  { type: 'plane', label: 'Plane' },
  { type: 'pyramid', label: 'Pyramid' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'prism', label: 'Tri. prism' },
];

export function Inspector(): React.JSX.Element {
  const { state, dispatch, commit } = useStore();
  const project = state.project;
  const sel = state.selection;

  const activeMesh = project.meshes.find((m) => m.id === sel.activeMeshId) ?? null;
  const meshLocked = (m: Mesh): boolean => {
    if (m.locked) return true;
    if (m.folderId) {
      const f = project.folders.find((x) => x.id === m.folderId);
      if (f?.locked) return true;
    }
    return false;
  };

  const patchMesh = (meshId: string, patch: Partial<Mesh>, label: string) => {
    commit(label, (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (!m) return;
      Object.assign(m, patch);
    });
  };

  const setVec = (meshId: string, field: 'position' | 'rotation' | 'scale' | 'pivot', index: number, value: number, label: string) => {
    commit(label, (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (!m) return;
      const arr = m[field] as Vec3;
      const next = [...arr] as Vec3;
      next[index] = value;
      m[field] = next;
    });
  };

  const addPrimitive = (type: 'cube' | 'plane' | 'pyramid' | 'cylinder' | 'prism') => {
    const ids: string[] = [];
    commit(`Add ${type}`, (draft) => {
      const prim = createPrimitive(type, `${type[0].toUpperCase()}${type.slice(1)} ${draft.meshes.length + 1}`);
      ids.push(prim.id);
      for (const f of prim.faces) f.textured = true;
      draft.meshes.push(prim);
    });
    if (ids[0]) {
      dispatch({
        t: 'setSelection',
        selection: { ...emptySelection(), meshIds: [ids[0]], activeMeshId: ids[0], kind: 'mesh' },
      });
    }
  };

  const activeFace = activeMesh?.faces.find((f) => f.id === sel.faceIds[0]) ?? null;

  const doExtrude = () => {
    if (!activeMesh || !activeFace) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    commit('Extrude face', (draft) => {
      const m = draft.meshes.find((x) => x.id === activeMesh.id);
      if (!m) return;
      extrudeFace(m, activeFace.id, 0.3);
    });
  };

  const doDeleteFace = () => {
    if (!activeMesh || !activeFace) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    const meshId = activeMesh.id;
    const faceId = activeFace.id;
    commit('Delete face', (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (!m) return;
      deleteFace(m, faceId);
      // application-level rule: removing last face removes the empty mesh
      if (m.faces.length === 0) draft.meshes = draft.meshes.filter((x) => x.id !== meshId);
    });
    dispatch({ t: 'setSelection', selection: { ...emptySelection(), meshIds: [meshId], activeMeshId: meshId, kind: 'mesh' } });
  };

  const doMirror = (axis: Axis) => {
    if (!activeMesh) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    commit(`Mirror ${axis}`, (draft) => {
      const m = draft.meshes.find((x) => x.id === activeMesh.id);
      if (m) mirrorMesh(m, axis);
    });
  };

  const doMergeVertices = () => {
    if (!activeMesh || sel.vertexIds.length < 2) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    commit('Merge vertices', (draft) => {
      const m = draft.meshes.find((x) => x.id === activeMesh.id);
      if (m) mergeVertices(m, [...sel.vertexIds]);
    });
  };

  const doDeleteVertices = () => {
    if (!activeMesh || sel.vertexIds.length === 0) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    const meshId = activeMesh.id;
    commit('Delete vertices', (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (m) deleteVertices(m, [...sel.vertexIds]);
      if (m && m.faces.length === 0) draft.meshes = draft.meshes.filter((x) => x.id !== meshId);
    });
    dispatch({ t: 'setSelection', selection: emptySelection() });
  };

  const patchFaceFlags = (flag: 'doubleSided' | 'shaded' | 'textured' | 'drawBehind', value: boolean) => {
    if (!activeMesh) return;
    const ids = sel.faceIds;
    if (ids.length === 0) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    commit('Edit face flags', (draft) => {
      const m = draft.meshes.find((x) => x.id === activeMesh.id);
      if (!m) return;
      for (const f of m.faces) {
        if (ids.includes(f.id)) f[flag] = value;
      }
    });
  };

  const setFaceColorAll = (color: number) => {
    if (!activeMesh) return;
    const ids = sel.faceIds;
    if (ids.length === 0) return;
    if (meshLocked(activeMesh)) { dispatch({ t: 'setStatus', status: 'Mesh is locked.' }); return; }
    commit('Set face color', (draft) => {
      const m = draft.meshes.find((x) => x.id === activeMesh.id);
      if (!m) return;
      for (const f of m.faces) {
        if (ids.includes(f.id)) { f.color = color; f.textured = false; }
      }
    });
  };

  const deg = (v: Vec3) => v.map(radToDeg);

  return (
    <div className="inspector" aria-label="Inspector">
      <section>
        <h3>Add primitive</h3>
        <div className="prim-grid">
          {PRIMS.map((p) => (
            <button key={p.type} type="button" onClick={() => addPrimitive(p.type)}>{p.label}</button>
          ))}
        </div>
      </section>

      {activeMesh ? (
        <MeshSection
          key={activeMesh.id}
          mesh={activeMesh}
          locked={meshLocked(activeMesh)}
          onPatch={(patch, label) => patchMesh(activeMesh.id, patch, label)}
          onSetVec={(field, i, v, label) => setVec(activeMesh.id, field, i, v, label)}
          onMirror={doMirror}
        />
      ) : (
        <p className="hint">Select a mesh to inspect transforms.</p>
      )}

      {activeFace && activeMesh && (
        <section aria-labelledby="face-h">
          <h3 id="face-h">Face {activeFace.id.slice(0, 8)} ({sel.faceIds.length} selected)</h3>
          <div className="flag-grid">
            <label className="check"><input type="checkbox" checked={activeFace.doubleSided} onChange={(e) => patchFaceFlags('doubleSided', e.target.checked)} />Double-sided</label>
            <label className="check"><input type="checkbox" checked={activeFace.shaded} onChange={(e) => patchFaceFlags('shaded', e.target.checked)} />Shaded</label>
            <label className="check"><input type="checkbox" checked={activeFace.textured} onChange={(e) => patchFaceFlags('textured', e.target.checked)} />Textured</label>
            <label className="check"><input type="checkbox" checked={activeFace.drawBehind} onChange={(e) => patchFaceFlags('drawBehind', e.target.checked)} />Draw behind</label>
          </div>
          <label htmlFor="face-color" className="inline-label">Face color (palette index)
            <input
              id="face-color" type="number" min={0} max={15} value={activeFace.color}
              onChange={(e) => {
                const v = Math.max(0, Math.min(15, Number(e.target.value) || 0));
                setFaceColorAll(v);
              }}
            />
          </label>
          <div className="row">
            <button type="button" onClick={doExtrude}>Extrude +0.3</button>
            <button type="button" className="danger" onClick={doDeleteFace}>Delete face</button>
          </div>
        </section>
      )}

      {sel.vertexIds.length > 0 && (
        <section aria-labelledby="vert-h">
          <h3 id="vert-h">Vertices ({sel.vertexIds.length})</h3>
          <div className="row">
            <button type="button" onClick={doMergeVertices} disabled={sel.vertexIds.length < 2}>Merge</button>
            <button type="button" className="danger" onClick={doDeleteVertices}>Delete</button>
          </div>
        </section>
      )}

      <section>
        <h3>Selection</h3>
        <p className="hint">
          {sel.meshIds.length} mesh(es) · {sel.faceIds.length} face(s) · {sel.vertexIds.length} vertex(es) · pick: {sel.kind}
        </p>
        <div className="row">
          {(['mesh', 'face', 'vertex'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={sel.kind === k ? 'active' : ''}
              aria-pressed={sel.kind === k}
              onClick={() => dispatch({ t: 'setSelection', selection: { ...sel, kind: k } })}
            >
              Pick {k}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function MeshSection({
  mesh, locked, onPatch, onSetVec, onMirror,
}: {
  mesh: Mesh;
  locked: boolean;
  onPatch: (patch: Partial<Mesh>, label: string) => void;
  onSetVec: (field: 'position' | 'rotation' | 'scale' | 'pivot', i: number, v: number, label: string) => void;
  onMirror: (axis: Axis) => void;
}): React.JSX.Element {
  const deg = (v: Vec3): Vec3 => v.map(radToDeg) as unknown as Vec3;

  return (
    <section aria-labelledby="mesh-h">
      <h3 id="mesh-h">Mesh — {mesh.name}{locked ? ' (locked)' : ''}</h3>
      <fieldset disabled={locked} className="vec-grid">
        <legend>Position</legend>
        {(['x', 'y', 'z'] as const).map((ax, i) => (
          <label key={ax}>{ax.toUpperCase()}
            <input
              type="number" step={0.1} value={mesh.position[i]} disabled={locked}
              aria-label={`Position ${ax.toUpperCase()}`}
              onChange={(e) => onSetVec('position', i, Number(e.target.value) || 0, `Set position ${ax.toUpperCase()}`)}
            />
          </label>
        ))}
      </fieldset>
      <fieldset disabled={locked} className="vec-grid">
        <legend>Rotation (degrees)</legend>
        {(['x', 'y', 'z'] as const).map((ax, i) => (
          <label key={ax}>{ax.toUpperCase()}
            <input
              type="number" step={5} value={Math.round(deg(mesh.rotation)[i] * 10) / 10} disabled={locked}
              aria-label={`Rotation ${ax.toUpperCase()} degrees`}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onSetVec('rotation', i, degToRad(v), `Set rotation ${ax.toUpperCase()}`);
              }}
            />
          </label>
        ))}
      </fieldset>
      <fieldset disabled={locked} className="vec-grid">
        <legend>Scale</legend>
        {(['x', 'y', 'z'] as const).map((ax, i) => (
          <label key={ax}>{ax.toUpperCase()}
            <input
              type="number" step={0.1} value={mesh.scale[i]} disabled={locked}
              aria-label={`Scale ${ax.toUpperCase()}`}
              onChange={(e) => onSetVec('scale', i, Number(e.target.value) || 0.001, `Set scale ${ax.toUpperCase()}`)}
            />
          </label>
        ))}
      </fieldset>
      <fieldset disabled={locked} className="vec-grid">
        <legend>Pivot</legend>
        {(['x', 'y', 'z'] as const).map((ax, i) => (
          <label key={ax}>{ax.toUpperCase()}
            <input
              type="number" step={0.1} value={mesh.pivot[i]} disabled={locked}
              aria-label={`Pivot ${ax.toUpperCase()}`}
              onChange={(e) => onSetVec('pivot', i, Number(e.target.value) || 0, `Set pivot ${ax.toUpperCase()}`)}
            />
          </label>
        ))}
      </fieldset>
      <div className="row">
        <label className="check"><input type="checkbox" checked={mesh.visible} onChange={(e) => onPatch({ visible: e.target.checked }, 'Toggle mesh visibility')} />Visible</label>
        <label className="check"><input type="checkbox" checked={mesh.locked} onChange={(e) => onPatch({ locked: e.target.checked }, 'Toggle mesh lock')} />Locked</label>
      </div>
      <div className="row">
        <span className="hint">Mirror:</span>
        {(['x', 'y', 'z'] as const).map((ax) => (
          <button key={ax} type="button" onClick={() => onMirror(ax)}>{ax.toUpperCase()}</button>
        ))}
      </div>
    </section>
  );
}
