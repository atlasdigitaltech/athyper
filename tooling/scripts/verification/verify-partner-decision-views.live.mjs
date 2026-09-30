/** Normal signed-in sessions only; no credentials, permission synthesis or writes. */
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const origin='https://neon.dev.athyper.test';
const partners=['b4137225-4534-5469-8138-09d15a970271','13792b98-a65a-544f-8212-742ee48e74c6'];
const browser=await chromium.launch();
const results=[];
try {
 for(const name of ['catl.admin','catl.owner']) {
  const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/neon/${name}.json`});
  try {
   const session=await (await context.request.get('/api/auth/session')).json();assert.equal(session.state,'authenticated',`Refresh ${name}`);
   const cookie=(await context.cookies()).find(c=>['__Host-athyper-csrf','athyper-csrf'].includes(c.name));
   assert.ok((await context.request.post('/api/auth/refresh',{headers:{Origin:origin,...(cookie?{'X-CSRF-Token':decodeURIComponent(cookie.value)}:{})}})).ok());
   const read=async(bp,section,extra='')=>{
    const response=await context.request.get(`/api/relay/entity-runtime/business_partner/records/${bp}/sections/${section}?surface=detail${extra}`);
    return {status:response.status(),body:await response.json()};
   };
   for(const bp of partners) {
    const q=await read(bp,'qualifications-certificates');assert.equal(q.status,200);
    assert.equal(q.body.data.items.length,3);assert.deepEqual(new Set(q.body.data.items.map(i=>i.date_window)),new Set(['scheduled','within_window','ended']));
    assert.ok(q.body.data.items.every(i=>i.decision==='pending'&&i.recorded_condition_count===1&&i.condition_summaries[0].summary));
    assert.ok(!JSON.stringify(q.body).includes('MUST_NOT_LEAVE_READER'));
    assert.ok(!JSON.stringify(q.body).includes('private_note'));
    assert.equal(q.body.presentation.fields.find(f=>f.key==='effective_from').temporalType,'date');
    const first=await read(bp,'qualifications-certificates','&limit=1');assert.equal(first.body.data.items.length,1);assert.ok(first.body.data.nextCursor);
    const second=await read(bp,'qualifications-certificates',`&limit=1&cursor=${encodeURIComponent(first.body.data.nextCursor)}`);
    assert.equal(second.status,200);assert.notEqual(first.body.data.items[0].id,second.body.data.items[0].id);
    const r=await read(bp,'restrictions');assert.equal(r.status,200);
    if(r.status===200){assert.equal(r.body.data.items.length,3);assert.ok(r.body.data.items.every(i=>i.reason===undefined&&i.lift_reason===undefined));}
    results.push({actor:name,partner:bp,qualificationRows:3,restrictionStatus:r.status,pagination:'pass',privateConditions:'absent'});
   }
   const foreign=await read('11111111-1111-4111-8111-111111111111','qualifications-certificates');assert.ok([403,404].includes(foreign.status));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('response',response=>{if(response.status()>=500)console.log(JSON.stringify({upstreamFailure:response.status(),path:new URL(response.url()).pathname}));});
   for(const viewport of [{width:1440,height:1000},{width:440,height:956}]) {
    await page.setViewportSize(viewport);
    for(const bp of partners) {
     console.log(JSON.stringify({browserActor:name,viewport:viewport.width,partner:bp}));
     await page.goto(`/app/entity/business_partner/${bp}?section=qualifications-certificates&tab=qualifications`,{waitUntil:'domcontentloaded'});
     await expect(page.getByText('Synthetic example: review laboratory handling requirements before use. Satisfaction has not been evaluated.').first()).toBeVisible({timeout:30000});
     await page.reload({waitUntil:'domcontentloaded'});
     await expect(page.getByText('Stored conditions',{exact:true}).first()).toBeVisible({timeout:30000});
     assert.equal(new URL(page.url()).searchParams.get('section'),'qualifications-certificates');
     await expect(page.getByRole('heading',{name:'Qualifications',exact:true})).toBeVisible();
     {
      await page.locator('summary[aria-label="View settings"]').click();
      const sectionToggle=page.getByRole('menuitemcheckbox',{name:'Section view',exact:true});
      if(await sectionToggle.getAttribute('aria-checked')==='false') await sectionToggle.click();
      else await page.locator('summary[aria-label="View settings"]').click();
      await expect(page.getByRole('complementary',{name:'Qualifications sections'}).getByRole('button',{name:'Restrictions',exact:true})).toHaveCount(1);
      await page.locator('summary').filter({hasText:'Qualifications'}).click();
      await page.locator('details[open]').getByRole('button',{name:'Restrictions',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Restrictions',exact:true})).toBeVisible();
      await expect(page.getByText('Prohibited operations',{exact:true}).first()).toBeVisible({timeout:20000});
      assert.equal(new URL(page.url()).searchParams.get('section'),'restrictions');
      await page.goBack();
      await expect(page.getByText('Stored conditions',{exact:true}).first()).toBeVisible({timeout:20000});
     }
    }
   }
   await page.screenshot({path:`/tmp/partner-decision-views-${name}.png`,fullPage:true});
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log(JSON.stringify({results,browser:'desktop/mobile, both categories, refresh and navigation passed'}));
}finally{await browser.close();}
