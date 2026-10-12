import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { startCapture } from './tutorial-capture-lib.mjs';

const capture = await startCapture(new URL('../', import.meta.url), 5182);
const { page, shot, download, out, settle } = capture;
const button = name => page.getByRole('button', { name, exact: true });
async function menu(name, item) { await page.locator('summary').filter({hasText:new RegExp(`^${name}$`)}).click(); await button(item).click(); }
async function field(label, value) { await page.getByLabel(label, { exact: true }).fill(String(value)); await page.getByLabel(label, { exact: true }).press('Tab'); }
async function save(name) { await download(name, () => button('Save project').click()); }
async function reopen(name) { await page.getByLabel('Open project file', { exact: true }).setInputFiles(join(out, name)); await page.waitForFunction(name=>document.querySelector('.status-msg')?.textContent?.includes(`Opened ${name}`),name); await settle(); }
async function paintLine(from, to) {
  const box = await page.locator('.paint-canvas').boundingBox();
  const at = ([x,y]) => ({ x: box.x + (x + .5) * box.width / 128, y: box.y + (y + .5) * box.height / 128 });
  const a=at(from), b=at(to); await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:15}); await page.mouse.up();
}
try {
  await page.locator('summary').filter({hasText:/^File$/}).click(); await button('New project').click();
  await shot('model-01-new');
  await button('Cube').click(); await shot('model-02-cube');
  await field('Position X', .25); await field('Scale Y', 1.5); await field('Rotation Y degrees', 15);
  await shot('model-03-transform',page.locator('#ortho-dock'));
  await menu('View', 'Four views / maximize 3D'); await shot('model-04-finished');
  await save('first-cube.pvo'); await reopen('first-cube.pvo');
  await menu('View', 'Four views / maximize 3D'); await button('Pick face').click();
  const front = await page.locator('.viewport-front').boundingBox();
  await page.mouse.click(front.x + front.width*.53,front.y + front.height*.62);
  await page.getByLabel('Textured', {exact:true}).waitFor({state:'visible'});
  await shot('paint-01-face');
  await page.getByRole('tab',{name:'Paint',exact:true}).click();
  await page.getByRole('option',{name:/^Palette index 12,/}).click();
  await button('Flood fill (4-connected)').click(); await paintLine([64,64],[64,64]);
  await shot('paint-02-fill');
  await page.getByRole('option',{name:/^Palette index 10,/}).click(); await button('Pen').click();
  await page.locator('#brush-size').fill('5'); await paintLine([10,12],[22,12]);
  await shot('paint-03-stripe');
  await page.getByRole('tab',{name:'UV',exact:true}).click(); await page.getByLabel('Nudge UVs right', {exact:true}).click();
  await shot('paint-04-uv'); await save('painted-cube.pvo'); await reopen('painted-cube.pvo');
  await page.getByRole('tab',{name:'Animate',exact:true}).click(); await shot('animate-01-workspace');
  await page.locator('summary').filter({hasText:/^Add clip$/}).click(); await button('+ Rotation').click();
  await page.locator('.clip-fields').getByLabel('Start (s)',{exact:true}).fill('0');
  await page.locator('.clip-fields').getByLabel('Duration (s)',{exact:true}).fill('2');
  await page.locator('.clip-fields').getByLabel(/^Axis/).selectOption('y');
  await page.locator('.clip-fields').getByLabel('Amount (radians)',{exact:true}).fill('6.283185');
  await page.locator('summary').filter({hasText:/^Timeline options$/}).click(); await field('Animation duration (compact)',2); await page.mouse.click(700,25);
  await shot('animate-02-clip',page.locator('.clip-inspector'));
  await button('Play').click(); await page.waitForTimeout(700); await button('Pause').click();
  await shot('animate-03-preview');
  await save('rotating-cube.pvo'); await reopen('rotating-cube.pvo');
  const project=JSON.parse(await readFile(join(out,'rotating-cube.pvo'),'utf8'));
  if(project.meshes.length!==1||project.animation.clips.length!==1||project.animation.clips[0].axis!=='y'||project.animation.duration!==2)throw new Error('Rotation checkpoint differs from tutorial');
  await button('Export').click(); await page.getByLabel('Export format',{exact:true}).selectOption('gif');
  await page.getByLabel(/^Source/).selectOption('animation');
  await page.getByLabel(/^Frame count/).fill('24'); await page.getByLabel(/^Frame size/).fill('128');
  await page.getByLabel('Fit camera to model',{exact:true}).click();
  await shot('animate-04-export',page.locator('.gif-options'));
  await download('rotating-cube.gif',()=>page.getByRole('dialog').getByRole('button',{name:'Export',exact:true}).click());
  await capture.report({project:'Cube 1',meshes:1,clipAxis:'y',durationSeconds:2,checkpointsReopened:['first-cube.pvo','painted-cube.pvo','rotating-cube.pvo']});
}catch(error){await page.screenshot({path:join(out,'capture-error.png')});throw error;}finally{await capture.close();}
