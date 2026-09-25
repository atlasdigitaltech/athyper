/** Local read-only walkthrough; each plane uses its own authenticated saved session. */
import {chromium,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch(),results=[];
try{
 for(const plane of ['neon','mesh','studio']){
  const context=await browser.newContext({ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/${plane}/catl.owner.json`,viewport:{width:1440,height:1000}});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const kind of ['notifications','inbox']){
    await page.goto(`https://${plane}.dev.athyper.test/${kind}`);
    await expect(page.getByRole('button',{name:'Filters',exact:true})).toBeVisible();
    await expect(page.getByText(/\d+ matching (notifications|tasks)/).first()).toBeVisible();
    await expect(page.getByText("Activity couldn't be loaded",{exact:true})).toHaveCount(0);
    const initial=page.url();
    await page.getByRole('button',{name:'Filters',exact:true}).click();
    await expect(page.getByRole('button',{name:'Add filter',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(page.url()).toBe(initial);
    if(kind==='inbox'){
     await expect(page.locator('[data-activity-density]').first()).toHaveAttribute('data-activity-density','compact');
     await page.getByRole('button',{name:'Filters',exact:true}).click();
     await page.getByRole('button',{name:'Remove filter 1',exact:true}).click();
     await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
     await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page).toHaveURL(/activityQuery=/);
     await page.goBack();await expect(page).toHaveURL(initial);
    }
   }
   await page.getByRole('button',{name:/^Notifications,/}).first().click();
   const dialog=page.getByRole('dialog');await expect(dialog).toHaveCount(1);
   await dialog.getByRole('button',{name:'Filters',exact:true}).click();
   await expect(dialog.getByRole('button',{name:'Add filter',exact:true})).toBeVisible();
   await expect(page.getByRole('dialog')).toHaveCount(1);
   const search=dialog.getByRole('searchbox',{name:'Search activity'});await search.fill('local walkthrough');await search.press('Enter');
   await expect(dialog.getByRole('link',{name:'Open Activity center in full view'})).toHaveAttribute('href',/activityQuery=/);
   await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
   await expect(search).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`/tmp/activity-phase2-${plane}-narrow.png`});
   expect(errors).toEqual([]);results.push({plane,routes:true,drawer:true,applyCancelBack:true,narrow:true,hydrationErrors:errors.length});
  }finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync('/tmp/athyper-activity-phase2-browser.json',JSON.stringify(results,null,2)+'\n');console.log(results);
