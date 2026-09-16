const {chromium, expect} = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch();
 const results = {mode:'Live read-only observation; no save or publication', viewports:[], violations:[], mutations:[], errors:[]};
 try {
  const context = await browser.newContext({ignoreHTTPSErrors:true, storageState:'tests/e2e/.auth/dev/studio/catl.admin.json'});
  const page = await context.newPage();
  page.on('request', r => {if(r.url().includes('/api/relay/meta-entity-authoring/') && !['GET','HEAD'].includes(r.method())) results.mutations.push(r.method()+' '+r.url());});
  page.on('pageerror', e => results.errors.push(e.message));
  await page.goto('https://studio.dev.athyper.test/mdg/business-partner/model?inspect=draft%3A782c6aba-e584-4519-b5f3-ca98f9caa380', {waitUntil:'domcontentloaded'});
  await page.getByRole('region',{name:'Configuration evidence'}).waitFor({timeout:30000});
  for (const [name,width,height,zoom] of [['desktop',1440,1000,1],['tablet',768,1024,1],['mobile',390,844,1],['zoom-200',1440,1000,2]]) {
   await page.setViewportSize({width,height});
   await page.evaluate(z => document.body.style.zoom=String(z),zoom);
   await page.getByRole('region',{name:'Configuration evidence'}).scrollIntoViewIfNeeded();
   await page.screenshot({path:`docs/architecture/business-partner/workspace-qualification/${name}.png`});
   results.viewports.push({name,width,zoom,overflow:await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth)});
  }
  await page.evaluate(()=>document.body.style.zoom='1');
  await page.setViewportSize({width:1440,height:1000});
  const audit=await new AxeBuilder({page}).include('.studio-composition-edit').analyze();
  results.violations=audit.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  await page.getByRole('button',{name:'Preview & changes',exact:true}).click();
  results.previewFocus=await page.evaluate(()=>document.activeElement.id);
  expect(results.mutations).toEqual([]);
  expect(results.errors).toEqual([]);
  expect(results.previewFocus).toBe('studio-preview-changes');
  expect(results.viewports.every(v=>!v.overflow)).toBe(true);
  console.log(JSON.stringify(results,null,2));
 } finally {fs.writeFileSync('docs/architecture/business-partner/workspace-qualification/results.json',JSON.stringify(results,null,2));await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
