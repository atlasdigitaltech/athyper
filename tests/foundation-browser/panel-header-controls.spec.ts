import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = ["packages/platform/foundation/theme/src/styles.css", "packages/platform/foundation/ui/src/styles.css", "packages/platform/shell/shell/src/styles.css", "packages/platform/entity/runtime/form-detail/src/styles.css"].map(path => readFileSync(path, "utf8").replace(/@import[^;]+;/g, "")).join("\n");
const bundle = buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{PanelHeader}from'./packages/platform/foundation/ui/src/panel';
import{Maximize2Icon,CloseIcon,PinOffIcon,HistoryIcon,MessageSquareIcon,FileTextIcon,BellIcon,InboxIcon,AtlasBrandIcon}from'./packages/platform/foundation/icons/src';
const items=[['Comments',MessageSquareIcon],['Files',FileTextIcon],['Atlas AI',AtlasBrandIcon],['Notifications',BellIcon],['Inbox',InboxIcon]];
createRoot(document.getElementById('root')).render(<>{items.map(([title,Icon],i)=>{
const controls=<>{i===2?<><button type="button" aria-label="New conversation">+</button><button type="button" aria-label="History"><HistoryIcon size={16}/></button></>:null}{i<3?<button type="button" aria-label="Unpin" aria-pressed="true"><PinOffIcon size={17}/></button>:null}{i<2?<button type="button" aria-label="Full view"><Maximize2Icon size={18}/></button>:<a href="#full" className={i>2?'athyper-activity-expand':''} aria-label="Full view"><Maximize2Icon size={17}/></a>}<button type="button" aria-label="Close"><CloseIcon size={16}/></button></>;
return <section key={title} className={i<2?'a-collaboration-panel':''} style={{position:'relative',width:'100%'}}><PanelHeader className={i===2?'athyper-atlas-workspace__header':i<2?'a-collaboration-panel__header':''} title={title} icon={<Icon/>} subtitle="Comments and files for this record" actions={i<2?<div className="a-collaboration-panel__controls">{controls}</div>:controls}/></section>
})}</>);`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
for(const width of [360,768,1440])test(`shared panel controls match for links and buttons at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.setContent('<div id="root"></div>');await page.addStyleTag({content:styles});await page.evaluate(bundle);
 const actions=page.getByRole('navigation',{name:'Panel actions'});
 await expect(actions).toHaveCount(5);
 const measurements=await page.getByLabel('Full view',{exact:true}).evaluateAll(elements=>elements.map(el=>{const css=getComputedStyle(el),svg=getComputedStyle(el.querySelector('svg')!);return {width:css.width,height:css.height,color:css.color,radius:css.borderRadius,iconWidth:svg.width,iconHeight:svg.height,stroke:svg.strokeWidth}}));
 for(const value of measurements){expect(value).toEqual(measurements[0]);expect(value).toMatchObject({width:'40px',height:'40px',iconWidth:'18px',iconHeight:'18px',stroke:'2px'});}
 for(const action of await page.getByLabel('Full view',{exact:true}).all()){await action.focus();expect(await action.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
