import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createInfisicalSecretStore} from '../../../server/packages/adapters/secretstore-infisical/src/index.ts';
if(process.env.PROTECTED_VALUES_INFISICAL_ENVIRONMENT!=='dev'||process.env.PROTECTED_VALUES_INFISICAL_URL!=='https://secrets.dev.athyper.test:8443')throw Error('DEV only');
const store=createInfisicalSecretStore({endpoint:process.env.PROTECTED_VALUES_INFISICAL_URL,
 token:readFileSync(process.env.PROTECTED_VALUES_INFISICAL_TOKEN_FILE!,'utf8').trim(),workspaceId:process.env.PROTECTED_VALUES_INFISICAL_WORKSPACE_ID!,environment:'dev',secretPath:'/',createOnly:true});
const reference=`protected-values/44444444-4444-4444-8444-444444444444/tax:${randomUUID()}`;
const receipt=await store.create!(reference,new TextEncoder().encode('SYNTHETIC compensation qualification'));
try {assert.equal(new TextDecoder().decode((await store.resolve(reference)).bytes),'SYNTHETIC compensation qualification');}
finally {await receipt.discard();}
await assert.rejects(store.resolve(reference),{code:'SECRET_NOT_FOUND'});
await receipt.discard();
console.log(JSON.stringify({created:true,readback:true,compensated:true,notFoundAfterCompensation:true,idempotentDiscard:true}));
