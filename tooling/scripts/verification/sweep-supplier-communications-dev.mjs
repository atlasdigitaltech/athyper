/** Run existing DEV notification maintenance jobs; no alternate dispatcher. */
import { execFileSync } from "node:child_process";
const program = `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {loadConfig} from './dist/config/index.js';
import {createBullMqJobRuntime} from '@athyper/server-runtime-jobs';
for(const name of ['REDIS_BULLMQ_URL','MASTER_DATA_VERIFICATION_KEYS_JSON','LOCAL_CONTACT_CHALLENGE_PRIVATE_KEY','LOCAL_CONTACT_CHALLENGE_DELIVERY_KEY'])if(process.env[name+'_FILE'])process.env[name]=readFileSync(process.env[name+'_FILE'],'utf8').trim();
process.env.REDIS_BULLMQ_URL='redis://:'+encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8'))+'@memorycache:6379';
const c=loadConfig();assert.equal(c.env,'local');assert.equal(c.notificationCapture,true);assert.equal(c.email.host,'mailtrap');
const jobs=createBullMqJobRuntime({redisUrl:c.bullMq.url});
try{for(const name of ['notifications.plan-outbox','notifications.delivery-sweep'])await jobs.enqueue('notifications.maintenance',name,{planeKey:'neon',tenantId:'44444444-4444-4444-8444-444444444444',principalId:'cca94907-7519-5871-8e3c-6b11aa545c93',workerId:'p7-qualification'},{jobId:'p7-'+randomUUID(),maxAttempts:1});console.log('Existing DEV notification maintenance jobs enqueued');}finally{await jobs.close();}
`;
process.stdout.write(
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-source-worker-1",
      "node",
      "--input-type=module",
    ],
    { input: program, encoding: "utf8" },
  ),
);
