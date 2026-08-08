/**
 * Finance Setup — audit log helper.
 *
 * Writes canonical entries to audit.audit_log for every mutation performed
 * through the Finance Setup Workbench. context.domain='finance_setup';
 * context.activity_type is one of the finance_setup.* activity codes.
 *
 * The default helper never throws. Governed commands that require the audit
 * record to commit atomically use writeRequiredFinanceSetupAudit instead.
 */

import type { Kysely } from "kysely";
import { appendAuditEvent, appendRequiredAuditEvent } from "@athyper/svc-audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type FinanceSetupActivityType =
  | "finance_setup.control_assigned"
  | "finance_setup.control_updated"
  | "finance_setup.control_deactivated"
  | "finance_setup.controls_bulk_updated"
  | "finance_setup.chart_assignment_changed"
  | "finance_setup.book_assignment_changed"
  | "finance_setup.house_bank_toggled"
  | "finance_setup.fiscal_calendar_created"
  | "finance_setup.fiscal_calendar_updated"
  | "finance_setup.fiscal_calendar_assigned"
  | "finance_setup.fiscal_periods_generated"
  | "finance_setup.posting_role_map_assigned"
  | "finance_setup.posting_role_map_updated"
  | "finance_setup.posting_role_map_retired"
  | "finance_setup.fx_policy_saved"
  | "finance_setup.fx_tenant_policy_created"
  | "finance_setup.fx_policy_replaced"
  | "finance_setup.fx_policy_ended"
  | "finance_setup.fx_rate_created"
  | "finance_setup.fx_rate_replaced"
  | "finance_setup.fx_rates_imported"
  | "finance_setup.tax_group_version_saved"
  | "finance_setup.tax_registration_saved"
  | "finance_setup.wht_threshold_saved"
  | "finance_setup.payment_term_saved"
  | "finance_setup.payment_policy_saved"
  | "finance_setup.interface_binding_saved"
  | "finance_setup.settlement_rule_saved"
  | "finance_setup.house_bank_saved"
  | "finance_setup.bank_link_ended"
  | "finance_setup.bank_account_verified"
  | "finance_setup.bank_interface_tested";

export interface FinanceSetupAuditEntry {
  tenantId:       string;
  actorId:        string;
  companyCodeId?: string | null;
  activityType:   FinanceSetupActivityType;
  entityType:     string;                    // e.g. 'company_code_gl_account'
  entityId:       string | null;
  detail:         Record<string, unknown>;   // arbitrary jsonb
  correlationId?: string;
}

const AUDIT_LOGGER: { warn?: (msg: string, ctx: Record<string, unknown>) => void } = {};

export function setFinanceSetupAuditLogger(logger: (msg: string, ctx: Record<string, unknown>) => void): void {
  AUDIT_LOGGER.warn = logger;
}

export async function writeFinanceSetupAudit(
  db: AnyDb,
  entry: FinanceSetupAuditEntry,
): Promise<void> {
  try {
    await writeRequiredFinanceSetupAudit(db,entry);
  } catch (err) {
    AUDIT_LOGGER.warn?.("finance_setup_audit_failed", {
      err:           String(err),
      activity_type: entry.activityType,
      entity_id:     entry.entityId,
    });
  }
}

/** Use inside a command transaction when the mutation and its audit must commit together. */
export async function writeRequiredFinanceSetupAudit(
  db: AnyDb,
  entry: FinanceSetupAuditEntry,
): Promise<void> {
  await appendRequiredAuditEvent(db, {
    event_code:  "record.finance_setup_action",
    operation:   "update",
    entity_type: entry.entityType,
    entity_id:   entry.entityId ?? null,
    context: {
      domain:          "finance_setup",
      activity_type:   entry.activityType,
      company_code_id: entry.companyCodeId ?? null,
      ...entry.detail,
    },
    correlation_id: entry.correlationId ?? null,
  });
}
