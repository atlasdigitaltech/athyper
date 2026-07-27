/**
 * Lifecycle Notification Dispatcher (audit P1-S1)
 *
 * Replaces the no-op `notification.publish` handler that hook-runner used to
 * skip with a real publisher into event.notification_message.
 *
 * Flow:
 *   1. Compute event_type = config.event_type ?? `<sourceDocType>.lifecycle.changed`.
 *   2. Look up control.notification_routing_rule rows matching
 *      (tenant_id_in_scope, event_type, entity_type) where is_enabled=true.
 *      Tenant-specific rules win over platform-global ones; ties broken by
 *      sort_order ASC.
 *   3. For each matching rule, INSERT an event.notification_message row with
 *      a deterministic event_id so retries no-op.
 *   4. When no rule matches: log INFO and return { matched: 0, skipped: true }.
 *      The hook is `narrowable` in every seed, so a missing route is not an
 *      error — it just means no one signed up to be told.
 *
 * Idempotency: deterministic event_id =
 *   sha1(transition_id || ':' || source_doc_id || ':' || rule.code)
 * combined with a pre-INSERT existence check (no UNIQUE index on event_id
 * today, so we rely on the check-then-insert race window being small —
 * concurrent firings of the same transition are already gated by the
 * outer claimHookExecution slot in the hook-runner).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createHash } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface NotificationDispatchCtx {
  tenantId:        string;
  sourceDocType:   string;
  sourceDocId:     string;
  transitionId:    string;
  principalId:     string;
  fromStatus?:     string;
  toStatus?:       string;
  operationCode?:  string;
}

export interface NotificationDispatchResult {
  matched:    number;          // rules that matched and produced a message
  inserted:   number;          // freshly inserted messages
  skipped:    boolean;         // true when matched=0 (no rule)
  failures:   string[];        // per-rule error messages (publish never throws)
}

interface RoutingRule {
  id:                 string;
  code:               string;
  template_key:       string;
  channels:           string[];
  priority:           string;
  recipient_rules:    Record<string, unknown> | null;
  sort_order:         number;
  tenant_id:          string | null;
}

export async function dispatchLifecycleNotification(
  db:     AnyDb,
  ctx:    NotificationDispatchCtx,
  config: Record<string, unknown>,
): Promise<NotificationDispatchResult> {
  const eventType =
    asString(config["event_type"]) ?? `${ctx.sourceDocType}.lifecycle.changed`;

  const rules = await loadRoutingRules(db, ctx.tenantId, eventType, ctx.sourceDocType, ctx.toStatus);

  if (rules.length === 0) {
    console.info(
      `[notification.template.unmatched] event_type=${eventType} ` +
      `entity_type=${ctx.sourceDocType} entity_id=${ctx.sourceDocId} ` +
      `tenant=${ctx.tenantId} to_status=${ctx.toStatus ?? "<unknown>"}`,
    );
    return { matched: 0, inserted: 0, skipped: true, failures: [] };
  }

  const payloadBase = {
    source_doc_type: ctx.sourceDocType,
    source_doc_id:   ctx.sourceDocId,
    transition_id:   ctx.transitionId,
    from_status:     ctx.fromStatus  ?? null,
    to_status:       ctx.toStatus    ?? null,
    operation_code:  ctx.operationCode ?? null,
    actor_id:        ctx.principalId,
  };

  let inserted = 0;
  const failures: string[] = [];

  for (const rule of rules) {
    const eventId = buildEventId(ctx.transitionId, ctx.sourceDocId, rule.code);

    try {
      // Idempotency check first (no UNIQUE on event_id today).
      const existing = await sql<{ id: string }>`
        SELECT id
          FROM event.notification_message
         WHERE tenant_id = ${ctx.tenantId}::uuid
           AND event_id  = ${eventId}::text
         LIMIT 1
      `.execute(db);
      if (existing.rows.length > 0) continue;

      const payload = {
        ...payloadBase,
        rule_code:        rule.code,
        recipient_rules:  rule.recipient_rules ?? {},
      };

      await sql`
        INSERT INTO event.notification_message (
          tenant_id, plane_key, event_id, event_code, rule_id,
          entity_type, entity_id,
          template_key, template_version,
          payload, priority, channels,
          status, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          'neon',
          ${eventId}::text,
          ${eventType}::text,
          ${rule.id}::uuid,
          ${ctx.sourceDocType}::text,
          ${ctx.sourceDocId}::uuid,
          ${rule.template_key}::text,
          1::smallint,
          ${JSON.stringify(payload)}::jsonb,
          ${rule.priority}::text,
          ${rule.channels}::text[],
          'pending'::text,
          ${ctx.principalId}::uuid
        )
      `.execute(db);
      inserted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`rule=${rule.code}: ${message}`);
    }
  }

  return {
    matched:  rules.length,
    inserted,
    skipped:  false,
    failures,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function loadRoutingRules(
  db:         AnyDb,
  tenantId:   string,
  eventType:  string,
  entityType: string,
  toStatus:   string | undefined,
): Promise<RoutingRule[]> {
  // Tenant override wins via ORDER BY tenant_id NULLS LAST. The lifecycle_state
  // filter is permissive: a NULL on the rule matches every transition.
  const result = await sql<RoutingRule>`
    SELECT id, code, template_key, channels, priority, recipient_rules,
           sort_order, tenant_id
      FROM control.notification_routing_rule
     WHERE event_type = ${eventType}::text
       AND (entity_type IS NULL OR entity_type = ${entityType}::text)
       AND (lifecycle_state IS NULL OR lifecycle_state = ${toStatus ?? null}::text)
       AND is_enabled = true
       AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
     ORDER BY tenant_id NULLS LAST, sort_order ASC, code ASC
  `.execute(db);
  return result.rows;
}

function buildEventId(transitionId: string, sourceDocId: string, ruleCode: string): string {
  return createHash("sha1")
    .update(`${transitionId}:${sourceDocId}:${ruleCode}`)
    .digest("hex");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
