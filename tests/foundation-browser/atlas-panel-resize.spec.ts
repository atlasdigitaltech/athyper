import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
const css = readFileSync("packages/platform/shell/shell/src/styles.css", "utf8");
const bundle = buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{AtlasPanelResize}from'./packages/platform/shell/shell/src/atlas-panel-resize';
function App(){const[width,setWidth]=useState(420);return <section style={{position:'fixed',right:0,top:0,bottom:0,width}}><AtlasPanelResize width={width} onWidthChange={setWidth}/></section>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
test("Atlas resize supports keyboard and dragging within bounds, and hides on mobile",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.setContent(`<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
 await page.evaluate(bundle);
 const handle=page.getByRole('separator',{name:'Resize Atlas'});
 await handle.focus();await handle.press('ArrowLeft');await expect(handle).toHaveAttribute('aria-valuenow','440');
 await handle.press('Home');await expect(handle).toHaveAttribute('aria-valuenow','360');
 await handle.press('ArrowRight');await expect(handle).toHaveAttribute('aria-valuenow','360');
 await handle.press('End');await handle.press('ArrowLeft');await expect(handle).toHaveAttribute('aria-valuenow','560');
 const box=await handle.boundingBox();await page.mouse.move(box!.x+3,100);await page.mouse.down();await page.mouse.move(940,100);await page.mouse.up();
 await expect(handle).toHaveAttribute('aria-valuenow','500');
 await page.setViewportSize({width:390,height:844});await expect(handle).toBeHidden();
});
