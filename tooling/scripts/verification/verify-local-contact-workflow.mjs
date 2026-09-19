import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(homedir(),'.athyper/instances/dev/secrets');
const adminPassword=readFileSync(resolve(root,'iam-admin-password'),'utf8').trim();
const iam='https://iam.dev.athyper.test',neon='https://neon.dev.athyper.test',mail='https://mail.dev.athyper.test';
const identities=['catl.admin','catl.owner','athyper.admin','athyper.owner'];
const db=sql=>{const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY;'+sql+';COMMIT;',encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.split('\n').filter(s=>s&&s!=='BEGIN'&&s!=='COMMIT');};
const fixtures=db("SELECT value||'|'||id::text FROM master.contact_link WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND metadata->>'source'='local-contact-verification:v1'");
const contacts=Object.fromEntries(fixtures.map(line=>{const[email,id]=line.split('|');return[email.split('@')[0],id];}));
const browser=await chromium.launch({args:['--ignore-certificate-errors']});const report=[];
try {for(const username of identities){
 console.log(JSON.stringify({username,stage:'starting'}));
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 try {
  let response=await context.request.post(iam+'/realms/master/protocol/openid-connect/token',{form:{client_id:'admin-cli',grant_type:'password',username:'athyper-admin',password:adminPassword}});
  assert.ok(response.ok(),'Admin authentication failed');const admin=(await response.json()).access_token;
  response=await context.request.get(iam+'/admin/realms/athyper/users',{headers:{authorization:'Bearer '+admin},params:{username,exact:'true'}});const users=await response.json();assert.equal(users.length,1);
  response=await context.request.post(iam+'/admin/realms/athyper/users/'+users[0].id+'/impersonation',{headers:{authorization:'Bearer '+admin}});assert.ok(response.ok(),'Development test session failed');
  const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(neon+'/api/auth/login?returnTo=/contact-verification.html');
  await page.waitForURL(url=>url.origin===neon&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
  const contactId=contacts[username]||contacts['catl.admin'];assert.ok(contactId);
  const existing=process.env.LOCAL_CHALLENGE_RESUME==='true'&&username.startsWith('catl.') ? db(`SELECT id::text FROM master.local_contact_challenge WHERE contact_id='${contactId}' AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`)[0] : undefined;
  const requestResult=existing?{status:202,body:{challengeId:existing}}:await page.evaluate(async contactId=>{const match=document.cookie.match(/(?:^|;\s*)(?:__Host-athyper-csrf|athyper-csrf)=([^;]+)/);const r=await fetch('/api/relay/master/contacts/'+contactId+'/verification-challenges',{method:'POST',headers:{'Content-Type':'application/json',...(match?{'X-CSRF-Token':decodeURIComponent(match[1])}:{})},body:'{}'});return {status:r.status,body:await r.json()};},contactId);
  if(username.startsWith('athyper.')) {assert.equal(requestResult.status,403,username+': '+JSON.stringify(requestResult));report.push({username,requestStatus:403,outcome:'tenant_denied'});continue;}
  assert.equal(requestResult.status,202,username+': '+JSON.stringify(requestResult));
  console.log(JSON.stringify({username,stage:'queued',status:requestResult.status}));
  const challengeId=requestResult.body.challengeId;let link;
  // Allow two scheduler intervals plus discovery/SMTP time.
  const deliveryDeadline=Date.now()+150_000;
  while(Date.now()<deliveryDeadline&&!link){
    const search=await context.request.get(mail+'/api/v1/search',{params:{query:'subject:"Verify your Athyper contact email"'}});
    const messages=(await search.json()).messages||[];
    for(const message of messages.slice(0,15)){
      const detail=await context.request.get(mail+'/api/v1/message/'+message.ID);const value=await detail.json();
      const match=String(value.Text||'').match(/https:\/\/neon\.dev\.athyper\.test\/contact-verification\.html#[A-Za-z0-9._-]+/);
      if(match&&match[0].includes(challengeId)){link=match[0];break;}
    }
    if(!link)await page.waitForTimeout(1000);
  }
  assert.ok(link,'Durable message was not delivered for '+username);
  console.log(JSON.stringify({username,stage:'mail_received'}));
  await page.goto('about:blank');await page.goto(link);assert.equal(db(`SELECT consumed_at IS NULL FROM master.local_contact_challenge WHERE id='${challengeId}'`)[0],'t');
  await page.getByRole('button',{name:'Confirm email address'}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent.length>0);
  const result=await page.locator('#result').textContent();console.log(JSON.stringify({username,stage:'confirmation',result}));assert.equal(result,'Your contact email is verified.',username+': '+result);
  assert.equal(db(`SELECT is_verified FROM master.contact_link WHERE id='${contactId}'`)[0],'t');
  await page.getByRole('button',{name:'Confirm email address'}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent.includes('CHALLENGE_ALREADY_CONSUMED'));
  report.push({username,contactId,challengeId,requestStatus:202,confirmation:'verified',replay:'rejected',delivery:'durable_mailpit',getConsumed:false});
 } finally {await context.close();}
}}
finally {await browser.close();writeFileSync('/tmp/athyper-local-contact-acceptance.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
