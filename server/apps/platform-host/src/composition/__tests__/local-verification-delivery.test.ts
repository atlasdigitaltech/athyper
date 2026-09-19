import {randomBytes} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {queueLocalVerificationEmail,localVerificationEmailHandler} from '../local-verification-delivery.js';
import type {Transaction} from 'kysely';
import type {VerifiedRequestContext} from '@athyper/server-contract-auth';
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
it('queues encrypted evidence and decrypts only for the original recipient scope',async()=>{
 const secret=randomBytes(32).toString('base64'), link='https://neon.dev.athyper.test/contact-verification.html#11111111-1111-4111-8111-111111111111.secret-token';
 const captured:unknown[][]=[];
 const db=new Kysely<Record<string,never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:d=>new PostgresIntrospector(d),createQueryCompiler:()=>new PostgresQueryCompiler()},plugins:[{transformQuery:a=>a.node,async transformResult(a){return {...a.result,rows:[{id:'11111111-1111-4111-8111-111111111111'}]};}}],log:e=>{if(e.level==='query')captured.push([...e.query.parameters]);}});
 const context={tenantId:'44444444-4444-4444-8444-444444444444',principalId:'cca94907-7519-5871-8e3c-6b11aa545c93',planeKey:'neon'} as VerifiedRequestContext;
 await queueLocalVerificationEmail(secret)({context,destination:'test@example.test',link},db as unknown as Transaction<Record<string,never>>);
 const stored=captured.flat().find(v=>typeof v==='string'&&v.includes('localVerification')) as string;
 expect(stored).toBeTruthy();expect(JSON.stringify(captured)).not.toContain('secret-token');
 const send=vi.fn(async(_request:unknown)=>({externalId:'captured'}));
 const handler=localVerificationEmailHandler({channel:'email',send,health:async()=>({status:'healthy'})},secret);
 const request={channel:'email' as const,recipientAddress:'test@example.test',templateKey:'master.contact.local-verification',planeKey:'neon' as const,tenantId:context.tenantId,recipientId:context.principalId,payload:JSON.parse(stored)};
 await handler.send(request);expect(send.mock.calls[0]?.[0]).toMatchObject({payload:{renderedText:expect.stringContaining(link)}});
 await expect(handler.send({...request,tenantId:'11111111-1111-4111-8111-111111111111'})).rejects.toMatchObject({message:'LOCAL_VERIFICATION_INVALID_ENVELOPE',retryable:false});
 send.mockRejectedValueOnce(new Error('SMTP failed '+link));
 await expect(handler.send(request)).rejects.toMatchObject({message:'LOCAL_VERIFICATION_TRANSPORT_FAILED',retryable:true});
 const originalNow=Date.now;Date.now=()=>originalNow()+700000;
 try {await expect(handler.send(request)).rejects.toMatchObject({message:'LOCAL_VERIFICATION_EXPIRED',retryable:false});}
 finally {Date.now=originalNow;}
 expect(send).toHaveBeenCalledTimes(2);
 await db.destroy();
});
