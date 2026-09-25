// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ApiTransportError } from '@athyper/platform-api-client';
import { ProtectedValue, ProtectedValueProvider, type ProtectedValueRequest } from '../../../../platform/entity/runtime/form-detail/src/protected-value';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it('starts CSRF-protected verification at the exact section without revealing', async () => {
 const host=document.createElement('div'); const root=createRoot(host); const request=vi.fn();
 window.history.replaceState({}, '', '/mdg/business-partner/example?section=identifiers-tax&tab=360');
 document.cookie='athyper-csrf=test-csrf; path=/';
 const submit=vi.spyOn(HTMLFormElement.prototype,'submit').mockImplementation(()=>{});
 try {
  await act(async()=>root.render(<ProtectedValueProvider request={request}><ProtectedValue operation="identifier.reveal" id="one" allowed={false} verificationRequired masked="masked" /></ProtectedValueProvider>));
  expect(host.querySelector('button')?.textContent).toBe('Reveal');
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent==='Verify identity')!.click());
  const form=document.body.querySelector<HTMLFormElement>('form[method="POST"]')!;
  expect(form.method).toBe('post');
  expect(new URL(form.action).searchParams.get('returnTo')).toBe(window.location.pathname+window.location.search);
  expect(form.querySelector('input')?.value).toBe('test-csrf');expect(submit).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();expect(host.textContent).toContain('masked');form.remove();
 } finally {await act(async()=>root.unmount());submit.mockRestore();sessionStorage.clear();document.cookie='athyper-csrf=; Max-Age=0; path=/';}
});
it('offers no reveal without authorization or a registered provider', async () => {
 const host=document.createElement('div');const root=createRoot(host);const request=vi.fn();
 try {
  await act(async()=>root.render(<ProtectedValueProvider request={request}><ProtectedValue operation="identifier.reveal" id="one" allowed={false} masked="masked" /></ProtectedValueProvider>));
  expect(host.textContent).toBe('masked');expect(host.querySelector('button')).toBeNull();expect(request).not.toHaveBeenCalled();
  await act(async()=>root.render(<ProtectedValue operation="identifier.reveal" id="one" allowed={true} masked="masked" />));
  expect(host.querySelector('button')).toBeNull();
 } finally {await act(async()=>root.unmount());}
});
it('keeps confirmation disabled without configured reasons and cancels without revealing', async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const request=vi.fn();
 try {
  await act(async()=>root.render(<ProtectedValueProvider request={request}><ProtectedValue operation="identifier.reveal" id="one" allowed masked="masked" /></ProtectedValueProvider>));
  await act(async()=>host.querySelector('button')!.click());
  const dialog=document.body.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Reveal reasons are not configured');
  expect(Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Reveal value')?.disabled).toBe(true);
  await act(async()=>Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Cancel')!.click());
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();expect(request).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('resumes only the confirmation dialog after verification, never the reveal request', async()=>{
 const host=document.createElement('div');const root=createRoot(host);const request=vi.fn();
 sessionStorage.setItem('athyper.reveal.resume',JSON.stringify({id:'one',operation:'identifier.reveal',path:window.location.pathname+window.location.search,expiresAt:Date.now()+1000}));
 try{
  await act(async()=>root.render(<ProtectedValueProvider request={request}><ProtectedValue operation="identifier.reveal" id="one" allowed masked="masked" /></ProtectedValueProvider>));
  expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();expect(request).not.toHaveBeenCalled();expect(sessionStorage.getItem('athyper.reveal.resume')).toBeNull();
 }finally{await act(async()=>root.unmount());sessionStorage.clear();}
});
it('reports transport failure safely without exposing the server message or automatically retrying', async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const request=vi.fn(async()=>{throw new ApiTransportError('dependency','sensitive-server-message',503,undefined,'request-test');});
 try{
  await act(async()=>root.render(<ProtectedValueProvider request={request}><ProtectedValue operation="identifier.reveal" id="one" allowed purposes={[{value:'partner_review',label:{defaultText:'Partner review'}}]} masked="masked" /></ProtectedValueProvider>));
  await act(async()=>host.querySelector('button')!.click());
  const select=document.body.querySelector('select')!;
  await act(async()=>{select.value='partner_review';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent==='Reveal value')!.click());
  const alert=document.body.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain('could not be reached');expect(alert.textContent).toContain('request-test');
  expect(document.body.textContent).not.toContain('sensitive-server-message');expect(request).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('requires a valid purpose, clears at expiry and aborts a stale reveal on record change', async()=>{
 vi.useFakeTimers();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let resolve!: (value:{value:string;expiresAt:string})=>void;let signal:AbortSignal|undefined;
 const request:ProtectedValueRequest=vi.fn(async(_op,_id,_purpose,s)=>{signal=s;return new Promise<{value:string;expiresAt:string}>(r=>{resolve=r;});});
 const mounted=vi.fn(), unmounted=vi.fn();
 function Workspace(){useEffect(()=>{mounted();return unmounted;},[]);return <span>Workspace</span>;}
 const render=(id:string,section='identity')=>root.render(<ProtectedValueProvider request={request} resetKey={section}><Workspace/><ProtectedValue operation="identifier.reveal" id={id} allowed={true} purposes={[{value:'partner_review',label:{defaultText:'Partner review'}}]} masked="masked" /></ProtectedValueProvider>);
 async function start(){
  await act(async()=>host.querySelector('button')!.click());
  const input=document.body.querySelector('select')!;
  await act(async()=>{input.value='partner_review';input.dispatchEvent(new Event('change',{bubbles:true}));});
  const confirm=Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent==='Reveal value')!;
  expect(confirm.disabled).toBe(false);await act(async()=>confirm.click());
 }
 try{
  await act(async()=>render('one'));await start();
  // A slightly ahead server clock used to make the first successful response fail.
  await act(async()=>resolve({value:'synthetic-full-value',expiresAt:new Date(Date.now()+60_500).toISOString()}));
  expect(host.textContent).toContain('synthetic-full-value');
  await act(async()=>vi.advanceTimersByTime(60_001));expect(host.textContent).not.toContain('synthetic-full-value');
  await start();await act(async()=>render('two'));expect(signal?.aborted).toBe(true);
  await act(async()=>resolve({value:'stale-secret',expiresAt:new Date(Date.now()+1000).toISOString()}));expect(host.textContent).not.toContain('stale-secret');
  await start();await act(async()=>resolve({value:'navigation-secret',expiresAt:new Date(Date.now()+1000).toISOString()}));
  expect(host.textContent).toContain('navigation-secret');
  await act(async()=>render('two','addresses'));expect(host.textContent).not.toContain('navigation-secret');
  await start();await act(async()=>render('two','banking'));expect(signal?.aborted).toBe(true);
  await act(async()=>resolve({value:'late-navigation-secret',expiresAt:new Date(Date.now()+1000).toISOString()}));
  expect(host.textContent).not.toContain('late-navigation-secret');expect(mounted).toHaveBeenCalledTimes(1);expect(unmounted).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers();}
});
