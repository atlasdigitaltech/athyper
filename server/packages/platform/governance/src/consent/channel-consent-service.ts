import { createHash, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type { ChannelConsentRepository, ChannelConsentService, RecordChannelConsentCommand } from "@athyper/server-contract-governance";
import { assertExactPlaneTransaction, type ExactPlaneTransaction, type PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";

type KyselyTransaction = Transaction<Record<string, never>>;

export function createChannelConsentService<DbTransaction extends KyselyTransaction>(options: { readonly transactions: PlaneTransactionCoordinator<ExactPlaneTransaction<DbTransaction>>; readonly repositories: ExactPlaneRepositoryProvider<ChannelConsentRepository<DbTransaction>>; readonly audit: AuditRecorder<DbTransaction>; readonly outbox: OutboxWriter<DbTransaction>; readonly createId?: () => string; readonly now?: () => Date }): ChannelConsentService<DbTransaction> {
  const write=async(command:RecordChannelConsentCommand) => {
    const eventId = options.createId?.() ?? randomUUID();
    const effectiveAt = command.effectiveAt ?? (options.now?.() ?? new Date()).toISOString();
    validateCommand({ ...command, effectiveAt });
    const destinationHash = command.destination ? hashDestination(command.channel, command.destination) : undefined;
    const { expiresAt: _untrustedExpiry, ...userEvidence } = command.evidence ?? {};
    const evidence={...userEvidence,...(command.expiresAt?{expiresAt:command.expiresAt}:{})};
    const repository=options.repositories.require(command.context.planeKey);
    return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
      await sql`INSERT INTO event.channel_consent_event(id,tenant_id,subject_type,subject_id,channel_code,destination_hash,action,source_code,occurred_at,evidence,correlation_id,actor_principal_id) VALUES (${eventId}::uuid,${command.context.tenantId}::uuid,${command.subjectType},${command.subjectId}::uuid,${command.channel},${destinationHash ?? null},${command.consented ? "granted" : "revoked"},${command.sourceCode},${effectiveAt}::timestamptz,${JSON.stringify(evidence)}::jsonb,${command.context.correlationId ?? null}::uuid,${command.context.principalId}::uuid)`.execute(transaction);
      const decision = await repository.upsert({ tenantId: command.context.tenantId, subjectType: command.subjectType, subjectId: command.subjectId, channel: command.channel, ...(destinationHash ? { destinationHash } : {}), consented: command.consented, effectiveAt, ...(command.expiresAt ? { expiresAt: command.expiresAt } : {}), eventId, sourceCode: command.sourceCode, evidence }, transaction);
      await options.outbox.append({ tenantId: command.context.tenantId, topic: "governance", eventType: command.consented ? "governance.channel_consent.opted_in" : "governance.channel_consent.opted_out", eventKey: eventId, aggregateType: "governance.channel_consent", actorId: command.context.principalId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}), payload: { eventId, subjectType: command.subjectType, subjectId: command.subjectId, channel: command.channel, destinationHash } }, transaction);
      await options.audit.record({ eventCode: command.consented ? "governance.channel_consent.opted_in" : "governance.channel_consent.opted_out", action: command.consented ? "opt_in" : "opt_out", outcome: "success", actor: { kind: "user", principalId: command.context.principalId }, tenantId: command.context.tenantId, entityType: "governance.channel_consent", entityId: command.subjectId, requestId: command.context.requestId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}), metadata: { eventId, channel: command.channel, destinationHash, sourceCode: command.sourceCode } }, transaction);
      return decision;
    });
  };
  return {
    record:write,
    revoke:(command)=>write({...command,consented:false}),
    checkAt(query,transaction){const repository=options.repositories.require(query.planeKey);const work=(tx:DbTransaction)=>{assertExactPlaneTransaction(tx,query.planeKey);const at=timestamp(query.at??(options.now?.()??new Date()).toISOString(),"at"),destinationHash=query.destination?hashDestination(query.channel,query.destination):undefined;return repository.findAt({tenantId:query.tenantId,subjectType:query.subjectType,subjectId:query.subjectId,channel:query.channel,...(destinationHash?{destinationHash}:{}),at},tx);};return transaction?work(transaction):options.transactions.run(query.planeKey,{tenantId:query.tenantId,principalId:query.subjectId},work);},
    history(query,transaction){const repository=options.repositories.require(query.planeKey);const destinationHash=query.destination?hashDestination(query.channel,query.destination):undefined;if(query.cursor&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.cursor))throw invalidCommand("Invalid consent history cursor");const work=(tx:DbTransaction)=>{assertExactPlaneTransaction(tx,query.planeKey);return repository.history({tenantId:query.tenantId,subjectType:query.subjectType,subjectId:query.subjectId,channel:query.channel,...(destinationHash?{destinationHash}:{}),...(query.at?{at:timestamp(query.at,"at")}:{ }),...(query.limit?{limit:query.limit}:{}),...(query.cursor?{cursor:query.cursor}:{})},tx);};return transaction?work(transaction):options.transactions.run(query.planeKey,{tenantId:query.tenantId,principalId:query.subjectId},work);},
  };
}

export function hashDestination(channel: string, destination: string): string {
  const normalized = channel === "email" ? destination.trim().toLowerCase() : channel === "push" ? destination.trim() : destination.replace(/[\s()+.-]/g, "");
  if (!normalized) throw invalidCommand("Consent destination cannot be empty");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
function validateCommand(command:RecordChannelConsentCommand):void{const effective=timestamp(command.effectiveAt??new Date().toISOString(),"effectiveAt");if(command.expiresAt&&timestamp(command.expiresAt,"expiresAt")<=effective)throw invalidCommand("Consent expiry must be after its effective time");if(!/^[a-z][a-z0-9_.-]{1,62}$/.test(command.sourceCode))throw invalidCommand("Invalid consent source code");if(!command.evidence||(typeof command.evidence==="object"&&!Array.isArray(command.evidence)))return;throw invalidCommand("Consent evidence must be an object");}
function timestamp(value:string,name:string):string{const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw invalidCommand(`Invalid consent ${name}`);return parsed.toISOString();}

function invalidCommand(message: string): Error { return Object.assign(new Error(message), { code: "GOVERNANCE_INVALID_COMMAND" }); }
