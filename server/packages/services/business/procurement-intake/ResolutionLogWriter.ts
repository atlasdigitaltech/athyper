/**
 * ResolutionLogWriter — inserts rows into log.resolution_log for each
 * pipeline step (CONTEXT, INTENT, PROFILE).
 *
 * log.resolution_log is append-only (immutability trigger blocks UPDATE/DELETE).
 * Each pipeline run produces exactly 3 rows keyed by (pipeline_id, txn_id).
 *
 * Uses raw sql`` template to stay consistent with existing ap service pattern.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ContextLogArgs {
  pipelineId:    string;
  txnId:         string;
  tenantId:      string;
  principalId:   string;
  direction:     string;
  flowCode:      string | null;
  companyCodeId: string | null;
  docType:       string | null;
  amount:        number | null;
  currencyCode:  string | null;
  isCrossBorder: boolean;
  isIntercompany: boolean;
}

export interface IntentLogArgs {
  pipelineId:      string;
  txnId:           string;
  tenantId:        string;
  principalId:     string;
  classificationSource: string;
  classificationId:     string | null;
  resolvedIntentId:     string | null;
  resolvedDomain:       string | null;
  method:               string;
  ruleId:               string | null;
  confidence:           number;
  explanation:          string | null;
  rulesEvaluated:       number;
}

export interface ProfileLogArgs {
  pipelineId:           string;
  txnId:                string;
  tenantId:             string;
  principalId:          string;
  resolvedProfileConfigId: string | null;
  method:               string;
  ruleId:               string | null;
  confidence:           number;
  explanation:          string | null;
}

export async function writeContextLog(db: AnyDb, args: ContextLogArgs): Promise<void> {
  await sql`
    INSERT INTO log.resolution_log (
      tenant_id, pipeline_id, txn_id, resolution_step,
      direction, flow_code, company_code_id, doc_type,
      amount, currency_code, is_cross_border, is_intercompany,
      resolution_method, confidence, created_by
    ) VALUES (
      ${args.tenantId}::uuid, ${args.pipelineId}::uuid, ${args.txnId}::uuid,
      'CONTEXT',
      ${args.direction}, ${args.flowCode}, ${args.companyCodeId}::uuid,
      ${args.docType},
      ${args.amount}, ${args.currencyCode},
      ${args.isCrossBorder}, ${args.isIntercompany},
      'CONTEXT_SNAPSHOT', NULL,
      ${args.principalId}::uuid
    )
  `.execute(db);
}

export async function writeIntentLog(db: AnyDb, args: IntentLogArgs): Promise<void> {
  await sql`
    INSERT INTO log.resolution_log (
      tenant_id, pipeline_id, txn_id, resolution_step,
      direction,
      classification_source, classification_id,
      resolved_intent_id, resolved_domain,
      resolution_method, matched_rule_id,
      confidence, explanation, rules_evaluated, created_by
    ) VALUES (
      ${args.tenantId}::uuid, ${args.pipelineId}::uuid, ${args.txnId}::uuid,
      'INTENT',
      'INBOUND',
      ${args.classificationSource}, ${args.classificationId}::uuid,
      ${args.resolvedIntentId}::uuid, ${args.resolvedDomain},
      ${args.method}, ${args.ruleId}::uuid,
      ${args.confidence}, ${args.explanation},
      ${args.rulesEvaluated},
      ${args.principalId}::uuid
    )
  `.execute(db);
}

export async function writeProfileLog(db: AnyDb, args: ProfileLogArgs): Promise<void> {
  await sql`
    INSERT INTO log.resolution_log (
      tenant_id, pipeline_id, txn_id, resolution_step,
      direction,
      resolved_profile_config_id,
      resolution_method, matched_rule_id,
      confidence, explanation, created_by
    ) VALUES (
      ${args.tenantId}::uuid, ${args.pipelineId}::uuid, ${args.txnId}::uuid,
      'PROFILE',
      'INBOUND',
      ${args.resolvedProfileConfigId}::uuid,
      ${args.method}, ${args.ruleId}::uuid,
      ${args.confidence}, ${args.explanation},
      ${args.principalId}::uuid
    )
  `.execute(db);
}
