import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
const bundle = buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {AtlasWorkspace} from './packages/platform/shell/shell/src/atlas-workspace';
import {AtlasAnswerProvider} from './packages/platform/ai/agent-ui/src';
import {ShellPersonalizationScopeProvider} from './packages/platform/shell/shell/src/personalization-scope';
const client={experience:async()=>null,threads:async()=>({items:[]})};
function App(){const[pinned,setPinned]=useState(false),[open,setOpen]=useState(true);return <AtlasAnswerProvider options={{client}}><ShellPersonalizationScopeProvider plane="neon" tenantId="tenant" principalId="user">{open?<AtlasWorkspace mode={window.full?'fullscreen':'dock'} planeName="Neon" currentPath="/app/entity/example" pinned={pinned} onPinnedChange={setPinned} onClose={()=>setOpen(false)}/>:<p>Closed</p>}</ShellPersonalizationScopeProvider></AtlasAnswerProvider>}
createRoot(document.getElementById('root')).render(<App/>);`},loader:{".css":"empty"},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
const css=["packages/platform/foundation/theme/src/styles.css","packages/platform/foundation/ui/src/styles.css","packages/platform/shell/shell/src/styles.css"].map(path=>readFileSync(path,"utf8").replace(/@import[^;]+;/g,"")).join("\n");
for(const full of [false,true])test(`Atlas capability header invokes history and close in ${full?'full':'side'} view`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.setContent('<div id="root"></div>');await page.evaluate(value=>{(window as any).full=value},full);await page.addStyleTag({content:css});await page.evaluate(bundle);
 const header=page.locator('.athyper-atlas-workspace__header');
 await expect(header.locator('[data-panel-action=new]')).toHaveAccessibleName('New Atlas conversation');
 const history=header.locator('[data-panel-action=history]');
 if(full)await history.click();
 await expect(page.locator('.athyper-atlas-workspace__history')).toHaveCount(0);
 await history.click();await expect(page.locator('.athyper-atlas-workspace__history')).toBeVisible();
 await history.click();await expect(page.locator('.athyper-atlas-workspace__history')).toHaveCount(0);
 if(!full){const pin=header.locator('[data-panel-action=pin]');await pin.click();await expect(pin).toHaveAttribute('aria-pressed','true');await expect(header.locator('[data-panel-action=fullView]')).toHaveAttribute('href','/atlas?from=%2Fapp%2Fentity%2Fexample');}
 await header.locator('[data-panel-action=new]').click();
 await header.locator('[data-panel-action=close]').click();await expect(page.getByText('Closed',{exact:true})).toBeVisible();
});
