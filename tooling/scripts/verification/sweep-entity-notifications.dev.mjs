/** Enqueue ordinary notification maintenance on source DEV's dedicated queue. */
import { execFileSync } from "node:child_process";
const program = `
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createBullMqJobRuntime} from './server/packages/runtime/jobs/src/index.ts';
if(process.env.ATHYPER_ENV!=='local'||process.env.NOTIFICATION_CAPTURE!=='true'||process.env.SMTP_HOST!=='mailtrap')throw Error('Local capture required');
const host=process.env.REDIS_BULLMQ_HOST||(process.env.ATHYPER_LOCAL_SOURCE==='1'?'jobqueue':'memorycache');
const jobs=createBullMqJobRuntime({redisUrl:'redis://:'+encodeURIComponent(readFileSync('/run/secrets/redis-password','utf8').trim())+'@'+host+':6379'});
try{for(const name of ['notifications.plan-outbox','notifications.delivery-sweep'])await jobs.enqueue('notifications.maintenance',name,{planeKey:'neon',tenantId:'44444444-4444-4444-8444-444444444444',principalId:'cca94907-7519-5871-8e3c-6b11aa545c93',workerId:'entity-notification-verification'},{jobId:'entity-notifications-'+randomUUID(),maxAttempts:1});console.log('Normal notification maintenance enqueued on '+host);}finally{await jobs.close();}
`;
process.stdout.write(
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-source-worker-1",
      "node",
      "--import",
      "tsx",
      "--input-type=module",
    ],
    { input: program, encoding: "utf8" },
  ),
);
