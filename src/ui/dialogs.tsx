import {IconClose} from './icons';
// PiVo Ortho — help/shortcuts dialog and error boundary + WebGL fallback.
import React from 'react';
import { useStore } from './store';

const SHORTCUTS: Array<[string, string]> = [
  ['1 / 2 / 3', 'Model / Paint / Animate mode'],
  ['Q / W / E', 'Pick mesh / face / vertex'],
  ['V / T / R / S', 'Model: select, move, rotate, scale'],
  ['B / E / F / L / R / C / M / I', 'Paint: pen, eraser, fill, line, rectangle, ellipse, marquee, eyedropper'],
  ['X', 'Delete face / mesh (context of selection)'],
  ['D', 'Duplicate selection'],
  ['Copy / Paste buttons', 'Context-specific mesh, UV, marquee and clip clipboard'],
  ['Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (Y also works)', 'Undo / redo'],
  ['Ctrl/Cmd+S / Ctrl/Cmd+O', 'Save .pvo / open project'],
  ['F', 'Frame scene (Model)'],
  ['Esc', 'Cancel drag / close dialog'],
  ['Alt+drag / Middle-drag', 'Orbit (perspective) or pan'],
  ['Right-drag / Shift+Middle', 'Pan viewport'],
  ['Wheel', 'Zoom viewport'],
  ['Shift+click', 'Extend selection'],
  ['Right-click (Paint)', 'Paint with secondary color'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <header>
          <h2 id="sc-title">Keyboard shortcuts</h2>
          <button type="button" className="close" aria-label="Close shortcuts" onClick={onClose}><IconClose/></button>
        </header>
        <div className="dialog-body">
          <table className="shortcut-table">
            <tbody>
              {SHORTCUTS.map(([k, v]) => (
                <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Shortcuts are suppressed while typing in text inputs. Screen-reader access to the 3D canvas is limited; all editing actions have labeled panel equivalents.</p>
        </div>
      </div>
    </div>
  );
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
          <p>Save downloads a .pvo project; Open validates before replacing the workspace. A debounced recovery copy is stored in localStorage and is validated and restored automatically on reload. Use File → Recovery to remove the stored copy; future edits create a new one.</p>
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
        desktop Firefox, Chrome or Edge. No project data was lost — recovery data
        lives in localStorage.
      </p>
    </div>
  );
}
