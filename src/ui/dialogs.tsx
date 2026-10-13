import {IconClose} from './icons';
import {shortcutLabel} from './suite';
// PiVo Ortho — help/shortcuts dialog and error boundary + WebGL fallback.
import React from 'react';
import { useStore } from './store';

const SHORTCUT_SECTIONS: Array<[string, Array<[string,string]>]> = [
 ['Document', [['Mod+S','Save project (.pvo)'],['Mod+O','Open project'],['Mod+Z','Undo'],['Mod+Shift+Z / Mod+Y','Redo'],['Escape','Cancel gesture / close dialog']]],
 ['Editor', [['1 / 2 / 3','Model / Paint / Animate mode'],['Q / W / E','Pick mesh / face / vertex'],['V / T / R / S','Model: select / move / rotate / scale'],['B / E / F / L / R / C / M / I','Paint: pen / eraser / fill / line / rectangle / ellipse / marquee / eyedropper'],['X','Delete face / mesh (selection context)'],['D','Duplicate selection'],['Copy / Paste buttons','Mesh, UV, marquee and clip clipboard'],['Shift+click','Extend selection'],['Right mouse click (Paint)','Paint with secondary color']]],
 ['Viewport', [['F','Frame scene (Model)'],['Alt+drag / Middle mouse drag','Orbit (perspective) or pan'],['Right mouse drag / Shift+Middle mouse drag','Pan viewport'],['Wheel','Zoom viewport']]],
];
export function ShortcutsDialog({onClose}:{onClose:()=>void}):React.JSX.Element {
 return <div className="dialog-backdrop" role="presentation"><div className="dialog suite-shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-title">
  <header className="suite-shortcuts-header"><h2 className="suite-shortcuts-title" id="sc-title">Keyboard shortcuts</h2></header>
  <div className="suite-shortcuts-body">{SHORTCUT_SECTIONS.map(([section,rows])=><React.Fragment key={section}><h3 className="suite-shortcuts-section">{section}</h3><table className="suite-shortcut-table"><thead><tr><th scope="col">Shortcut</th><th scope="col">Action</th></tr></thead><tbody>{rows.map(([keys,action])=><tr key={keys}><th scope="row"><kbd>{shortcutLabel(keys)}</kbd></th><td>{action}</td></tr>)}</tbody></table></React.Fragment>)}
   <p className="suite-shortcuts-note">Shortcuts are inactive while typing or inside dialogs. Screen-reader access to the 3D canvas is limited; editing actions have labeled panel equivalents.</p>
  </div><footer className="suite-shortcuts-actions"><button type="button" className="suite-shortcuts-close" data-dialog-initial onClick={onClose}>Close</button></footer>
 </div></div>;
}

export function HelpDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header>
          <h2 id="help-title">PiVo Ortho help</h2>
          <button type="button" className="close" aria-label="Close help" onClick={onClose}><IconClose/></button>
        </header>
        <div className="dialog-body">
          <h3>Workflow</h3>
          <p><strong>Model</strong> — add primitives, drag vertices or meshes in the front/top/side views, edit exact transforms in the inspector, extrude or delete faces, mirror meshes.</p>
          <p><strong>Paint</strong> — the shared 128×128 indexed texture with 16 palette entries. Use the pen, eraser, fill, line, rectangle, ellipse and marquee. Drag inside a selection to move, Alt-drag to copy, Shift to select anew. Wheel zooms, Space/middle-drag pans, and Home fits. UV dragging updates the real model before release; Escape cancels without saving. One stroke is one undo step. The transparent index erases to alpha-0; PNG imports are quantized to the current palette.</p>
          <p><strong>Animate</strong> — add movement/rotation/scale/visibility/oscillation clips to any of the four tracks of a mesh, drag library clips into tracks, move clips between tracks, resize either edge, or edit timing numerically. Each pointer gesture commits once; Escape cancels. Ctrl/Cmd disables timeline snap. The ghost and actual pose preview remain transient until release.</p>
          <p><strong>Gizmos</strong> — select Move/Rotate/Scale and drag the colored handles. World/local applies to move/rotate; scale uses local axes. Snapping is independent for movement, angles and scale. Escape cancels the gesture; release commits one undo step.</p>
          <p><strong>Export cameras</strong> — adjust perspective/orthographic projection, pose, framing and image size. Use current view copies the last focused viewport. Output aspect ratio controls crop. Fit model recenters the scene; camera settings persist locally. Cancel stops capture.</p>
          <p><strong>Pixel effects</strong> — outline the model silhouette, blend scanline rows, and add independent bottom-left/right bitmap tags. Preview scrubbing/playback uses the same output pixels as GIF, PNG and sprite frames. Reset effects removes decorations.</p>
          <p><strong>Theme</strong> — use the Sun/Moon header button for light/dark. The choice is remembered when storage is available. UI colors change, but your palette, scene background, project data and exports do not.</p>
          <h3>Files</h3>
          <p>Save downloads a .pvo project; Open validates before replacing the workspace. Browser recovery uses IndexedDB with a separate copy per session. File → Recovery offers Restore, Download backup, and Discard; invalid copies are preserved until you resolve them.</p>
          <h3>Known limitations</h3>
          <ul>
            <li>Desktop mouse/keyboard only; touch editing is not a goal.</li>
            <li>Canvas 3D interaction is not screen-reader operable; panels are labeled alternatives.</li>
            <li>Pixel outline, scanlines and uppercase bitmap tags are supported; arbitrary Unicode/system-font labels are not.</li>
            <li>Exports run locally; no cloud or account is involved.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="fatal" role="alert">
          <h1>Editor error</h1>
          <p>Something failed inside the editor. The error message is shown below.</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
          <button type="button" onClick={() => location.reload()}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WebGLFallback(): React.JSX.Element {
  return (
    <div className="fatal" role="alert">
      <h1>WebGL unavailable</h1>
      <p>
        PiVo Ortho renders 3D views with WebGL, which this browser or device
        does not currently provide. Enable hardware acceleration or try a recent
        desktop Firefox, Chrome or Edge. Use Save project to download a backup;
        browser recovery is available through File → Recovery.
      </p>
    </div>
  );
}
