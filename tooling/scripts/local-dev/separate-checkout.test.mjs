import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertSeparateCheckout} from './separate-checkout.mjs';
test('side-by-side admission requires opt-in, detached clean independent checkout and dependencies',()=>{
 const root=mkdtempSync(join(tmpdir(),'athyper-separate-test-'));
 try {
  const shared=join(root,'shared'),candidate=join(root,'candidate');mkdirSync(shared);mkdirSync(candidate);
  const workspace={mode:'source',checkout:shared};
  assert.throws(()=>assertSeparateCheckout(candidate,workspace,false),/requires --separate/);
  assert.throws(()=>assertSeparateCheckout(shared,workspace,true),/outside/);
  assert.throws(()=>assertSeparateCheckout(candidate,workspace,true,()=> 'branch'),/clean detached/);
  assert.throws(()=>assertSeparateCheckout(candidate,workspace,true,()=> ''),/own installed/);
  for(const p of ['node_modules','apps/neon/node_modules','apps/studio/node_modules','apps/mesh/node_modules'])mkdirSync(join(candidate,p),{recursive:true});
  assert.doesNotThrow(()=>assertSeparateCheckout(candidate,workspace,true,()=>''));
  rmSync(join(candidate,'node_modules'),{recursive:true});symlinkSync(shared,join(candidate,'node_modules'));
  assert.throws(()=>assertSeparateCheckout(candidate,workspace,true,()=>''),/own installed/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
