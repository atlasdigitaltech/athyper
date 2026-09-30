import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

const bundle = build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {FileSearchResults} from './packages/platform/entity/runtime/form-detail/src/file-search';
    function App(){const [error,setError]=useState('File contents could not be searched. Try again.');
      const [scope,setScope]=useState('contents');
      return scope==='names'?<p>File names selected</p>:<FileSearchResults search={{error,busy:false,submitted:'marker',hits:[],
        search:async()=>{window.retries=(window.retries||0)+1;setError(undefined)},setScope}}
        canPreview={false} canDownload={false} onPreview={()=>{}} onDownload={()=>{}}/>;}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  loader: { '.css': 'empty' }, tsconfig: resolve('tooling/config/tsconfig-react.json'),
  define: { 'process.env.NODE_ENV': '"test"' },
}).then(r=>r.outputFiles[0]!.text);
const styles=['packages/platform/foundation/theme/src/styles.css','packages/platform/foundation/ui/src/styles.css',
  'packages/platform/entity/runtime/form-detail/src/styles.css',
  'packages/platform/entity/runtime/form-detail/src/record/record-collaboration.css']
  .map(p=>readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');

for(const width of [390,1440]) test(`content-search failure uses one responsive state card and retry (${width})`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:styles});
  await page.addScriptTag({content:await bundle});
  const card=page.getByRole('alert');
  await expect(card).toHaveClass(/a-files-empty-state/);
  await expect(card.getByText('File content search unavailable',{exact:true})).toBeVisible();
  await expect(page.getByText('Search unavailable',{exact:true})).toHaveCount(0);
  const box=await card.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(width);
  const retry=card.getByRole('button',{name:'Retry search'});
  await retry.focus();await page.keyboard.press('Enter');
  await expect(card).toHaveCount(0);
  await expect(page.getByText('No matching file contents',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).retries)).toBe(1);
  await page.getByRole('button',{name:'Search file names'}).click();
  await expect(page.getByText('File names selected')).toBeVisible();
});
