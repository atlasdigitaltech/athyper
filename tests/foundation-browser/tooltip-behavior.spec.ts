import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

const bundle=build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{Tooltip}from'./packages/platform/foundation/ui/src/index';
function App(){const[visible,setVisible]=useState(true);const[label,setLabel]=useState('Helpful description');
return <main onKeyDown={e=>{if(e.key==='Escape')window.escaped=(window.escaped??0)+1;}} style={{padding:100}}>
{visible&&<Tooltip portal={window.portal} label={label}><button>Action</button></Tooltip>}
<button onClick={()=>setVisible(false)}>Remove</button><button onClick={()=>setLabel('Changed description')}>Change</button>
<button>Outside</button></main>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'},tsconfig:resolve('tooling/config/tsconfig-react.json'),define:{'process.env.NODE_ENV':'"test"'}}).then(r=>r.outputFiles[0]!.text);
const css=['packages/platform/foundation/theme/src/styles.css','packages/platform/foundation/ui/src/styles.css'].map(p=>readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
for(const portal of [false,true]) test(`tooltip delay, hover bridge, cancellation and Escape (${portal?'portal':'inline'})`,async({page})=>{
  await page.setContent('<div id="root"></div>');await page.addStyleTag({content:css});
  await page.evaluate(portal=>{(window as any).portal=portal;},portal);
  await page.addScriptTag({content:await bundle});
  await page.clock.install({time:new Date('2026-09-27T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-09-27T00:00:01Z'));
  const action=page.getByRole('button',{name:'Action',exact:true});const tip=page.getByRole('tooltip');
  await action.hover();await page.clock.runFor(599);await expect(tip).toHaveCount(0);
  await page.clock.runFor(1);await expect(tip).toHaveText('Helpful description');
  await tip.hover();await page.clock.runFor(1000);await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).escaped??0)).toBe(0);
  await page.getByRole('button',{name:'Outside'}).hover();await page.clock.runFor(200);
  await action.hover();await page.clock.runFor(300);await page.getByRole('button',{name:'Outside'}).hover();
  await page.clock.runFor(1000);await expect(tip).toHaveCount(0);
  await action.hover();await page.clock.runFor(300);await action.click();
  await page.clock.runFor(1000);await expect(tip).toHaveCount(0);
  await page.getByRole('button',{name:'Outside'}).focus();await action.focus();
  await expect(tip).toBeVisible();await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>(window as any).escaped)).toBe(1);
  await page.getByRole('button',{name:'Outside'}).focus();await page.getByRole('button',{name:'Outside'}).hover();
  await action.hover();await page.clock.runFor(300);
  await page.getByRole('button',{name:'Change'}).evaluate((node:HTMLButtonElement)=>node.click());
  await page.clock.runFor(1000);await expect(tip).toHaveCount(0);
  await page.getByRole('button',{name:'Outside'}).hover();await action.hover();await page.clock.runFor(300);
  await page.getByRole('button',{name:'Remove'}).evaluate((node:HTMLButtonElement)=>node.click());
  await page.clock.runFor(1000);await expect(tip).toHaveCount(0);
});
