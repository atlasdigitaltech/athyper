/** Record the user's explicit five-target correction approval through real NEON MFA and review UI. */
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
const {authenticateBrowser}=createRequire(import.meta.url)('../../../tests/e2e/authenticate-browser.ts');
const account=process.argv[2];
if(!['catl.owner','catl.admin'].includes(account??'')||!process.env.QUALIFICATION_PASSWORD)throw Error('Named reviewer and password environment required');
const packet=JSON.parse(readFileSync('governance/policy/reviews/business-partner-case-runtime-correction.dev.json','utf8'));
if(packet.rows.length!==5||packet.rows.some((r:any)=>r.proposal.target!=='existing'))throw Error('Unexpected correction packet');
const statePath=`tests/e2e/.auth/${account}-correction-review.json`;
const browser=await chromium.launch();
const context=await browser.newContext({...(existsSync(statePath)?{storageState:statePath}:{}),baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true});
try{
 const page=await context.newPage();
 if((await (await context.request.get('/api/auth/session')).json()).state!=='authenticated') await authenticateBrowser(page,{origin:'https://neon.dev.athyper.test',username:account,password:process.env.QUALIFICATION_PASSWORD});
 await page.goto('/mdg/operation-review');
 const check=async()=>{const r=await context.request.get('/api/governance/operation-review');if(!r.ok())throw Error('Review identity or revision unavailable');const data=await r.json();if(data.packetRevision!==packet.packetRevision||data.reviewerId!==account||data.rows.length!==5||data.rows.some((r:any)=>!packet.rows.some((p:any)=>p.operation===r.operation&&p.proposalSha256===r.proposalSha256)))throw Error('Exact reviewed proposal changed');return data;};
 let data=await check();
 if(data.receipts.some((r:any)=>r.reviewerId===account)){console.log(JSON.stringify({account,alreadyRecorded:true}));}
 else {
  if(data.assurance!=='elevated'){
   await page.getByRole('button',{name:'Continue to MFA',exact:true}).click();
   const password=page.getByLabel(/^password$/i);
   const otp=page.locator('input[name="otp"]');
   await Promise.race([password.waitFor({state:'visible',timeout:30000}).catch(()=>{}),otp.waitFor({state:'visible',timeout:30000}).catch(()=>{})]);
   if(await password.isVisible()){
    await password.fill(process.env.QUALIFICATION_PASSWORD);
    await page.getByRole('button',{name:/sign in|log in|continue/i}).click();
   }
   await otp.waitFor({state:'visible',timeout:30000});
   console.log(JSON.stringify({account,status:'MFA_REQUIRED',operations:5}));
   const lines=createInterface({input:process.stdin});
   const code=await new Promise<string>(resolve=>lines.once('line',resolve));lines.close();
   if(!/^\d{6}$/.test(code.trim()))throw Error('Six-digit MFA code required');
   await otp.fill(code.trim());await page.getByRole('button',{name:/sign in|log in|submit|continue/i}).click();
   await page.waitForURL(url=>url.origin==='https://neon.dev.athyper.test'&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
   await page.goto('/mdg/operation-review');data=await check();
  }
  if(data.assurance!=='elevated')throw Error('MFA elevation not established');
  for(const row of packet.rows)await page.getByLabel('Decision for '+row.operation).selectOption('approve');
  await page.getByLabel('Reason for the selected decisions',{exact:true}).fill('Explicit user-approved correction: these five commands address existing independently owned requests. Use current stored case ownership; retain exact permissions, organization scopes, MFA and separation of duties. Original approvals remain historical. No grant, publication or activation approval.');
  await page.getByLabel('I confirm the selected business semantics and exact permission/scope proposals.',{exact:true}).check();
  await page.getByLabel('I confirm security conditions. This does not authorize grants or activation.',{exact:true}).check();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/governance/operation-review')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Record 5 explicit decisions',exact:true}).click();
  const result=await response;
  if(result.status()!==201)throw Error('Authenticated review write rejected');
  const body=await result.json();console.log(JSON.stringify({account,reference:body.reference,assessment:body.assessment,grantsChanged:false,activationAuthorized:false}));
 }
 mkdirSync('tests/e2e/.auth',{recursive:true});await context.storageState({path:`tests/e2e/.auth/${account}-correction-review.json`});
}catch(e){console.log(JSON.stringify({account,status:'REVIEW_NOT_COMPLETED',error:e instanceof Error?e.message:'Review failed'}));process.exitCode=1;}finally{mkdirSync('tests/e2e/.auth',{recursive:true});await context.storageState({path:statePath});await browser.close();}
