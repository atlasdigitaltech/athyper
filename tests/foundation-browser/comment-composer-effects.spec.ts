import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";

const bundle=buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RichCommentComposer} from './packages/platform/communications/collaboration-ui/src/rich-comment-composer';
window.searchCalls=[];window.pendingSearches=[];window.busyCalls=[];
function Fixture(){
  const [render,setRender]=useState(0),[disabled,setDisabled]=useState(false),[enabled,setEnabled]=useState(true);
  const [busy,setBusy]=useState({value:false});
  window.rerender=()=>setRender(x=>x+1);window.setDisabled=setDisabled;window.setMentionsEnabled=setEnabled;
  return <><output>{render}:{String(busy.value)}</output><RichCommentComposer entityType="fixture" entityId="record"
    allowedAudiences={['public','private']} defaultAudience="public" disabled={disabled}
    searchMentions={enabled?async(query,audience)=>{window.searchCalls.push({query,audience,render});return new Promise(resolve=>window.pendingSearches.push(resolve));}:undefined}
    onBusyChange={value=>{window.busyCalls.push(value);if(window.busyCalls.length>30)throw new Error('Busy notification loop');setBusy({value});}}
    onSubmit={async()=>{}}/></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",loader:{".css":"empty"},nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;

test("inline callback changes do not loop busy notifications or restart mention searches",async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false]);
  for(let index=0;index<4;index++)await page.evaluate(()=>(window as any).rerender());
  await page.locator('summary[aria-label="Mention a participant"]').click();
  const query=page.getByRole('textbox',{name:'Mention a participant',exact:true});
  await query.fill('Ann');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(1);
  await page.evaluate(()=>{(window as any).rerender();(window as any).pendingSearches[0]([{id:'ann',displayName:'Ann'}]);});
  await expect(page.getByRole('button',{name:'Ann',exact:true})).toBeVisible();
  // Wait beyond debounce: an unrelated parent update must not cause a new request.
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>(window as any).searchCalls.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).busyCalls)).toEqual([false]);
  await query.fill('Old');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(2);
  await query.fill('New');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(3);
  await page.evaluate(()=>{(window as any).pendingSearches[2]([{id:'new',displayName:'New result'}]);(window as any).pendingSearches[1]([{id:'old',displayName:'Stale result'}]);});
  await expect(page.getByRole('button',{name:'New result',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Stale result',exact:true})).toHaveCount(0);
  await query.fill('');
  await expect(page.getByRole('button',{name:'New result',exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).setDisabled(true));
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false,true]);
  await page.evaluate(()=>(window as any).setDisabled(false));
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false,true,false]);
  expect(errors).toEqual([]);
});
