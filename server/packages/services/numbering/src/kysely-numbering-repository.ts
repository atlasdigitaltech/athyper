import { formatNumber, NumberingError, type NumberingAllocationInput, type NumberingPolicy, type NumberingPreviewInput, type NumberingResult } from "@athyper/server-contract-numbering";
import { sql, type Transaction } from "kysely";
import type { NumberingRepository } from "./numbering-service.js";

type Tx = Transaction<Record<string, never>>;
type PolicyRow = { id:string;tenant_id:string|null;policy_code:string;policy_revision:number;format_template:string;sequence_width:number;pad_character:string;start_value:string|number;increment_by:number;maximum_value:string|number|null;scope_kind:NumberingPolicy["scopeKind"];reset_kind:NumberingPolicy["resetKind"];timezone_code:string|null };
type ReceiptRow = { allocation_id:string;numbering_policy_id:string;policy_code:string;policy_revision:number;formatted_number:string;allocated_value:string|number;following_value:string|number;scope_key:string;reset_bucket:string;policy_source:"tenant"|"global";allocated_at:Date|string };

export function createKyselyNumberingRepository(): NumberingRepository<Tx> {
  return {
    resolvePolicy,
    async allocate(transaction, input, policy) {
      const replay = await findReceipt(transaction,input.context.tenantId,input.allocationId);
      if(replay)return receipt(replay);
      const initial=formatNumber(policy,{nextValue:policy.startValue,occurredAt:input.occurredAt,tenantId:input.context.tenantId,scopeKey:input.scopeKey,fiscalYear:input.fiscalYear,contextFields:input.contextFields});
      await sql`INSERT INTO runtime_meta.entity_number_counter (tenant_id,numbering_policy_id,scope_key,reset_bucket,next_value,created_by)
        VALUES (${input.context.tenantId}::uuid,${policy.id}::uuid,${initial.scopeKey},${initial.resetBucket},${policy.startValue},${input.context.principalId}::uuid)
        ON CONFLICT ON CONSTRAINT entity_number_counter_partition_uq DO NOTHING`.execute(transaction);
      const locked=await sql<{id:string;next_value:string|number}>`SELECT id,next_value FROM runtime_meta.entity_number_counter
        WHERE tenant_id=${input.context.tenantId}::uuid AND numbering_policy_id=${policy.id}::uuid AND scope_key=${initial.scopeKey} AND reset_bucket=${initial.resetBucket} FOR UPDATE`.execute(transaction);
      const counter=locked.rows[0];if(!counter)throw new NumberingError("NUMBERING_COUNTER_NOT_FOUND","Numbering counter could not be locked",500);
      const afterLock=await findReceipt(transaction,input.context.tenantId,input.allocationId);if(afterLock)return receipt(afterLock);
      const result=formatNumber(policy,{nextValue:safeInteger(counter.next_value,"NUMBERING_COUNTER_VALUE_INVALID"),occurredAt:input.occurredAt,tenantId:input.context.tenantId,scopeKey:input.scopeKey,fiscalYear:input.fiscalYear,contextFields:input.contextFields});
      const advanced=await sql<{allocated_at:Date|string}>`UPDATE runtime_meta.entity_number_counter SET next_value=${result.followingValue},allocation_count=allocation_count+1,row_version=row_version+1,last_allocated_value=${result.allocatedValue},last_allocation_id=${input.allocationId}::uuid,last_allocated_at=clock_timestamp(),last_allocated_by=${input.context.principalId}::uuid,last_correlation_id=${input.correlationId??null}::uuid,updated_by=${input.context.principalId}::uuid WHERE id=${counter.id}::uuid RETURNING last_allocated_at AS allocated_at`.execute(transaction);
      const allocatedAt=advanced.rows[0]?.allocated_at;if(!allocatedAt)throw new NumberingError("NUMBERING_COUNTER_ADVANCE_FAILED","Numbering counter did not advance",500);
      await sql`INSERT INTO runtime_meta.entity_number_allocation (tenant_id,allocation_id,numbering_policy_id,counter_id,policy_code,policy_revision,policy_source,scope_key,reset_bucket,allocated_value,following_value,formatted_number,correlation_id,context,allocated_at,allocated_by)
        VALUES (${input.context.tenantId}::uuid,${input.allocationId}::uuid,${policy.id}::uuid,${counter.id}::uuid,${policy.policyCode},${policy.policyRevision},${policy.source},${result.scopeKey},${result.resetBucket},${result.allocatedValue},${result.followingValue},${result.formattedNumber},${input.correlationId??null}::uuid,${JSON.stringify({occurredAt:input.occurredAt,fiscalYear:input.fiscalYear,contextFields:input.contextFields})}::jsonb,${allocatedAt},${input.context.principalId}::uuid)`.execute(transaction);
      return {...result,allocationId:input.allocationId,idempotencySource:"fresh",allocatedAt:new Date(allocatedAt).toISOString()};
    },
  };
}

async function resolvePolicy(transaction:Tx,input:NumberingPreviewInput):Promise<NumberingPolicy|undefined>{const result=await sql<PolicyRow>`SELECT id,tenant_id,policy_code,policy_revision,format_template,sequence_width,pad_character,start_value,increment_by,maximum_value,scope_kind,reset_kind,timezone_code FROM control.numbering_policy WHERE policy_code=${input.policyCode} AND policy_revision=${input.policyRevision} AND status='active' AND (tenant_id=${input.context.tenantId}::uuid OR tenant_id IS NULL) ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1`.execute(transaction);const row=result.rows[0];if(!row)return undefined;return{id:row.id,policyCode:row.policy_code,policyRevision:row.policy_revision,formatTemplate:row.format_template,sequenceWidth:row.sequence_width,padCharacter:row.pad_character,startValue:safeInteger(row.start_value,"NUMBERING_POLICY_START_INVALID"),incrementBy:row.increment_by,...(row.maximum_value===null?{}:{maximumValue:safeInteger(row.maximum_value,"NUMBERING_POLICY_MAXIMUM_INVALID")}),scopeKind:row.scope_kind,resetKind:row.reset_kind,...(row.timezone_code?{timezoneCode:row.timezone_code}:{}),source:row.tenant_id?"tenant":"global"};}
async function findReceipt(transaction:Tx,tenantId:string,allocationId:string):Promise<ReceiptRow|undefined>{return(await sql<ReceiptRow>`SELECT allocation_id,numbering_policy_id,policy_code,policy_revision,formatted_number,allocated_value,following_value,scope_key,reset_bucket,policy_source,allocated_at FROM runtime_meta.entity_number_allocation WHERE tenant_id=${tenantId}::uuid AND allocation_id=${allocationId}::uuid LIMIT 1`.execute(transaction)).rows[0];}
function receipt(row:ReceiptRow):NumberingResult{return{allocationId:row.allocation_id,policyId:row.numbering_policy_id,policyCode:row.policy_code,policyRevision:row.policy_revision,formattedNumber:row.formatted_number,allocatedValue:safeInteger(row.allocated_value,"NUMBERING_RECEIPT_VALUE_INVALID"),followingValue:safeInteger(row.following_value,"NUMBERING_RECEIPT_VALUE_INVALID"),scopeKey:row.scope_key,resetBucket:row.reset_bucket,policySource:row.policy_source,idempotencySource:"replayed",allocatedAt:new Date(row.allocated_at).toISOString()};}
function safeInteger(value:string|number,code:string):number{const result=Number(value);if(!Number.isSafeInteger(result))throw new NumberingError(code,`${code} exceeds the safe integer range`,500);return result;}
