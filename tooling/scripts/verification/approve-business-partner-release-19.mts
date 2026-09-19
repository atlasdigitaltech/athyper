/** Authenticated exact-release review, separately from grants, activation and policy acceptance. */
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
async function authenticateBrowser(page:any,input:any){
 await page.goto(input.origin+'/api/auth/login?returnTo=%2Fhome');await page.getByLabel(/email|username/i).fill(input.username);
 const password=page.getByLabel(/^password$/i);if(!await password.isVisible())await page.getByRole('button',{name:/sign in|log in|continue|next/i}).click();
 await password.fill(input.password);await page.getByRole('button',{name:/sign in|log in/i}).click();
 const otp=page.locator('input[name="otp"]');const phase=await Promise.race([otp.waitFor({state:'visible',timeout:30000}).then(()=>'otp'),page.waitForURL((url:URL)=>url.origin===input.origin&&!url.pathname.startsWith('/api/auth/'),{timeout:30000}).then(()=>'returned')]);
 if(phase==='otp'){
 console.log(JSON.stringify({account:input.username,status:'LOGIN_MFA_REQUIRED',operations:51}));
 const lines=createInterface({input:process.stdin});const code=await new Promise<string>(resolve=>lines.once('line',resolve));lines.close();if(!/^\d{6}$/.test(code.trim()))throw Error('Six-digit code required');
 await otp.fill(code.trim());await page.getByRole('button',{name:/sign in|log in|submit|continue/i}).click();await page.waitForURL((url:URL)=>url.origin===input.origin&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
 }
 const session=await(await page.request.get(input.origin+'/api/auth/session')).json();
 if(session.state==='context_required'){await page.goto(input.origin+'/select-context?returnTo=%2Fhome');const contexts=page.getByRole('list',{name:'Available authorized contexts'}).getByRole('listitem');await expect(contexts).toHaveCount(1);await contexts.click();await page.waitForURL((url:URL)=>url.pathname==='/home');}
}
const account=process.argv[2];
if(!['catl.owner','catl.admin'].includes(account??'')||!process.env.QUALIFICATION_PASSWORD)throw Error('Named reviewer and password environment required');
const packet=JSON.parse(readFileSync('governance/policy/reviews/business-partner-release-19-workflow.dev.json','utf8'));
if(packet.packetRevision!=='d78669b00d4ce71f64d5aaf0443576987055bb45c0ba2c21a1dd0275a8706e01'||packet.rows.length!==51)throw Error('Approved import packet changed');
for(const row of packet.rows)for(const e of [...row.proposal.implementationEvidence,...row.proposal.regressionEvidence])if(createHash('sha256').update(readFileSync(e.path)).digest('hex')!==e.sha256)throw Error('Approved import evidence changed');
const statePath=`tests/e2e/.auth/${account}-release-19-review.json`;
const fallbackPath=`tests/e2e/.auth/${account}-import-review.json`;
if(!existsSync(statePath)&&existsSync(fallbackPath))writeFileSync(statePath,readFileSync(fallbackPath),{mode:0o600});
const browser=await chromium.launch();
const context=await browser.newContext({...(existsSync(statePath)?{storageState:statePath}:{}),baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true});
try{
 const page=await context.newPage();
 if((await (await context.request.get('/api/auth/session')).json()).state!=='authenticated') await authenticateBrowser(page,{origin:'https://neon.dev.athyper.test',username:account,password:process.env.QUALIFICATION_PASSWORD});
 await page.goto('/mdg/operation-review');
 const check=async()=>{const r=await context.request.get('/api/governance/operation-review');if(!r.ok())throw Error('Review identity or revision unavailable');const data=await r.json();if(data.packetRevision!==packet.packetRevision||data.reviewerId!==account||data.rows.length!==51||data.rows.some((r:any)=>!packet.rows.some((p:any)=>p.operation===r.operation&&p.proposalSha256===r.proposalSha256)))throw Error('Exact reviewed proposal changed');return data;};
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
   console.log(JSON.stringify({account,status:'MFA_REQUIRED',operations:51}));
   const lines=createInterface({input:process.stdin});
   const code=await new Promise<string>(resolve=>lines.once('line',resolve));lines.close();
   if(!/^\d{6}$/.test(code.trim()))throw Error('Six-digit MFA code required');
   await otp.fill(code.trim());await page.getByRole('button',{name:/sign in|log in|submit|continue/i}).click();
   await page.waitForURL(url=>url.origin==='https://neon.dev.athyper.test'&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
   await page.goto('/mdg/operation-review');data=await check();
  }
  if(data.assurance!=='elevated')throw Error('MFA elevation not established');
  for(const row of packet.rows)await page.getByLabel(new RegExp('^Decision for '+row.operation+'(?:\\s|$)')).selectOption('approve');
  await page.getByLabel('Reason for the selected decisions',{exact:true}).fill('User-authorized review of release 19 ba383d04-9a18-4e59-ab4e-3d9726e934c6, packet d78669b00d4ce71f64d5aaf0443576987055bb45c0ba2c21a1dd0275a8706e01: 42 exact included operations and nine deferrals, pinned native contract, runtime bindings and catalog. Earlier operation decisions are provenance only. Local regression evidence does not establish deployed qualification. No grants, activation or acceptance of policy differences is authorized by this review.');
  await page.getByLabel('I confirm the selected business semantics and exact permission/scope proposals.',{exact:true}).check();
  await page.getByLabel('I confirm security conditions. This does not authorize grants or activation.',{exact:true}).check();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/governance/operation-review')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Record 51 explicit decisions',exact:true}).click();
  const result=await response;
  if(result.status()!==201)throw Error('Authenticated review write rejected');
  const body=await result.json();console.log(JSON.stringify({account,reference:body.reference,assessment:body.assessment,grantsChanged:false,activationAuthorized:false}));
 }
 mkdirSync('tests/e2e/.auth',{recursive:true});await context.storageState({path:`tests/e2e/.auth/${account}-release-19-review.json`});
}catch(e){console.log(JSON.stringify({account,status:'REVIEW_NOT_COMPLETED',error:e instanceof Error?e.message:'Review failed'}));process.exitCode=1;}finally{mkdirSync('tests/e2e/.auth',{recursive:true});await context.storageState({path:statePath});await browser.close();}
