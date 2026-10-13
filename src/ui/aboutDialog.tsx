// PiVo Ortho — About dialog. Same structure as the other PiVo editors; the
// description, version and license lines come from package.json via Vite define.
import React from 'react';
declare const __STANDALONE__:boolean;

declare const __APP_VERSION__: string;
declare const __APP_DESCRIPTION__: string;

export function AboutDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="dialog-backdrop suite-about-overlay" role="presentation">
      <div className="dialog suite-about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header className="suite-about-header">
          <h2 id="about-title" className="suite-about-title">About PiVo Ortho</h2>
        </header>
        <div className="dialog-body suite-about-body">
          <p>{__APP_DESCRIPTION__}</p>
          <p><strong>Version</strong> {__APP_VERSION__}</p>
          <p><strong>License</strong> MIT. Copyright (c) 2026 Bookklik Technologies.</p>
          <p><strong>Privacy</strong> Everything runs in your browser. Nothing is uploaded and no account is needed; files stay on this device unless you download them.</p>
          <p><strong>Limitations</strong> Desktop mouse and keyboard only; touch editing is not a goal. Requires WebGL2.</p>
        </div>
        <footer className="suite-about-actions"><a href={__STANDALONE__?'https://bookklik-technologies.github.io/pivo-ortho/docs/':'./docs/'} target="_blank" rel="noopener" tabIndex={0}>Documentation</a><button type="button" data-dialog-initial onClick={onClose}>Close</button></footer>
      </div>
    </div>
  );
}
