/** Read-only verification of the second audit fixes, using the existing CATL admin session. */
import assert from 'node:assert/strict';
import {chromium,request} from '@playwright/test';
import {id} from './seed-identity.mjs';
const options={baseURL:'https://neon.dev.athyper.test',storageState:'tests/e2e/.auth/dev/neon/catl.admin.json',ignoreHTTPSErrors:true};
const client=await request.newContext(options),browser=await chromium.launch();
const context=await browser.newContext(options);
try {
  for(const kind of ['partner','person-partner']) {
    const bp=id('cirrusatlantic',kind),base=`/api/relay/entity-runtime/business_partner/records/${bp}`;
    for(const section of ['overview','identity','certificates','banking']) {
      const response=await client.get(`${base}/sections/${section}?surface=detail`);
      assert.equal(response.status(),200,`${kind} ${section}`);
      const result=await response.json();
      if(section==='banking') assert.ok(!JSON.stringify(result).includes('protectedValueToken'),'Banking must not project storage tokens');
      if(section==='certificates') {
        const fields=result.presentation.childCollections.find(item=>item.key==='certifications').fields.map(item=>item.key);
        assert.ok(fields.includes('display_name') && fields.includes('issuing_body'));
        assert.ok(!fields.includes('custom_name'));
        const catalog=result.data.collections.certifications.find(item=>item.certification_type_id);
        assert.ok(catalog?.display_name && catalog?.issuing_body,'Catalog certificate name and issuer must survive projection');
      }
    }
    const page=await context.newPage();
    await page.goto(`/mdg/business-partner/business-partners/${bp}?section=certificates&tab=360&tag=a&tag=b`);
    await page.getByRole('heading',{name:'Certificates',exact:true}).waitFor();
    await page.getByText('Issuing body',{exact:true}).first().waitFor();
    const url=new URL(page.url());
    assert.equal(url.pathname,`/app/entity/business_partner/${bp}`);
    assert.equal(url.searchParams.get('section'),'certificates');
    assert.deepEqual(url.searchParams.getAll('tag'),['a','b']);
    let bootstraps=0;
    page.on('request',request=>{if(request.url().includes('/bootstrap?'))bootstraps++;});
    await page.goto(`/app/entity/business_partner/${bp}?section=identity&tab=360`);
    await page.getByRole('heading',{name:'Identity',exact:true}).waitFor();
    const initialBootstraps=bootstraps;
    await page.evaluate(()=>{
      history.pushState(history.state,'',location.pathname+'?section=banking&tab=360');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('heading',{name:'Bank Accounts',exact:true}).waitFor();
    await page.goBack();
    await page.getByRole('heading',{name:'Identity',exact:true}).waitFor();
    await page.goForward();
    await page.getByRole('heading',{name:'Bank Accounts',exact:true}).waitFor();
    assert.equal(bootstraps,initialBootstraps,'Section Back/Forward must not reload bootstrap');
    await page.close();
  }
  console.log(JSON.stringify({actor:'catl.admin',identity:'organization and person passed',certificates:'catalog name and issuer in API and UI passed',alias:'canonical redirect and repeated query preservation passed',banking:'masked API reads passed',history:'Back/Forward without bootstrap reload passed',writes:0}));
} finally {await context.close();await browser.close();await client.dispose();}
