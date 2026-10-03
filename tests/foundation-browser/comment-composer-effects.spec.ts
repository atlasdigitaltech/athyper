import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";

const bundle=buildSync({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RichCommentComposer} from './packages/platform/communications/collaboration-ui/src/rich-comment-composer';
window.searchCalls=[];window.pendingSearches=[];window.busyCalls=[];window.submissions=[];
function Fixture(){
  const [render,setRender]=useState(0),[disabled,setDisabled]=useState(false),[enabled,setEnabled]=useState(true);
  const [busy,setBusy]=useState({value:false});
  window.rerender=()=>setRender(x=>x+1);window.setDisabled=setDisabled;window.setMentionsEnabled=setEnabled;
  return <><output>{render}:{String(busy.value)}</output><RichCommentComposer entityType="fixture" entityId="record"
    allowedAudiences={['public','private']} defaultAudience="public" disabled={disabled}
    allowAttachments prepareAttachments={async()=>{throw Error('Cancel must not prepare an upload')}}
    searchMentions={enabled?async(query,audience)=>{window.searchCalls.push({query,audience,render});return new Promise(resolve=>window.pendingSearches.push(resolve));}:undefined}
    onBusyChange={value=>{window.busyCalls.push(value);if(window.busyCalls.length>30)throw new Error('Busy notification loop');setBusy({value});}}
    onSubmit={async submission=>{window.submissions.push(submission)}}/></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",loader:{".css":"empty"},nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;

for (const selected of [false,true]) test(`link insertion preserves rich content without JSON errors (selected=${selected})`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://composer.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  await page.goto('http://composer.test/');await page.evaluate(bundle);
  await page.addStyleTag({content:'[contenteditable="true"] { min-height:50px; }'});
  const editor=page.getByRole('textbox',{name:'Comment',exact:true});
  await editor.fill(selected?'Read documentation':'');
  await editor.focus();
  if(selected)await page.keyboard.press('Control+a');
  await page.getByRole('button',{name:'Link',exact:true}).click();
  await page.getByRole('textbox',{name:'Link URL'}).fill('https://example.com/docs');
  await page.getByRole('button',{name:'Insert link',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Link URL'})).toHaveCount(0);
  await expect(editor.locator('a')).toHaveAttribute('href','https://example.com/docs');
  await expect(editor.locator('a')).toHaveText(selected?'Read documentation':'https://example.com/docs');
  await expect(editor).toBeFocused();
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const submission=await page.evaluate(()=>(window as any).submissions[0]);
  expect(submission.visibility).toBe('public');
  expect(JSON.stringify(submission.content)).toContain('https://example.com/docs');
  expect(errors).toEqual([]);
});

test('link rejects unsafe URLs and cancels without changing the draft',async({page})=>{
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  await page.addStyleTag({content:'[contenteditable="true"] { min-height:50px; }'});
  const editor=page.getByRole('textbox',{name:'Comment',exact:true});await editor.fill('Keep draft');
  await page.getByRole('button',{name:'Link',exact:true}).click();
  await page.getByRole('textbox',{name:'Link URL'}).fill('javascript:alert(1)');
  await page.getByRole('button',{name:'Insert link',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid http or https link.');
  await expect(editor.locator('a')).toHaveCount(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Keep draft');
});

for (const activation of ['pointer','keyboard']) test(`attachment picker cancellation does not reopen tooltip (${activation})`,async({page})=>{
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  const button=page.getByRole('button',{name:'Attach files to comment'});
  await page.bringToFront();
  await button.focus();await expect(page.getByRole('tooltip')).toHaveText('Attach files');
  const chooser=page.waitForEvent('filechooser');
  if(activation==='keyboard')await button.press('Enter');else await button.click();
  await chooser;
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // Model native dialog blur, Cancel, and automatic focus restoration.
  await button.evaluate(node=>(node as HTMLElement).blur());
  await page.locator('input[type="file"]').dispatchEvent('cancel');
  await button.focus();
  await page.waitForTimeout(700);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]').first()).toHaveText('');
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  await expect(page.getByRole('tooltip',{name:'Attach files',exact:true})).toBeVisible();
  await expect(page.getByRole('tooltip',{name:'Mention a participant',exact:true})).toHaveCount(0);
});

for (const activation of ['pointer','keyboard']) test(`mention selection closes the picker and restores typing (${activation})`,async({page})=>{
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  const opener=page.locator('summary[aria-label="Mention a participant"]');
  await opener.click();
  const query=page.getByRole('combobox',{name:'Mention a participant',exact:true});
  await query.fill('Ann');
  await expect.poll(()=>page.evaluate(()=>(window as any).pendingSearches.length)).toBe(1);
  await page.evaluate(()=>(window as any).pendingSearches[0]([{id:'ann',displayName:'Ann'}]));
  const option=page.getByRole('option',{name:'Ann',exact:true});
  await expect(option).toBeVisible();
  if(activation==='keyboard'){await query.focus();await query.press('ArrowDown');await query.press('Enter');}else await option.click();
  await expect(page.locator('details.a-rich-comment-composer__mentions')).not.toHaveAttribute('open','');
  await expect(query).toBeHidden();
  const editor=page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeFocused();
  await expect(editor).toContainText('@Ann');
  await page.keyboard.type(' check the document');
  await expect(editor).toContainText('@Ann check the document');
  await opener.click();await expect(query).toBeVisible();await expect(query).toHaveValue('');
  await expect(page.getByRole('option',{name:'Ann',exact:true})).toHaveCount(0);
});

test("mention picker dismisses outside, on Escape and keyboard departure without stale results",async({page})=>{
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  await page.addStyleTag({content:'[contenteditable="true"] { min-height: 50px; }'});
  const opener=page.locator('summary[aria-label="Mention a participant"]');
  const query=page.getByRole('combobox',{name:'Mention a participant',exact:true});
  const editor=page.locator('[contenteditable="true"]').first();
  await editor.fill('Keep this draft');
  await opener.click();await query.fill('Ann');
  await query.click();await expect(query).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).pendingSearches.length)).toBe(1);
  await editor.click();await expect(query).toBeHidden();await expect(editor).toBeFocused();
  await page.evaluate(()=>(window as any).pendingSearches[0]([{id:'ann',displayName:'Stale Ann'}]));
  await opener.click();await expect(query).toHaveValue('');
  await expect(page.getByRole('option',{name:'Stale Ann'})).toHaveCount(0);
  await query.focus();await page.keyboard.press('Escape');
  await expect(query).toBeHidden();await expect(opener).toBeFocused();
  await opener.click();await query.focus();await page.keyboard.press('Tab');
  await expect(query).toBeHidden();
  await expect(editor).toHaveText('Keep this draft');
});

test("inline callback changes do not loop busy notifications or restart mention searches",async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(bundle);
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false]);
  for(let index=0;index<4;index++)await page.evaluate(()=>(window as any).rerender());
  await page.locator('summary[aria-label="Mention a participant"]').click();
  const query=page.getByRole('combobox',{name:'Mention a participant',exact:true});
  await query.fill('Ann');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(1);
  await page.evaluate(()=>{(window as any).rerender();(window as any).pendingSearches[0]([{id:'ann',displayName:'Ann'}]);});
  await expect(page.getByRole('option',{name:'Ann',exact:true})).toBeVisible();
  // Wait beyond debounce: an unrelated parent update must not cause a new request.
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>(window as any).searchCalls.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).busyCalls)).toEqual([false]);
  await query.fill('Old');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(2);
  await query.fill('New');
  await expect.poll(()=>page.evaluate(()=>(window as any).searchCalls.length)).toBe(3);
  await page.evaluate(()=>{(window as any).pendingSearches[2]([{id:'new',displayName:'New result'}]);(window as any).pendingSearches[1]([{id:'old',displayName:'Stale result'}]);});
  await expect(page.getByRole('option',{name:'New result',exact:true})).toBeVisible();
  await expect(page.getByRole('option',{name:'Stale result',exact:true})).toHaveCount(0);
  await query.fill('');
  await expect(page.getByRole('option',{name:'New result',exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).setDisabled(true));
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false,true]);
  await page.evaluate(()=>(window as any).setDisabled(false));
  await expect.poll(()=>page.evaluate(()=>(window as any).busyCalls)).toEqual([false,true,false]);
  expect(errors).toEqual([]);
});
