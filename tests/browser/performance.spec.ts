import {test,expect} from '@playwright/test';
import path from 'node:path';
test('50 meshes and 2100 editable faces load and render without errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('/');await page.locator('.viewport > canvas:not(.gizmo-canvas)').first().waitFor();
 const start=Date.now();
 await page.getByLabel('Open project file').setInputFiles(path.resolve('examples/performance-50-2100.pvo'));
 await expect(page.locator('.mesh-row')).toHaveCount(50);
 await page.screenshot({path:'test-results/performance-50-2100.png'});
 console.log('50/2100 fixture import and first screenshot: '+(Date.now()-start)+' ms');
 expect(errors).toEqual([]);await expect(page.locator('.viewport > canvas:not(.gizmo-canvas)')).toHaveCount(4);
});
