import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textCandidates, cssCandidates } from './inventory-entity-ui.mjs';
test('extracts visible candidates without counting imports or catalog lookups',()=>{
  const source=`import x from 'module'; const id='internal'; const a=<><button aria-label="Close">Save</button><p>{'Loading'}</p><p>{intl.message('loading')}</p></>; const config={label:'Name'}; setError('Try again');`;
  assert.deepEqual(textCandidates(source).map(x=>x.text),['Close','Save','Loading','Name','Try again']);
});
test('ignores CSS comments and definitions; distinguishes semantic and layout reviews',()=>{
  assert.deepEqual(cssCandidates('/* x{width:9px} */ :root{--a-size:3px} .x{color:#fff;width:20rem;padding:var(--a-space-2)}').map(x=>[x.property,x.kind]),[['color','semantic-review'],['width','layout-review']]);
});
