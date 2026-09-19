#!/usr/bin/env node
// Run from the repository root. Only targets the named development instance.
import { spawnSync } from "node:child_process";
const program = `
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadConfig } from './dist/config/index.js';
import { createContainer } from './dist/composition/create-container.js';
import { registerAdapters } from './dist/composition/register-adapters.js';
import { createLifecycle } from '@athyper/server-foundation/lifecycle';
import { createPushNotificationHandler } from '@athyper/server-platform-notifications';
// Docker exec does not inherit the entrypoint's file-loaded environment.
// Load only the challenge settings required by config validation, without logging them.
for (const name of ['MASTER_DATA_VERIFICATION_KEYS_JSON','LOCAL_CONTACT_CHALLENGE_PRIVATE_KEY','LOCAL_CONTACT_CHALLENGE_DELIVERY_KEY']) {
  const path=process.env[name+'_FILE'];
  if(path)process.env[name]=readFileSync(path,'utf8').trim();
}
const config=loadConfig();
assert.equal(config.env,'local');
assert.equal(config.notificationCapture,true,'Refusing sends outside capture mode');
assert.equal(config.email.host,'mailtrap');
const container=createContainer(), lifecycle=createLifecycle();
registerAdapters(container,config,lifecycle);
const marker='local-channel-acceptance-'+randomUUID();
const tenantId=randomUUID(), principalId=randomUUID();
try {
  for (const channel of ['email','sms','whatsapp']) {
    const handler=container.adapters.notificationChannels.get(channel);
    assert.ok(handler,channel+' missing');
    const result=await handler.send({channel,recipientAddress:'synthetic-recipient',templateKey:marker,subject:marker,planeKey:'neon',tenantId,recipientId:principalId,payload:{renderedText:'Local capture acceptance: '+channel}});
    assert.ok(result.externalId.startsWith('capture:'));
  }
  const handler=createPushNotificationHandler({transports:container.adapters.pushTransports,subscriptions:{
    async listActive(input){assert.equal(input.tenantId,tenantId);assert.equal(input.principalId,principalId);return ['web','android','ios'].map(platform=>({id:randomUUID(),tenantId,principalId,planeKey:'neon',platform,endpoint:'https://synthetic.invalid/push'}));},
    async deactivate(){throw Error('Unexpected subscription deactivation');},
    async upsert(){throw Error('No database fixture writes allowed');}
  }});
  const result=await handler.send({channel:'push',recipientAddress:principalId,recipientId:principalId,tenantId,templateKey:marker,subject:marker,planeKey:'neon',payload:{renderedText:'Local push capture acceptance'}});
  assert.ok(result.externalId.startsWith('capture:'));
  const response=await fetch('http://mailtrap:8025/api/v1/search?query='+encodeURIComponent(marker),{signal:AbortSignal.timeout(5000)});
  assert.ok(response.ok);
  const {messages}=await response.json();
  assert.equal(messages.length,6);
  const channels=['email','sms','whatsapp','push:web','push:android','push:ios'];
  for(const channel of channels){
    const message=messages.find(m=>m.Subject.includes('[CAPTURE:'+channel+']'));
    assert.ok(message,channel+' missing from inbox');
    const name=channel==='email'?'noreply':channel.replace(':','-');
    assert.equal(message.From.Address,name+'@dev.athyper.test');
    assert.equal(message.To[0].Address,channel.replace(':','-')+'@capture.dev.athyper.test');
  }
  console.log(JSON.stringify({status:'passed',scope:'deployed host adapters and push handler; synthetic subscriptions; no authenticated API or database writes',marker,channels,messages:messages.length}));
} finally {await lifecycle.shutdown('capture-smoke');}
`;
const result=spawnSync('docker',['exec','-i','athyper-dev-api-1','node','--input-type=module'],{input:program,encoding:'utf8'});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
