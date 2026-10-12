// PiVo Ortho — outliner: mesh/folder tree with rename, visibility, lock,
// duplicate, delete, merge, folder organization, copy/paste.
import React, { useState } from 'react';
import type { Mesh } from '../core/types';
import { cloneMesh, mergeMeshes, uid } from '../core';
import { useStore, clipboard, emptySelection } from './store';
import { IconCopy, IconEye, IconEyeOff, IconFolder, IconLock, IconPlus, IconTrash, IconUnlock,IconMerge,IconPen,IconMore,IconCube } from './icons';
import { SuiteMenu } from './suite-components';

export function Outliner(): React.JSX.Element {
  const { state, dispatch, commit } = useStore();
  const project = state.project;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const sel = state.selection;
  const toggleSelect = (meshId: string, e: React.MouseEvent | React.KeyboardEvent) => {
    const next = new Set(sel.meshIds);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (next.has(meshId)) next.delete(meshId); else next.add(meshId);
    } else {
      next.clear(); next.add(meshId);
    }
    const active = next.has(meshId) ? meshId : null;
    dispatch({
      t: 'setSelection',
      selection: { ...emptySelection(), meshIds: [...next], activeMeshId: active, kind: 'mesh' },
    });
  };

  const setMeshVisible = (mesh: Mesh, visible: boolean) => {
    commit(visible ? 'Show mesh' : 'Hide mesh', (draft) => {
      const m = draft.meshes.find((x) => x.id === mesh.id);
      if (m && !isMeshLocked(project, mesh.id)) m.visible = visible;
    });
  };
  const setMeshLocked = (mesh: Mesh, locked: boolean) => {
    commit(locked ? 'Lock mesh' : 'Unlock mesh', (draft) => {
      const m = draft.meshes.find((x) => x.id === mesh.id);
      if (m) m.locked = locked;
    });
  };

  const isMeshLocked = (p: typeof project, meshId: string): boolean => {
    const m = p.meshes.find((x) => x.id === meshId);
    if (!m) return true;
    if (m.locked) return true;
    if (m.folderId) {
      const f = p.folders.find((x) => x.id === m.folderId);
      if (f?.locked) return true;
    }
    return false;
  };

  const rename = (meshId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    commit('Rename mesh', (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (m && !isMeshLocked(project, meshId)) m.name = trimmed.slice(0, 64);
    });
    setRenamingId(null);
  };

  const duplicate = (meshId: string) => {
    commit('Duplicate mesh', (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (!m) return;
      if (isMeshLocked(project, meshId)) return;
      const copy = cloneMesh(m);
      copy.id = uid('mesh');
      draft.meshes.push(copy);
    });
  };

  const remove = (meshId: string) => {
    commit('Delete mesh', (draft) => {
      if (isMeshLocked(project, meshId)) return;
      draft.meshes = draft.meshes.filter((m) => m.id !== meshId);
      draft.animation.clips = draft.animation.clips.filter((c) => c.meshId !== meshId);
    });
    dispatch({ t: 'setSelection', selection: emptySelection() });
  };

  const mergeSelected = () => {
    if (sel.meshIds.length < 2) {
      dispatch({ t: 'setStatus', status: 'Select at least two meshes to merge.' });
      return;
    }
    const anyLocked = sel.meshIds.some((id) => isMeshLocked(project, id));
    if (anyLocked) {
      dispatch({ t: 'setStatus', status: 'Merge blocked: selection includes locked meshes.' });
      return;
    }
    commit('Merge meshes', (draft) => {
      const picked = draft.meshes.filter((m) => sel.meshIds.includes(m.id));
      const merged = mergeMeshes(picked, `Merged (${picked.length})`);
      merged.id = uid('mesh');
      draft.meshes = draft.meshes.filter((m) => !sel.meshIds.includes(m.id));
      draft.animation.clips = draft.animation.clips.filter((c) => !sel.meshIds.includes(c.meshId));
      draft.meshes.push(merged);
    });
    dispatch({ t: 'setSelection', selection: emptySelection() });
  };

  const copyMesh = (meshId: string) => {
    const m = project.meshes.find((x) => x.id === meshId);
    if (!m) return;
    clipboard.kind = 'mesh';
    clipboard.data = structuredClone(m);
    dispatch({ t: 'setStatus', status: `${m.name} copied.` });
  };

  const pasteMesh = () => {
    if (clipboard.kind !== 'mesh') {
      dispatch({ t: 'setStatus', status: 'Mesh clipboard is empty.' });
      return;
    }
    const snapshot=clipboard.data as Mesh;
    commit('Paste mesh', (draft) => {
      const m = structuredClone(snapshot); if(!draft.folders.some(f=>f.id===m.folderId))m.folderId=null;
      if (!m) return;
      const copy = cloneMesh(m);
      copy.id = uid('mesh');
      copy.position = [copy.position[0] + 0.5, copy.position[1], copy.position[2]];
      draft.meshes.push(copy);
    });
  };

  const newFolder = () => {
    commit('New folder', (draft) => {
      draft.folders.push({ id: uid('folder'), name: `Folder ${draft.folders.length + 1}`, visible: true, locked: false });
    });
  };

  const assignFolder = (meshId: string, folderId: string | null) => {
    commit('Assign folder', (draft) => {
      const m = draft.meshes.find((x) => x.id === meshId);
      if (m && !isMeshLocked(project, meshId)) m.folderId = folderId;
    });
  };

  const setFolderVisible = (folderId: string, visible: boolean) => {
    commit(visible ? 'Show folder' : 'Hide folder', (draft) => {
      const f = draft.folders.find((x) => x.id === folderId);
      if (f) f.visible = visible;
    });
  };
  const setFolderLocked = (folderId: string, locked: boolean) => {
    commit(locked ? 'Lock folder' : 'Unlock folder', (draft) => {
      const f = draft.folders.find((x) => x.id === folderId);
      if (f) f.locked = locked;
    });
  };
  const renameFolder = (folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    commit('Rename folder', (draft) => {
      const f = draft.folders.find((x) => x.id === folderId);
      if (f) f.name = trimmed.slice(0, 64);
    });
    setRenamingId(null);
  };
  const deleteFolder = (folderId: string) => {
    commit('Delete folder', (draft) => {
      draft.folders = draft.folders.filter((f) => f.id !== folderId);
      for (const m of draft.meshes) {
        if (m.folderId === folderId) m.folderId = null;
      }
    });
  };

  const duplicateFolder=(folderId:string)=>{
    const result=commit('Duplicate folder',draft=>{
      const src=draft.folders.find(f=>f.id===folderId);if(!src) return;
      if(src.locked)throw new Error('Folder is locked');
      const folder={...src,id:uid('folder'),name:src.name+' copy'};draft.folders.push(folder);
      const sourceMeshes=draft.meshes.filter(m=>m.folderId===folderId);
      for(const mesh of sourceMeshes){const copy=cloneMesh(mesh);copy.folderId=folder.id;draft.meshes.push(copy);for(const clip of [...draft.animation.clips].filter(c=>c.meshId===mesh.id))draft.animation.clips.push({...clip,id:uid('clip'),meshId:copy.id});}
    });
    if(result)dispatch({t:'setStatus',status:'Folder and its clips duplicated.'});
  };
  const mergeFolder=(folderId:string)=>{
    const result=commit('Merge folder',draft=>{
      const folder=draft.folders.find(f=>f.id===folderId);
      const meshes=draft.meshes.filter(m=>m.folderId===folderId);
      if(folder?.locked||meshes.some(m=>m.locked))throw new Error('Folder contains locked meshes');
      if(!meshes.length)throw new Error('Folder is empty');
      const merged=mergeMeshes(meshes,folder?.name||'Merged folder');
      const ids=new Set(meshes.map(m=>m.id));draft.meshes=draft.meshes.filter(m=>!ids.has(m.id));draft.meshes.push(merged);
      draft.animation.clips=draft.animation.clips.filter(c=>!ids.has(c.meshId));draft.folders=draft.folders.filter(f=>f.id!==folderId);
    });
    if(result){dispatch({t:'setSelection',selection:emptySelection()});dispatch({t:'setStatus',status:'Folder merged at base transforms. Original clips removed; Undo restores them.'});}
  };
  const orphans = project.meshes.filter((m) => !m.folderId);
  const folderOf = (folderId: string) => project.meshes.filter((m) => m.folderId === folderId);

  return (
    <div className="outliner" role="tree" aria-label="Scene outliner" onKeyDown={e=>{if(!(e.target as HTMLElement).matches('[role=treeitem]')||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const rows=[...e.currentTarget.querySelectorAll<HTMLElement>('[role=treeitem]')],n=rows.indexOf(e.target as HTMLElement);rows[e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,n+(e.key==='ArrowDown'?1:-1)))]?.focus();}}>
      <div className="outliner-header">
        <h2>Scene hierarchy</h2>
        <div>
          <button type="button" title="New folder" aria-label="New folder" onClick={newFolder}><IconFolder /></button>
          <button type="button" title="Copy selected" aria-label="Copy selected mesh" onClick={() => sel.activeMeshId && copyMesh(sel.activeMeshId)}><IconCopy /></button>
          <button type="button" title="Paste mesh" aria-label="Paste mesh" onClick={pasteMesh}><IconPlus /></button>
          <button type="button" title="Merge selected" aria-label="Merge selected meshes" onClick={mergeSelected}><IconMerge/>Merge</button>
        </div>
      </div>

      {project.folders.map((folder) => (
        <div key={folder.id} className="outliner-folder">
          <div className="row folder-row">
            {renamingId === folder.id ? (
              <input
                value={draftName}
                autoFocus
                aria-label="Folder name"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => renameFolder(folder.id, draftName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameFolder(folder.id, draftName);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
              />
            ) : (
              <span
                className="tree-name"
                role="treeitem"
                tabIndex={0}
                onDoubleClick={() => { setRenamingId(folder.id); setDraftName(folder.name); }}
              >
                <IconFolder /><span className="tree-label" title={folder.name}>{folder.name}</span>
              </span>
            )}
            <div className="row-actions">
              <button type="button" className={`outliner-state ${!folder.visible ? 'is-hidden' : ''}`} title={folder.visible ? 'Hide folder' : 'Show folder'} aria-label={`${folder.visible ? 'Hide' : 'Show'} folder ${folder.name}`} aria-pressed={folder.visible} onClick={() => setFolderVisible(folder.id, !folder.visible)}>
                {folder.visible ? <IconEye /> : <IconEyeOff />}
              </button>
              <button type="button" className={`outliner-state ${folder.locked ? 'is-locked' : ''}`} title={folder.locked ? 'Unlock folder' : 'Lock folder'} aria-label={`${folder.locked ? 'Unlock' : 'Lock'} folder ${folder.name}`} aria-pressed={folder.locked} onClick={() => setFolderLocked(folder.id, !folder.locked)}>
                {folder.locked ? <IconLock /> : <IconUnlock />}
              </button>
              <SuiteMenu className="outliner-actions-menu" label={<IconMore/>} ariaLabel={`Actions for folder ${folder.name}`} title="Folder actions">
                <button type="button" aria-label={`Rename folder ${folder.name}`} onClick={()=>{setRenamingId(folder.id);setDraftName(folder.name);}}><IconPen/>Rename</button>
                <button type="button" disabled={folder.locked} aria-label={`Duplicate folder ${folder.name}`} title="Duplicate folder including clips" onClick={()=>duplicateFolder(folder.id)}><IconCopy/>Duplicate</button>
                <button type="button" disabled={folder.locked} aria-label={`Merge folder ${folder.name}`} title="Merge folder; removes source clips (undoable)" onClick={()=>mergeFolder(folder.id)}><IconMerge/>Merge meshes</button>
                <div className="outliner-menu-divider"/>
                <button type="button" className="danger" title="Delete folder (keeps meshes)" aria-label={`Delete folder ${folder.name}`} onClick={() => deleteFolder(folder.id)}><IconTrash/>Delete folder</button>
              </SuiteMenu>
            </div>
          </div>
          {folderOf(folder.id).map((m) => <MeshRow key={m.id} mesh={m} withFolderSelect />)}
        </div>
      ))}

      <div className="outliner-group">
        {orphans.map((m) => <MeshRow key={m.id} mesh={m} withFolderSelect={project.folders.length>0} />)}
      </div>
      {project.meshes.length === 0 && <p className="hint">No meshes. Add primitives from the Model tab.</p>}
    </div>
  );

  function MeshRow({ mesh, withFolderSelect }: { mesh: Mesh; withFolderSelect?: boolean }): React.JSX.Element {
    const locked = isMeshLocked(project, mesh.id);
    const folderLocked = !!project.folders.find((f) => f.id === mesh.folderId)?.locked;
    const selected = sel.meshIds.includes(mesh.id);
    const active = sel.activeMeshId === mesh.id;
    return (
      <div className={`row mesh-row ${selected ? 'selected' : ''} ${active ? 'active' : ''} ${!mesh.visible ? 'is-hidden' : ''}`}>
        {renamingId === mesh.id ? (
          <input
            value={draftName}
            autoFocus
            aria-label="Mesh name"
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => rename(mesh.id, draftName)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename(mesh.id, draftName);
              if (e.key === 'Escape') setRenamingId(null);
            }}
          />
        ) : (
          <span
            className="tree-name"
            role="treeitem"
            aria-selected={selected}
            tabIndex={0}
            onClick={(e) => toggleSelect(mesh.id, e)}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleSelect(mesh.id,e);}if(e.key==='F2'&&!locked){e.preventDefault();setRenamingId(mesh.id);setDraftName(mesh.name);}}}
            onDoubleClick={() => { if (!locked) { setRenamingId(mesh.id); setDraftName(mesh.name); } }}
          >
            <IconCube/><span className="tree-label" title={mesh.name}>{mesh.name}</span>
          </span>
        )}
        <div className="row-actions">
          <button type="button" className={`outliner-state ${!mesh.visible ? 'is-hidden' : ''}`} disabled={locked} title={mesh.visible ? 'Hide' : 'Show'} aria-label={`${mesh.visible ? 'Hide' : 'Show'} ${mesh.name}`} aria-pressed={mesh.visible} onClick={() => setMeshVisible(mesh, !mesh.visible)}>
            {mesh.visible ? <IconEye /> : <IconEyeOff />}
          </button>
          <button type="button" className={`outliner-state ${locked ? 'is-locked' : ''}`} disabled={folderLocked} title={folderLocked ? 'Locked by folder' : mesh.locked ? 'Unlock' : 'Lock'} aria-label={folderLocked ? `Locked by folder: ${mesh.name}` : `${mesh.locked ? 'Unlock' : 'Lock'} ${mesh.name}`} aria-pressed={locked} onClick={() => setMeshLocked(mesh, !mesh.locked)}>
            {locked ? <IconLock /> : <IconUnlock />}
          </button>
          <SuiteMenu className="outliner-actions-menu" label={<IconMore/>} ariaLabel={`Actions for ${mesh.name}`} title="Object actions">
            <button type="button" disabled={locked} aria-label={`Rename ${mesh.name}`} title="Rename (F2)" onClick={()=>{setRenamingId(mesh.id);setDraftName(mesh.name);}}><IconPen/>Rename<span className="outliner-menu-key">F2</span></button>
            <button type="button" disabled={locked} title="Duplicate" aria-label={`Duplicate ${mesh.name}`} onClick={() => duplicate(mesh.id)}><IconCopy/>Duplicate</button>
            {withFolderSelect && <label className="outliner-folder-setting">Move to folder<select
              aria-label={`Folder for ${mesh.name}`}
              disabled={locked}
              value={mesh.folderId ?? ''}
              onChange={(e) => assignFolder(mesh.id, e.target.value || null)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">No folder</option>
              {project.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></label>}
            <div className="outliner-menu-divider"/>
            <button type="button" className="danger" disabled={locked} title="Delete" aria-label={`Delete ${mesh.name}`} onClick={() => remove(mesh.id)}><IconTrash/>Delete</button>
          </SuiteMenu>
        </div>
      </div>
    );
  }
}
