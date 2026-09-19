/** Deployed dependency checks; deliberately does not claim business-journey acceptance. */
import { request, chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const report:any={at:new Date().toISOString(),boundary:'Read-only deployed service health, saved-session validity and existing Mailpit capture. No new rendering, download, voting or email-delivery claim.',services:[],sessions:[]};
for(const service of ['api','worker','scheduler','studio-web','neon-web']){
 const state=JSON.parse(execFileSync('docker',['inspect',`athyper-dev-source-${service}-1`],{encoding:'utf8'}))[0];
 report.services.push({service,image:state.Image,running:state.State.Running,health:state.State.Health?.Status??null});
}
for(const plane of ['studio','neon'])for(const principal of ['catl.admin','catl.owner']){
 const http=await request.newContext({baseURL:`https://${plane}.dev.athyper.test`,ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/${plane}/${principal}.json`});
 try {const response=await http.get('/api/auth/session'),body=await response.json();report.sessions.push({plane,principal,status:response.status(),state:body.state});}finally{await http.dispose();}
}
const http=await request.newContext({baseURL:'https://mail.dev.athyper.test',ignoreHTTPSErrors:true});
try{const response=await http.get('/api/v1/messages'),body=await response.json();report.mailpit={status:response.status(),total:body.total,visibleMessages:body.messages?.length};}finally{await http.dispose();}
const browser=await chromium.launch();
try{const page=await browser.newPage({ignoreHTTPSErrors:true});await page.goto('https://mail.dev.athyper.test');await page.getByPlaceholder('Search mailbox').waitFor();mkdirSync('governance/policy/reports/task-rules-environment.dev',{recursive:true});await page.screenshot({path:'governance/policy/reports/task-rules-environment.dev/mailpit.png'});report.mailpit.browser=true;}finally{await browser.close();}
report.businessQualificationReady=report.sessions.every((s:any)=>s.state==='authenticated');
writeFileSync('governance/policy/reports/task-rules-environment-live.dev.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
