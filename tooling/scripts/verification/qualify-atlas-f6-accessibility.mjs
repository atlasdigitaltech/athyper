import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {images,save,authenticated} from './atlas-f6-common.mjs';
const report={observedAt:new Date().toISOString(),plane:'studio',images:images(),checks:[]};
let browser;
try{
 const auth=await authenticated('studio','catl.admin');await auth.close();
 browser=await chromium.launch();
 const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/dev/studio/catl.admin.json'});const page=await context.newPage();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto('https://studio.dev.athyper.test/home',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Atlas',exact:true}).click();const dock=page.locator('[aria-label="Atlas AI workspace"]');await dock.waitFor();await page.waitForTimeout(1500);
  const result=await new AxeBuilder({page}).include('[aria-label="Atlas AI workspace"]').withTags(['wcag2a','wcag2aa']).analyze();
  const violations=result.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>n.target)}));
  await page.keyboard.press('Tab');const focusedWithin=await dock.evaluate(el=>el.contains(document.activeElement));
  report.checks.push({width,violations,focusedWithin,checksPassed:result.passes.length});
 }
 report.passed=report.checks.every(c=>c.violations.length===0&&c.focusedWithin);
}catch(error){report.passed=false;report.blocker=error.message.split('\n')[0];}finally{if(browser)await browser.close();save('accessibility.json',report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}
