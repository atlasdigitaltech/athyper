import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {authenticated,images,save,directory} from './atlas-f6-common.mjs';
const report={observedAt:new Date().toISOString(),images:images()};
const path=resolve(directory,'grounded-browser.json');let auth;
try{
 auth=await authenticated('neon','catl.admin');assert.equal(auth.session.assurance,'elevated','Positive document-grounded pilot requires current MFA');await auth.close();auth=undefined;
 execFileSync(process.execPath,['tooling/scripts/verification/qualify-atlas-document-chat.mjs'],{env:{...process.env,ATLAS_CHAT_REPORT_PATH:path,ATLAS_CHAT_QUESTION:'How many days elapse between evaluations of the make-believe initiative, and what is it called? Cite the synthetic document.'},stdio:'pipe',timeout:180000});
 const result=JSON.parse(readFileSync(path,'utf8'));assert.equal(result.passed,true);report.threadId=result.threadId;report.runId=result.runId;report.evidence='grounded-browser.json';report.passed=true;
}catch(error){report.passed=false;report.blocker=error.message.split('\n')[0];}finally{if(auth)await auth.close();report.finalImages=images();save('grounded.json',report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}
