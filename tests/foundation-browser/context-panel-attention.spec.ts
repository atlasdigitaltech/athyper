import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
const bundle=buildSync({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ShellActivityCenter} from './packages/platform/shell/shell/src/activity-center';
function Fixture(){const [tab,setTab]=useState('notifications'),[open,setOpen]=useState(true);(window as any).showSection=setTab;return <><button onClick={()=>setOpen(true)}>Open attention</button>{open?<ShellActivityCenter activeTab={tab} onTabChange={setTab} onClose={()=>setOpen(false)} dataSource={{notifications:[{id:'notice',title:'Record updated',timestamp:'2026-09-28T00:00:00Z',timestampLabel:'Today',unread:true}],inbox:[{id:'work',title:'Review assigned work',priority:'high'}]}}/>:null}</>};createRoot(document.getElementById('root')).render(<Fixture/>);`},loader:{'.css':'empty'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',nodePaths:['apps/neon/node_modules']}).outputFiles[0]!.text;
const css=['packages/platform/foundation/theme/src/styles.css','packages/platform/foundation/ui/src/styles.css','packages/platform/shell/shell/src/styles.css'].map(p=>readFileSync(p,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
for(const width of [390,768,1440]) for(const theme of ['light','dark']) test(`global panels retain scope and navigation at ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.setContent('<div id="root"></div>');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.addStyleTag({content:css});await page.evaluate(bundle);
 const panel=page.locator('#athyper-activity-center');await expect(panel.getByText('Your notifications',{exact:true})).toBeVisible();await expect(panel.locator('[data-scope="record"]')).toHaveCount(0);await expect(panel.getByText('Record updated',{exact:false})).toBeVisible();
 if(width>1100){await panel.getByRole('button',{name:'Pin panel to the side'}).click();await expect(panel).toHaveAttribute('data-mode','pinned');await expect(page.locator('.a-tool-panel-backdrop')).toHaveCount(0);await panel.getByRole('button',{name:'Unpin panel'}).click();await expect(page.locator('.a-tool-panel-backdrop')).toHaveCount(1);}
 await page.evaluate(()=>(window as any).showSection('inbox'));await expect(panel.getByText('Your work',{exact:true})).toBeVisible();await expect(panel.getByText('Review assigned work',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.getByRole('button',{name:'Close activity center',exact:true}).click();await expect(panel).toHaveCount(0);
});
