import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = ["packages/platform/foundation/theme/src/styles.css", "packages/platform/foundation/ui/src/styles.css", "packages/platform/shell/shell/src/styles.css", "packages/platform/entity/runtime/form-detail/src/styles.css"].map(path => readFileSync(path, "utf8").replace(/@import[^;]+;/g, "")).join("\n");
const bundle = buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{PanelHeader,PanelContextRow}from'./packages/platform/foundation/ui/src/panel';
import{Maximize2Icon,CloseIcon,PinOffIcon,HistoryIcon,MessageSquareIcon,FileTextIcon,BellIcon,InboxIcon,AtlasBrandIcon}from'./packages/platform/foundation/icons/src';
const items=[['Comments',MessageSquareIcon],['Files',FileTextIcon],['Activity & History',HistoryIcon],['Atlas AI',AtlasBrandIcon],['Notifications',BellIcon],['Inbox',InboxIcon]];
createRoot(document.getElementById('root')).render(<>{items.map(([title,Icon],i)=>{
const capabilities={...(i<4?{new:{label:'New',icon:<span>+</span>}}:{}),...(i===3?{history:{label:'History',icon:<HistoryIcon/>}}:{}),pin:{label:'Unpin',icon:<PinOffIcon/>,pressed:true},fullView:{label:'Full view',icon:<Maximize2Icon size={18}/>},close:{label:'Close',icon:<CloseIcon/>}};
return <section key={title} className={'a-context-panel '+(i<3?'a-collaboration-panel':'')} style={{position:'relative',width:'100%'}}><PanelHeader title={title} icon={<Icon/>} capabilities={capabilities}/><PanelContextRow scope={{kind:i<4?"record":"global",label:i<4?"Afghanistan":"Your work",detail:i<4?"Country":"Current tenant"}}/></section>
})}</>);`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
for(const theme of ["light","dark"]) for(const width of [360,768,1440])test(`shared panel controls match at ${width}px in ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.setContent('<div id="root"></div>');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.addStyleTag({content:styles});await page.evaluate(bundle);
 const actions=page.getByRole('navigation',{name:'Panel actions'});
 await expect(actions).toHaveCount(6);
 for (let i=0;i<6;i++) {
   const expected=[...(i<4?['new']:[]),...(i===3?['history']:[]),'pin','fullView','close'];
   expect(await actions.nth(i).locator('[data-panel-action]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-panel-action')))).toEqual(expected);
   await expect(actions.nth(i).getByRole('button',{name:'Unpin',includeHidden:true})).toHaveAttribute('aria-pressed','true');
 }

 const headers=await page.locator('.a-panel-header').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 expect(new Set(headers).size).toBe(1);
 await expect(page.locator('[data-scope="record"]')).toHaveCount(4);await expect(page.locator('[data-scope="global"]')).toHaveCount(2);
 const measurements=await page.getByLabel('Full view',{exact:true}).evaluateAll(elements=>elements.map(el=>{const css=getComputedStyle(el),svg=getComputedStyle(el.querySelector('svg')!);return {width:css.width,height:css.height,color:css.color,radius:css.borderRadius,iconWidth:svg.width,iconHeight:svg.height,stroke:svg.strokeWidth}}));
 for(const value of measurements){expect(value).toEqual(measurements[0]);expect(value).toMatchObject({width:'40px',height:'40px',iconWidth:'18px',iconHeight:'18px',stroke:'2px'});}
 for(const action of await page.getByLabel('Full view',{exact:true}).all()){await action.focus();expect(await action.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
