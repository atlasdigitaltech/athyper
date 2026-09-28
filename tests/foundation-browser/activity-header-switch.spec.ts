import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
const bundle = build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{HeaderActions}from'./packages/platform/shell/shell/src/shell-header-actions';
function App(){const[active,setActive]=useState();return <div className="athyper-shell"><header className="athyper-shell__topbar"><HeaderActions navigation={{routes:[]}} active={active} onActiveChange={setActive} atlasOpen={false} onAtlasToggle={()=>setActive(undefined)} applicationName="Neon"/></header><main style={{paddingTop:100}}><button>Record action</button></main></div>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",loader:{".css":"empty"},nodePaths:["apps/neon/node_modules"]}).then(r=>r.outputFiles[0]!.text);
const styles=["packages/platform/foundation/theme/src/styles.css","packages/platform/foundation/ui/src/styles.css","packages/platform/shell/shell/src/styles.css"].map(p=>readFileSync(p,"utf8").replace(/@import[^;]+;/g,"")).join("\n");
for(const width of [1024,1440])test(`header switches activity directly at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.setContent('<div id="root"></div>');await page.addStyleTag({content:styles});await page.addScriptTag({content:await bundle});
 const notifications=page.locator('.athyper-shell__actions > button[data-slot=notifications]');
 const inbox=page.locator('.athyper-shell__actions > button[data-slot=inbox]');
 const panel=page.getByRole('dialog');
 await notifications.click();await expect(panel.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
 expect(await page.getByRole('button',{name:'Record action'}).evaluate(el=>!!el.closest('[inert]'))).toBe(true);
 await inbox.click();await expect(panel.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();await expect(panel).toHaveCount(1);
 await notifications.click();await expect(panel.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
 await inbox.focus();await inbox.press('Enter');await expect(panel.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(inbox).toBeFocused();
 await inbox.click();await expect(panel).toBeVisible();await inbox.click();await expect(panel).toHaveCount(0);
 expect(await page.getByRole('button',{name:'Record action'}).evaluate(el=>!!el.closest('[inert]'))).toBe(false);
});

test("mobile overflow remains available while activity is open",async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.setContent('<div id="root"></div>');await page.addStyleTag({content:styles});await page.addScriptTag({content:await bundle});
 const more=page.getByRole('button',{name:'More application actions',exact:true});
 await more.click();await page.getByRole('dialog',{name:'More application actions'}).getByRole('button',{name:/Notifications/}).click();
 await expect(page.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
 await more.click();await page.getByRole('dialog',{name:'More application actions'}).getByRole('button',{name:/Inbox/}).click();
 await expect(page.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(more).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(0);
});
