import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {authenticateBrowser}=createRequire(import.meta.url)('../../../tests/e2e/authenticate-browser.ts');
const b=await chromium.launch();
try{const c=await b.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true});const p=await c.newPage();
 await authenticateBrowser(p,{origin:'https://neon.dev.athyper.test',username:'catl.owner',password:process.env.QUALIFICATION_PASSWORD!});
 await p.goto('/mdg/operation-review');await expect(p.locator('select')).toHaveCount(5);
 console.log({exactSelector:await p.getByLabel('Decision for case_update',{exact:true}).count(),labelSelector:await p.getByLabel('Decision for case_update').count(),selects:await p.locator('select').count()});
 await c.storageState({path:'tests/e2e/.auth/catl.owner-correction-review.json'});
}finally{await b.close();}
