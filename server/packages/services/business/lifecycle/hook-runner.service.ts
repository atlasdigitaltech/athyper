/**
 * Lifecycle Hook Runner (review finding P0 fix)
 *
 * The seeds in 070z_p2p_transition_hooks.sql register one or more hook rows
 * per transition. Until this runner was built, those rows were dead data —
 * no runtime code read control.lifecycle_transition_hook and invoked the
 * registered actions. PO approve, receipt post, service_sheet post, and PI
 * post side effects were never firing from lifecycle transitions.
 *
 * What this runner does:
 *   Given a transition that just fired (BEFORE or AFTER), read the hook
 *   rows for that transition (ordered by sort_order within timing) and
 *   invoke the action handler for each row. Idempotency-guarded via
 *   control.lifecycle_transition_execution (claim/markCompleted).
 *
 * Handled actions:
 *   activity_log.write           — INSERT into log.activity_log; returns the
 *                                  new row id so subsequent handlers can link
 *                                  back to it (notably snapshot.capture)
 *   snapshot.capture             — call captureDocumentSnapshot with the
 *                                  audit_event_id from the prior handler
 *   transaction_flow.dispatch    — call dispatchTransactionFlow (Phase 5.3)
 *   workflow.start               — INSERT a document.workflow_request for the
 *                                  configured workflow_definition. The actual
 *                                  engine routing/assignment lives in
 *                                  svc-workflow; this hook only handshakes the
 *                                  request row so audit + admin UI can see the
 *                                  pending approval.
 *   notification.publish         — generic routing-rule notification publisher
 *
 * Unhandled actions: REQUIRED rows throw to fail the transition; optional
 * rows are logged-and-skipped. The previous behaviour (skip silently when
 * required) is wrong — a required hook with no handler means the contract
 * cannot be honoured, and the state mutation must not proceed.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  buildExecutionToken,
  claimHookExecution,
  markHookCompleted,
  markHookFailed,
} from "../ledger/idempotency.service.js";
import { dispatchTransactionFlow } from "../p2p/transaction-flow-dispatcher.service.js";
import {
  captureDocumentSnapshot,
  type GateEventKind,
} from "./snapshot-capture.service.js";
import { dispatchLifecycleNotification } from "./notification-dispatch.service.js";
import { emitOutboxEvent } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface RunLifecycleHooksCtx {
  tenantId:           string;
  transitionId:       string;
  sourceDocType:      string;
  sourceDocId:        string;
  principalId:        string;
  /** 'before' fires before the state mutation. 'after' fires after the row
   *  update but before the orchestrator commits. Required hooks at either
   *  timing veto the transaction by throwing. */
  timing:             "before" | "after";
  transitionEventSeq?: number;
  fromStatus?:        string;
  toStatus?:          string;
  operationCode?:     string;
  /** Modal/command inputs forwarded to business hooks inside the transaction. */
  operationPayload?:  Readonly<Record<string, unknown>>;
  strictRequired?:     boolean;
  logger?: {
    info?(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

export type HookOutcome =
  | { action: string; status: "ok"             }
  | { action: string; status: "alreadyDone"    }
  | { action: string; status: "skipped"; reason: string }
  | { action: string; status: "failed";  error: { code: string; message: string } };

export interface RunLifecycleHooksResult {
  ok:        boolean;
  outcomes:  HookOutcome[];
  executionToken: string;
}

interface HookRow {
  id:             string;
  action:         string;
  config:         Record<string, unknown> | null;
  sort_order:     number;
  safety_level:   string;
  contract_role:  string;
}

/**
 * Actions whose handlers manage their own
 * control.lifecycle_transition_execution row. The runner skips its own
 * outer claim for these so the (execution_token, hook_action_key) pair
 * is claimed exactly once — by the handler. Otherwise the runner would
 * grab the slot first and the handler's inner claim would always see it
 * as "already taken" and silently no-op.
 *
 * transaction_flow.dispatch is the canonical case: the dispatcher records
 * outcomes (templateMissing / unsupported / handlerFailed / ok /
 * alreadyDispatched) on its slot, which is more meaningful than the
 * generic mark-completed the runner would do.
 */
const HANDLER_OWNS_CLAIM: ReadonlySet<string> = new Set<string>([
  "transaction_flow.dispatch",
]);

/**
 * Reads hooks for the transition × timing and invokes each. Throws when any
 * BEFORE hook with safety_level='required' fails — the caller (the action
 * dispatcher) treats the throw as a veto and aborts the transition.
 *
 * Required failures at either timing throw out of this function. The lifecycle
 * orchestrator keeps both passes inside one transaction, so AFTER posting
 * failures roll back the status and all business side effects together.
 */
export async function runLifecycleHooks(
  db:  AnyDb,
  ctx: RunLifecycleHooksCtx,
): Promise<RunLifecycleHooksResult> {
  const executionToken = buildExecutionToken(
    ctx.transitionId, ctx.sourceDocId, ctx.transitionEventSeq ?? 1,
  );

  const hookRows = await sql<HookRow>`
    SELECT effective_hook_id AS id,
           action,
           config,
           sort_order,
           safety_level,
           contract_role
      FROM control.resolve_effective_lifecycle_hooks(
        ${ctx.tenantId}::uuid,
        ${ctx.transitionId}::uuid
      )
     WHERE timing = ${ctx.timing}::text
     ORDER BY sort_order ASC, effective_hook_id ASC
  `.execute(db);

  const outcomes: HookOutcome[] = [];
  let aggregateOk = true;

  // Threaded across hooks within this transition pass:
  //   recentActivityLogId — id of the activity_log row written by the
  //   activity_log.write handler (sort_order=10). Passed to subsequent
  //   handlers (notably snapshot.capture at sort_order=20) so the
  //   snapshot.document_snapshot row links back to its driving event.
  let recentActivityLogId: string | null = null;

  for (const row of hookRows.rows) {
    const config  = row.config ?? {};
    const isRequired = row.safety_level === "required";

    // Some actions own their claim internally so the same
    // (executionToken, hookActionKey) pair is not claimed twice.
    // transaction_flow.dispatch is the canonical case — the dispatcher
    // claims the slot itself and returns alreadyDispatched on duplicate
    // firings. Claiming it again here would race the dispatcher's own
    // claim and the dispatcher would always see "already taken".
    const handlerOwnsClaim = HANDLER_OWNS_CLAIM.has(row.action);

    let claimId: string | null = null;
    if (!handlerOwnsClaim) {
      const claim = await claimHookExecution(db, {
        tenantId:           ctx.tenantId,
        executionToken,
        hookActionKey:      row.action,
        transitionId:       ctx.transitionId,
        sourceDocType:      ctx.sourceDocType,
        sourceDocId:        ctx.sourceDocId,
        transitionEventSeq: ctx.transitionEventSeq,
        principalId:        ctx.principalId,
      });
      if (!claim) {
        outcomes.push({ action: row.action, status: "alreadyDone" });
        continue;
      }
      claimId = claim.id;
    }

    const startedAt = Date.now();
    try {
      switch (row.action) {
        case "activity_log.write":
          recentActivityLogId = await invokeActivityLogWrite(db, ctx);
          break;

        case "snapshot.capture": {
          // gate_event_kind comes from the hook config (one of the 7 sealed
          // values per the capture matrix). gate_event is the operation_code
          // of the firing transition.
          const kindRaw = String(config["gate_event_kind"] ?? "");
          if (!isGateEventKind(kindRaw)) {
            throw new Error(
              `snapshot.capture hook ${row.id} missing or invalid gate_event_kind in config (got '${kindRaw}')`,
            );
          }
          const captured = await captureDocumentSnapshot(db, {
            tenantId:       ctx.tenantId,
            entityType:     ctx.sourceDocType,
            entityId:       ctx.sourceDocId,
            gateEvent:      ctx.operationCode ?? "transition",
            gateEventKind:  kindRaw,
            activityLogId:  recentActivityLogId,
            capturedBy:     ctx.principalId,
            captureSource:  "transition_hook",
          });
          if (!captured.ok) {
            throw new Error(
              `${captured.error?.code ?? "SNAPSHOT_CAPTURE_FAILED"}: ${captured.error?.message ?? ""}`,
            );
          }
          break;
        }

        case "transaction_flow.dispatch": {
          // Dispatcher owns its claim — see HANDLER_OWNS_CLAIM above. No
          // outer claim was made, so we don't have a claimId to mark; the
          // dispatcher records the outcome on its own slot.
          const eventCode = String(config["event_code"] ?? "");
          const flowCode  = String(config["flow_code"]  ?? "");
          if (!eventCode || !flowCode) {
            throw new Error(
              `transaction_flow.dispatch hook ${row.id} missing event_code/flow_code in config`,
            );
          }
          const dispatched = await dispatchTransactionFlow(db, {
            tenantId:           ctx.tenantId,
            sourceDocType:      ctx.sourceDocType,
            sourceDocId:        ctx.sourceDocId,
            eventCode,
            flowCode,
            executionToken,
            transitionId:       ctx.transitionId,
            transitionEventSeq: ctx.transitionEventSeq,
            principalId:        ctx.principalId,
            operationPayload:   ctx.operationPayload,
          });
          switch (dispatched.kind) {
            case "ok":
              outcomes.push({ action: row.action, status: "ok" });
              break;
            case "alreadyDispatched":
              outcomes.push({ action: row.action, status: "alreadyDone" });
              break;
            case "templateMissing": {
              const reason = `No control.transaction_flow_template for (${eventCode}, ${flowCode}).`;
              if (isRequired) {
                warnRequiredHookSkipped(row.action, "TEMPLATE_MISSING_REQUIRED", reason, ctx);
                if (strictRequiredEnabled(ctx)) {
                  throw Object.assign(
                    new Error(`TEMPLATE_MISSING_REQUIRED: ${reason}`),
                    { code: "TEMPLATE_MISSING_REQUIRED" },
                  );
                }
              }
              outcomes.push({ action: row.action, status: "skipped", reason });
              break;
            }
            case "unsupported": {
              if (isRequired) {
                warnRequiredHookSkipped(row.action, "REQUIRED_HOOK_UNSUPPORTED", dispatched.reason, ctx);
                if (strictRequiredEnabled(ctx)) {
                  throw Object.assign(
                    new Error(`REQUIRED_HOOK_UNSUPPORTED: ${dispatched.reason}`),
                    { code: "REQUIRED_HOOK_UNSUPPORTED" },
                  );
                }
              }
              outcomes.push({
                action: row.action,
                status: "skipped",
                reason: dispatched.reason,
              });
              break;
            }
            case "handlerFailed":
              throw new Error(`${dispatched.error.code}: ${dispatched.error.message}`);
          }
          // Continue to next hook — outcome already pushed in the switch
          // above, no outer claimId to mark.
          continue;
        }

        case "workflow.start": {
          // Minimal Phase 6 handshake: open a document.workflow_request row
          // for the configured workflow_definition. svc-workflow owns step
          // assignment + approver resolution downstream; this hook only
          // ensures the request exists so the lifecycle gate has something
          // to wait on and the audit/admin UI sees a pending approval.
          await invokeWorkflowStart(db, ctx, config);
          break;
        }

        case "emit_event": {
          const publicEntityType = ctx.sourceDocType === "commitment" ? "purchase_order" : ctx.sourceDocType;
          const aggregateRootType = publicEntityType === "purchase_order" ? "commitment" : publicEntityType;
          const operation = (ctx.operationCode ?? "transition").toLowerCase().replace(/[^a-z0-9]+/g, "_");
          await emitOutboxEvent(db, {
            tenantId: ctx.tenantId,
            topic: `${publicEntityType}.lifecycle`,
            eventType: `${publicEntityType}.${operation}`,
            eventKey: `${publicEntityType}.${operation}:${ctx.sourceDocId}:${ctx.transitionId}:${ctx.transitionEventSeq ?? 1}`,
            entityType: publicEntityType,
            entityId: ctx.sourceDocId,
            aggregateType: aggregateRootType,
            aggregateId: ctx.sourceDocId,
            actorId: ctx.principalId,
            payload: {
              public_entity_type: publicEntityType,
              aggregate_root_type: aggregateRootType,
              commitment_type: publicEntityType === "purchase_order" ? "purchase_order" : null,
              aggregate_root_id: ctx.sourceDocId,
              profile_code: publicEntityType === "purchase_order" ? "po.standard" : null,
              profile_version: publicEntityType === "purchase_order" ? 1 : null,
              transition_id: ctx.transitionId,
              operation_code: ctx.operationCode ?? null,
              from_status: ctx.fromStatus ?? null,
              to_status: ctx.toStatus ?? null,
            },
          });
          break;
        }

        // Audit P1-S1: notification.publish writes into event.notification_message
        // via the routing-rule lookup. The hook is `narrowable` in every
        // platform seed, so a missing rule logs INFO and is recorded as
        // `skipped` — not a transition failure. Per-rule publish failures
        // (e.g. DB timeout on a single insert) are collected as outcome
        // failures so the transition still completes when other rules
        // succeed; one rule failing should never block a state change.
        case "notification.publish": {
          const dispatchResult = await dispatchLifecycleNotification(db, ctx, config);
          if (claimId) await markHookCompleted(db, claimId, undefined, Date.now() - startedAt);
          if (dispatchResult.skipped) {
            outcomes.push({
              action: row.action,
              status: "skipped",
              reason: `No notification_routing_rule matched (event=${ctx.sourceDocType}.lifecycle.changed).`,
            });
          } else if (dispatchResult.failures.length > 0 && dispatchResult.inserted === 0) {
            outcomes.push({
              action: row.action,
              status: "failed",
              error: {
                code:    "NOTIFICATION_PUBLISH_FAILED",
                message: dispatchResult.failures.join("; "),
              },
            });
          } else {
            outcomes.push({ action: row.action, status: "ok" });
          }
          continue;
        }

        default:
          // Unknown action — a required row with no handler means we cannot
          // honour the lifecycle contract. Throw so the catch below records
          // the failure outcome and (if required) aborts the transition.
          if (isRequired) {
            throw new Error(
              `Unknown required hook action '${row.action}' — no handler registered.`,
            );
          }
          if (claimId) await markHookCompleted(db, claimId, undefined, Date.now() - startedAt);
          outcomes.push({
            action: row.action,
            status: "skipped",
            reason: `Unknown action '${row.action}' — no handler registered.`,
          });
          continue;
      }

      if (claimId) await markHookCompleted(db, claimId, undefined, Date.now() - startedAt);
      outcomes.push({ action: row.action, status: "ok" });
    } catch (err) {
      const code    = err instanceof Error && "code" in err
        ? String((err as { code: unknown }).code)
        : "HOOK_HANDLER_FAILED";
      const message = err instanceof Error ? err.message : String(err);
      if (claimId) await markHookFailed(db, claimId, code, message, Date.now() - startedAt);
      const failedOutcome = { action: row.action, status: "failed", error: { code, message } } as const;
      outcomes.push(failedOutcome);

      if (isRequired) {
        ctx.logger?.warn("lifecycle_hook_outcome", {
          tenantId: ctx.tenantId,
          entity: ctx.sourceDocType,
          entityId: ctx.sourceDocId,
          transitionId: ctx.transitionId,
          executionToken,
          timing: ctx.timing,
          hookAction: row.action,
          hookOutcome: "failed",
          idempotencyReplay: false,
          errorCode: code,
        });
        aggregateOk = false;
        // Required hook failure aborts the transition regardless of timing:
        //   BEFORE  — throw vetoes the state mutation.
        //   AFTER   — throw aborts the open transaction wrapping the state
        //             change, rolling back the status update so the entity
        //             stays in its previous state. Posting side effects
        //             must be atomic with the status change; a posted
        //             record without its JE / gl_balance is unrecoverable
        //             at the audit layer.
        // Caveat: the markHookFailed write above lives in the same TX
        // and will also roll back. The action-dispatcher logs the failure
        // separately via its catch (action_dispatch_required_hook_failed)
        // so the gap is still observable in service logs. A future
        // autonomous-transaction pattern could persist the failure
        // outcome across the rollback for the audit table too.
        throw new Error(
          `${ctx.timing.toUpperCase()} hook ${row.action} failed (required): ${message}`,
        );
      }
    }
  }

  for (const outcome of outcomes) {
    const fields = {
      tenantId: ctx.tenantId,
      entity: ctx.sourceDocType,
      entityId: ctx.sourceDocId,
      transitionId: ctx.transitionId,
      executionToken,
      timing: ctx.timing,
      hookAction: outcome.action,
      hookOutcome: outcome.status,
      idempotencyReplay: outcome.status === "alreadyDone",
    };
    if (outcome.status === "failed") ctx.logger?.warn("lifecycle_hook_outcome", fields);
    else ctx.logger?.info?.("lifecycle_hook_outcome", fields);
  }
  return { ok: aggregateOk, outcomes, executionToken };
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler: activity_log.write
// ──────────────────────────────────────────────────────────────────────────────

async function invokeActivityLogWrite(
  db:  AnyDb,
  ctx: RunLifecycleHooksCtx,
): Promise<string | null> {
  const domain = activityDomainFor(ctx.sourceDocType);
  const activityType = `${ctx.sourceDocType}.${ctx.operationCode ?? "transition"}`;
  const detail = {
    transition_id:   ctx.transitionId,
    from_status:     ctx.fromStatus  ?? null,
    to_status:       ctx.toStatus    ?? null,
    operation_code:  ctx.operationCode ?? null,
    timing:          ctx.timing,
    public_entity_type: ctx.sourceDocType === "commitment" ? "purchase_order" : ctx.sourceDocType,
    aggregate_root_type: ctx.sourceDocType === "purchase_order" || ctx.sourceDocType === "commitment" ? "commitment" : ctx.sourceDocType,
    commitment_type: ctx.sourceDocType === "purchase_order" || ctx.sourceDocType === "commitment" ? "purchase_order" : null,
    aggregate_root_id: ctx.sourceDocId,
    profile_code: ctx.sourceDocType === "purchase_order" || ctx.sourceDocType === "commitment" ? "po.standard" : null,
    profile_version: ctx.sourceDocType === "purchase_order" || ctx.sourceDocType === "commitment" ? 1 : null,
  };

  const result = await sql<{ id: string }>`
    INSERT INTO log.activity_log (
      tenant_id, log_type, domain, activity_type,
      entity_type, entity_id,
      actor_id, actor_type,
      detail,
      created_by
    ) VALUES (
      ${ctx.tenantId}::uuid,
      'business'::shared.log_type_d,
      ${domain}::text,
      ${activityType}::text,
      ${ctx.sourceDocType}::text,
      ${ctx.sourceDocId}::uuid,
      ${ctx.principalId}::uuid,
      'principal'::text,
      ${JSON.stringify(detail)}::jsonb,
      ${ctx.principalId}::uuid
    )
    RETURNING id
  `.execute(db);
  return result.rows[0]?.id ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler: workflow.start
// ──────────────────────────────────────────────────────────────────────────────
//
// Minimal Phase 6 handshake. Reads workflow_definition_id (or workflow_-
// definition_code) from config, resolves the definition row, and INSERTs a
// document.workflow_request tied to (tenantId, entity_type, entity_id) with
// status='pending'. Idempotent: if a pending request already exists for
// this (entity_type, entity_id), we skip the insert and return — repeat
// submits land on the same open request.
//
// What this does NOT do: step assignment, approver resolution, template
// compilation. svc-workflow owns those downstream once it sees the new
// workflow_request row.

async function invokeWorkflowStart(
  db:     AnyDb,
  ctx:    RunLifecycleHooksCtx,
  config: Record<string, unknown>,
): Promise<void> {
  const defId   = config["workflow_definition_id"]   as string | undefined;
  const defCode = config["workflow_definition_code"] as string | undefined;

  if (!defId && !defCode) {
    throw new Error(
      `workflow.start hook missing workflow_definition_id / workflow_definition_code in config`,
    );
  }

  let resolvedDefId: string | null = defId ?? null;
  let resolvedWfType: string       = "approval";

  if (!resolvedDefId && defCode) {
    const def = await sql<{ id: string }>`
      SELECT id
        FROM control.workflow_definition
       WHERE code = ${defCode}::text
         AND (tenant_id IS NULL OR tenant_id = ${ctx.tenantId}::uuid)
         AND is_active = true
       ORDER BY tenant_id NULLS LAST
       LIMIT 1
    `.execute(db);
    resolvedDefId = def.rows[0]?.id ?? null;
    if (!resolvedDefId) {
      throw new Error(
        `workflow.start: workflow_definition '${defCode}' not found / inactive for tenant ${ctx.tenantId}`,
      );
    }
  }

  // Idempotency: if a pending request already exists for this entity, skip.
  // The hook may fire again on a retry of the same transition (e.g. the
  // outer claim was missed) and we do not want to create duplicate rows.
  const existing = await sql<{ id: string }>`
    SELECT id
      FROM document.workflow_request
     WHERE tenant_id   = ${ctx.tenantId}::uuid
       AND entity_type = ${ctx.sourceDocType}::text
       AND entity_id   = ${ctx.sourceDocId}::text
       AND status      = 'pending'
     LIMIT 1
  `.execute(db);
  if (existing.rows[0]) return;

  await sql`
    INSERT INTO document.workflow_request (
      tenant_id, workflow_type, workflow_definition_id,
      entity_type, entity_id,
      requested_by, status,
      metadata,
      created_by
    ) VALUES (
      ${ctx.tenantId}::uuid,
      ${resolvedWfType}::text,
      ${resolvedDefId}::uuid,
      ${ctx.sourceDocType}::text,
      ${ctx.sourceDocId}::text,
      ${ctx.principalId}::uuid,
      'pending'::text,
      ${JSON.stringify({
        transition_id:  ctx.transitionId,
        from_status:    ctx.fromStatus  ?? null,
        to_status:      ctx.toStatus    ?? null,
        operation_code: ctx.operationCode ?? null,
      })}::jsonb,
      ${ctx.principalId}::uuid
    )
  `.execute(db);
}

const VALID_GATE_EVENT_KINDS: ReadonlySet<string> = new Set<string>([
  "authoring_lock",
  "commitment",
  "fulfillment",
  "financial_post",
  "match_decision",
  "amendment_baseline",
  "reversal",
]);

function isGateEventKind(value: string): value is GateEventKind {
  return VALID_GATE_EVENT_KINDS.has(value);
}

function activityDomainFor(sourceDocType: string): string {
  // Map source doc types to the log.activity_domain values seeded for P2P.
  // Defaults to 'document' for any unknown type — keeps unfamiliar domains
  // routable even when the runner is invoked for a new entity.
  switch (sourceDocType) {
    case "purchase_requisition":
    case "commitment":
    case "purchase_order":
    case "purchase_order_confirmation":
    case "delivery_note":
    case "receipt":
    case "service_sheet":
    case "purchase_invoice":
      return "document";
    case "payment_entry":
      return "payment";
    case "journal_entry":
      return "accounting";
    default:
      return "document";
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Required-hook strictness (audit P0-S1)
// ──────────────────────────────────────────────────────────────────────────────
//
// Required hooks that resolve to `unsupported` or `templateMissing` were
// silently recorded as `skipped`, which lets critical financial gates pass
// without their side effects. Strict mode flips that into a thrown error
// inside the transition transaction, so the state mutation rolls back.
//
// Rollout: ship with the flag off, soak telemetry to confirm we're not
// blowing up any in-the-wild transitions, then flip on in staging → prod.
// The WARN log fires either way so the gap is observable before strictness
// becomes blocking.

function strictRequiredEnabled(ctx?: RunLifecycleHooksCtx): boolean {
  if (ctx?.strictRequired !== undefined) return ctx.strictRequired;
  const raw = process.env["LIFECYCLE_STRICT_REQUIRED"];
  if (raw === undefined) return false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "1" || normalised === "true" || normalised === "yes" || normalised === "on";
}

function warnRequiredHookSkipped(
  action: string,
  code:   string,
  reason: string,
  ctx:    RunLifecycleHooksCtx,
): void {
  // Structured single-line WARN — keeps log-grep + downstream alerting cheap
  // until we have a proper structured logger threaded through the runner.
  console.warn(
    `[lifecycle.hook.required_unsupported] action=${action} code=${code} ` +
    `entity=${ctx.sourceDocType} entity_id=${ctx.sourceDocId} ` +
    `transition=${ctx.transitionId} timing=${ctx.timing} ` +
    `from=${ctx.fromStatus ?? "<unknown>"} to=${ctx.toStatus ?? "<unknown>"} ` +
    `op=${ctx.operationCode ?? "<unknown>"} ` +
    `strict=${strictRequiredEnabled(ctx)} ` +
    `reason="${reason.replace(/"/g, "'")}"`,
  );
}
