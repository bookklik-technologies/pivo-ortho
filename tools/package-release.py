from pathlib import Path
import json,zipfile,shutil,re,base64
R=Path(__file__).resolve().parent.parent
# The production Vite output is one dependency-free module and one local CSS
# asset. Inline both into a self-contained preview without emitting their bytes
# through the conversation.
assets=R/'dist/assets'
js=next(assets.glob('*.js')).read_text()
css=next(assets.glob('*.css')).read_text()
def inline_asset(match):
 value=match.group(1).strip().strip('\"\'')
 if value.startswith(('data:','http:','https:')):return match.group(0)
 path=assets/Path(value).name
 if not path.exists():raise FileNotFoundError(f'CSS asset not found: {value}')
 mime='font/woff2' if path.suffix=='.woff2' else 'application/octet-stream'
 return 'url("data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()+'")'
css=re.sub(r'url\(([^)]+)\)',inline_asset,css)
html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#151a21"><title>PiVo Ortho</title><style>'+css+'</style></head><body><div id="root"></div><script type="module">'+js.replace('</script','<\\/script')+'</script></body></html>'
(R/'pivo-ortho-browser.html').write_text(html)
# Preserve actual supplied licenses, not invented attribution.
notices=['PiVo Ortho — third-party runtime and test dependency notices\n\nThe following texts are copied from the installed packages. PiVo Ortho source is licensed under the MIT License (see LICENSE); this notice file covers only the bundled dependencies.\n']
for name in ['react','react-dom','scheduler','three','fflate','gifenc','gifuct-js','js-binary-schema-parser','lucide-react','@fontsource-variable/outfit']:
 p=R/'node_modules'/name
 meta=json.loads((p/'package.json').read_text())
 notices.append('\n'+'='*72+'\n'+name+' '+meta['version']+' — '+str(meta.get('license','See supplied notice'))+'\n')
 files=[f for f in p.iterdir() if f.is_file() and f.name.upper().startswith(('LICENSE','LICENCE','COPYING','NOTICE'))]
 if not files and (p/'LICENSE').exists():files=[p/'LICENSE']
 for f in files:notices.append(f.read_text(errors='replace'))
(R/'THIRD_PARTY_NOTICES.txt').write_text('\n'.join(notices))
# Package only maintained implementation, real tests, docs, examples and build.
exclude_dirs={'node_modules','test-results','.git','__pycache__'}
exclude_files={'integrate.py','integrate-ui.py','polish.py','finalfix.py','releasefix.py','gltf.ts','io-standalone.mjs','strip-debug.mjs','smoke.cjs','gizmo-smoke.cjs','integrate-gizmos.py','fix-export-cameras.py','polish-parity.py','prepare-v020.py','integrate-effects.py','animate-export-preview.py','prepare-v030.py','integrate-timeline.py','polish-timeline.py','prepare-v040.py','integrate-texture.py','integrate-uv-preview.py','optimize-atlas.py','prepare-v050.py','refresh-ui-assets.py','prepare-v060.py','add-light-theme.py','prepare-v070.py','style-scrollbars.py','prepare-v071.py','refine-control-spacing.py','prepare-v080.py'}
version=json.loads((R/'package.json').read_text())['version']
out=R.parent/f'pivo-ortho-{version}-source-and-build.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in R.rglob('*'):
  if not p.is_file() or any(x in exclude_dirs for x in p.relative_to(R).parts):continue
  if p.name in exclude_files or p.suffix=='.log' or p.name.endswith('-screen.png') or p.name.startswith('gizmo-') and p.suffix=='.png':continue
  if p.name=='generate-examples.cjs':continue
  z.write(p,'pivo-ortho/'+str(p.relative_to(R)))
 print(json.dumps({'archive':str(out),'files':len(z.namelist()),'size':out.stat().st_size,'previewBytes':len(html.encode())}))
