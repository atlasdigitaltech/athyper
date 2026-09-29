import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { NotificationChannelHandler } from "@athyper/server-contract-notifications";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const template = "master.contact.local-verification";
const aad = (tenant: string, principal: string) => Buffer.from(`${template}:${tenant}:${principal}`);
function key(value: string) { const decoded=Buffer.from(value,'base64');if(decoded.length!==32)throw Error('Local delivery key must contain 32 bytes');return decoded; }
export function queueLocalVerificationEmail(secret: string) {
  const encryptionKey=key(secret);
  return async (input: {context:VerifiedRequestContext;destination:string;link:string},tx:Transaction<Record<string,never>>) => {
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,nonce);
    cipher.setAAD(aad(input.context.tenantId,input.context.principalId));
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify({link:input.link,expiresAt:Date.now()+600000}),'utf8'),cipher.final()]);
    const payload={localVerification:{nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')}};
    const challengeId=new URL(input.link).hash.slice(1).split('.')[0]!;
    const message=(await sql<{id:string}>`INSERT INTO event.notification_message(tenant_id,plane_key,event_id,event_code,entity_type,entity_id,template_key,template_version,subject,payload,priority,channels,recipient_count,status,metadata,created_by)
      VALUES(${input.context.tenantId}::uuid,'neon',${challengeId},'master.contact.verification_requested','contact_challenge',${challengeId}::uuid,${template},1,'Verify your Athyper contact email',${JSON.stringify(payload)}::jsonb,'normal',ARRAY['email'],1,'pending','{}'::jsonb,${input.context.principalId}::uuid) RETURNING id`.execute(tx)).rows[0]!;
    await sql`INSERT INTO event.notification_delivery(tenant_id,message_id,recipient_id,recipient_addr,channel,status,max_attempts,idempotency_key,channel_detail,metadata,created_by)
      VALUES(${input.context.tenantId}::uuid,${message.id}::uuid,${input.context.principalId}::uuid,${input.destination},'email','pending',5,${`local-verification:${challengeId}`},${JSON.stringify(payload)}::jsonb,'{}'::jsonb,${input.context.principalId}::uuid)`.execute(tx);
  };
}
function deliveryError(code: string, retryable: boolean) { return Object.assign(new Error(code), { retryable }); }
export function localVerificationEmailHandler(email: NotificationChannelHandler, secret: string): NotificationChannelHandler {
 const encryptionKey=key(secret);
 return {...email,async send(request){
   if(request.templateKey!==template)return email.send(request);
   let clear: {link: string; expiresAt: number};
   try {
     if(!request.tenantId||!request.recipientId)throw Error();
     const envelope=request.payload.localVerification as {nonce:string;ciphertext:string;tag:string};
     const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(envelope.nonce,'base64'));
     decipher.setAAD(aad(request.tenantId,request.recipientId));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
     clear=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8')) as typeof clear;
     if(typeof clear.link!=="string" || !Number.isFinite(clear.expiresAt))throw Error();
   } catch {throw deliveryError('LOCAL_VERIFICATION_INVALID_ENVELOPE',false);}
   if(clear.expiresAt<=Date.now())throw deliveryError('LOCAL_VERIFICATION_EXPIRED',false);
   try { return await email.send({...request,payload:{renderedText:`Confirm this email address within ten minutes: ${clear.link}`}}); }
   catch(error) { throw deliveryError('LOCAL_VERIFICATION_TRANSPORT_FAILED', !(error && typeof error==='object' && Reflect.get(error,'retryable')===false)); }
 }};
}
