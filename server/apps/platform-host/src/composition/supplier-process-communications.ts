import { createHash, randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { ChannelConsentService } from "@athyper/server-contract-governance";
import type { NotificationSourceEvent } from "@athyper/server-contract-notifications";
import type { NotificationAttachmentAccessPolicy } from "@athyper/server-contract-documents";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import type {
  ClaimedNotificationDelivery,
  NotificationPlanningPolicy,
} from "@athyper/server-platform-notifications";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, any>;
const SCHEMA = "athyper.supplier-communication/1";
const PREFIX = "supplier.onboarding.notice.";
const text = (x: unknown): string | undefined =>
  typeof x === "string" && x.length > 0 ? x : undefined;
const object = (x: unknown): Row =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Row) : {};
const uuid = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
const hash = (x: string) => createHash("sha256").update(x).digest("hex");

/** Canonical committed events feed the existing planner. This adapter never changes business outcomes. */
export function createSupplierProcessCommunications(options: {
  transactions: PlaneTransactionCoordinator<Tx>;
  authorizer: Authorizer;
  consent: ChannelConsentService<Tx>;
  authorizeArtifact(
    context: VerifiedRequestContext,
    attachmentVersionId: string,
    transaction: Tx,
  ): Promise<void>;
}) {
  async function configuration(
    tenantId: string,
    tx: Tx,
  ): Promise<Row | undefined> {
    return (
      await sql<Row>`SELECT * FROM control.supplier_communication_policy WHERE tenant_id=${tenantId}::uuid AND enabled=true`.execute(
        tx,
      )
    ).rows[0];
  }
  async function context(
    tenantId: string,
    principalId: string,
    tx: Tx,
  ): Promise<VerifiedRequestContext | null> {
    const principal = (
      await sql<Row>`SELECT auth_epoch FROM master.principal WHERE tenant_id=${tenantId}::uuid AND id=${principalId}::uuid AND status='active'`.execute(
        tx,
      )
    ).rows[0];
    if (!principal) return null;
    const identity = {
      tenantId,
      principalId,
      planeKey: "neon" as const,
      realmKey: "athyper",
      authEpoch: Number(principal.auth_epoch),
      assurance: "baseline" as const,
    };
    const permissions = await createKyselyPermissionResolver({
      run: (_identity, work) => work(tx),
    }).resolve(identity);
    return {
      ...identity,
      permissions,
      profileHash: permissions.profileHash,
      requestId: randomUUID(),
    };
  }
  async function attempt(
    tenantId: string,
    attemptId: string,
    tx: Tx,
  ): Promise<Row | undefined> {
    return (
      await sql<Row>`SELECT a.*,c.case_code,c.status case_status,c.created_by requester,c.decision_snapshot_id,c.result_snapshot_id,r.status run_status,r.owner_principal_id,e.evidence->'coordinate'->'scope' scope,
      a.attempt_number=(SELECT max(current.attempt_number) FROM governance.process_attempt current WHERE current.tenant_id=a.tenant_id AND current.case_id=a.case_id) current_attempt
      FROM governance.process_attempt a JOIN document.entity_case c ON c.tenant_id=a.tenant_id AND c.id=a.case_id JOIN governance.cycle_run r ON r.tenant_id=a.tenant_id AND r.id=a.cycle_run_id JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id
      WHERE a.tenant_id=${tenantId}::uuid AND a.id=${attemptId}::uuid`.execute(
        tx,
      )
    ).rows[0];
  }
  async function task(
    tenantId: string,
    id: string,
    tx: Tx,
  ): Promise<Row | undefined> {
    return (
      await sql<Row>`SELECT i.*,s.status stage_status FROM document.work_item i JOIN document.workflow_stage s ON s.tenant_id=i.tenant_id AND s.id=(i.payload->>'workflowStageId')::uuid WHERE i.tenant_id=${tenantId}::uuid AND i.id=${id}::uuid AND i.payload ? 'attemptId'`.execute(
        tx,
      )
    ).rows[0];
  }
  async function interaction(tenantId: string, milestone: string, id: unknown, item: Row, tx: Tx): Promise<string | undefined> {
    if (!uuid(id) || !["open", "claimed"].includes(item.status) || item.stage_status !== "active") return undefined;
    if (["information_requested", "information_escalated", "information_answered"].includes(milestone)) {
      const exchange = (await sql<Row>`SELECT * FROM document.process_task_information WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND work_item_id=${item.id}::uuid AND attempt_id=${item.payload.attemptId}::uuid`.execute(tx)).rows[0];
      if (!exchange) return undefined;
      if (milestone === "information_escalated" && exchange.state === "open" && exchange.escalated_at && exchange.escalated_to) {
        const eligible=(await sql`SELECT 1 FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id
          CROSS JOIN LATERAL jsonb_array_elements(e.evidence->'executionManifest'->'tasks') binding
          CROSS JOIN LATERAL document.process_case_reviewers(a.tenant_id,a.case_id,binding->'informationPolicy'->>'overdueSupervisorRole') r
          WHERE a.tenant_id=${tenantId}::uuid AND a.id=${exchange.attempt_id}::uuid AND binding->>'taskTemplateId'=${item.payload.taskTemplateId}
            AND binding->'informationPolicy'->>'overdueSupervisorRole' IS NOT NULL AND r.principal_id=${exchange.escalated_to}::uuid AND r.principal_id<>${exchange.respondent_id}::uuid`.execute(tx)).rows.length;
        if(eligible)return exchange.escalated_to;
      }
      if (milestone === "information_requested" && exchange.state === "open") return exchange.respondent_id;
      if (milestone === "information_answered" && exchange.state === "answered" && exchange.requested_by === item.assignee_principal_id) return exchange.requested_by;
    } else if (milestone === "supervisor") {
      const history = (await sql<Row>`SELECT * FROM document.process_task_assignment_history WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND attempt_id=${item.payload.attemptId}::uuid AND COALESCE(replacement_work_item_id,previous_work_item_id)=${item.id}::uuid`.execute(tx)).rows[0];
      if (history && (history.mode === "notify" || history.supervisor_id === item.assignee_principal_id)) return history.supervisor_id;
    }
    return undefined;
  }
  async function document(
    tenantId: string,
    id: string,
    tx: Tx,
  ): Promise<Row | undefined> {
    return (
      await sql<Row>`SELECT * FROM governance.process_document_job WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(
        tx,
      )
    ).rows[0];
  }
  async function eligible(
    tenantId: string,
    principalId: string,
    pin: Row,
    tx: Tx,
  ): Promise<boolean> {
    if (pin.schema !== SCHEMA || !uuid(pin.attemptId) || !uuid(pin.caseId))
      return false;
    const config = await configuration(tenantId, tx);
    if (!config) return false;
    const a = await attempt(tenantId, pin.attemptId, tx);
    if (
      !a ||
      !a.current_attempt ||
      a.case_id !== pin.caseId ||
      a.selection_id !== pin.selectionId ||
      a.cycle_run_id !== pin.cycleRunId
    )
      return false;
    const c = await context(tenantId, principalId, tx);
    if (!c) return false;
    const permission = await options.authorizer.authorize({
      context: c,
      permissionCode: "neon.relationship.entity_case.read",
      resource: {
        tenantId,
        entityCode: "entity_case",
        resourceCode: "entity_case",
        recordId: a.case_id,
        authorizationTarget: "existing",
        ...a.scope,
      },
    });
    if (!permission.allowed) return false;
    if (["information_requested", "information_escalated", "information_answered", "supervisor"].includes(pin.milestone)) {
      if (!uuid(pin.workItemId) || !["submitted", "in_review"].includes(a.case_status) || a.run_status !== "running") return false;
      const item = await task(tenantId, pin.workItemId, tx);
      if (!item || item.payload.attemptId !== a.id || item.payload.workflowStageId !== pin.stageId ||
          await interaction(tenantId, pin.milestone, pin.interactionId, item, tx) !== principalId) return false;
      if (pin.milestone !== "information_requested") {
        const reviewers = (await sql`SELECT 1 FROM document.process_case_reviewers(${tenantId}::uuid,${a.case_id}::uuid,NULL) WHERE principal_id=${principalId}::uuid`.execute(tx)).rows;
        if (!reviewers.length) return false;
      }
    } else if (["assignment", "reminder", "escalation"].includes(pin.milestone)) {
      if (
        !uuid(pin.workItemId) ||
        !["submitted", "in_review"].includes(a.case_status) ||
        a.run_status !== "running"
      )
        return false;
      const item = await task(tenantId, pin.workItemId, tx);
      if (
        !item ||
        !["open", "claimed"].includes(item.status) ||
        item.stage_status !== "active" ||
        item.payload.attemptId !== a.id ||
        item.payload.workflowStageId !== pin.stageId
      )
        return false;
      if (["assignment", "reminder"].includes(pin.milestone) && (await sql`SELECT 1 FROM document.process_task_information WHERE tenant_id=${tenantId}::uuid AND work_item_id=${item.id}::uuid AND kind='clarification' AND state IN ('open','answered')`.execute(tx)).rows.length) return false;
      const escalationRecipient =
        pin.milestone === "escalation"
          ? text(item.payload.sla_breach?.escalatedTo)
          : undefined;
      if ((escalationRecipient ?? item.assignee_principal_id) !== principalId)
        return false;
      if (escalationRecipient) return true; // Attention only; never changes the voting assignment.
      const reviewers = (
        await sql`SELECT 1 FROM document.process_case_reviewers(${tenantId}::uuid,${a.case_id}::uuid,NULL) WHERE principal_id=${principalId}::uuid`.execute(
          tx,
        )
      ).rows;
      if (!reviewers.length) return false;
    } else if (pin.milestone === "attention") {
      if (principalId !== config.operational_owner_principal_id) return false;
      if (
        pin.failedMessageId &&
        (!uuid(pin.failedMessageId) ||
          !(
            await sql`SELECT 1 FROM event.notification_delivery WHERE tenant_id=${tenantId}::uuid AND message_id=${pin.failedMessageId}::uuid AND status='failed'`.execute(
              tx,
            )
          ).rows.length)
      )
        return false;
      if (pin.failedDocumentJobId) {
        const failed = uuid(pin.failedDocumentJobId)
          ? await document(tenantId, pin.failedDocumentJobId, tx)
          : undefined;
        if (
          !failed ||
          (failed.status !== "failed" && failed.gate_status !== "failed")
        )
          return false;
      }
    } else if (
      principalId !== a.requester &&
      principalId !== a.owner_principal_id
    )
      return false;
    if (pin.milestone === "returned" && a.case_status !== "draft") return false;
    if (
      pin.milestone === "submitted" &&
      ["cancelled", "rejected"].includes(a.case_status)
    )
      return false;
    if (
      pin.milestone === "decision" &&
      !["approved", "rejected", "materializing", "materialized"].includes(
        a.case_status,
      )
    )
      return false;
    if (pin.milestone === "activation" && a.case_status !== "materialized")
      return false;
    if (pin.documentJobId) {
      if (!uuid(pin.documentJobId)) return false;
      const job = await document(tenantId, pin.documentJobId, tx);
      if (
        !job ||
        job.attempt_id !== a.id ||
        job.status !== "ready" ||
        job.result?.attachmentVersionId !== pin.attachmentVersionId ||
        job.intent?.sourceSnapshot?.id !== pin.sourceSnapshotId
      )
        return false;
      const source =
        job.purpose === "decision_document"
          ? a.decision_snapshot_id
          : job.purpose === "activation_confirmation"
            ? a.result_snapshot_id
            : a.submission_snapshot_id;
      if (source !== pin.sourceSnapshotId) return false;
      try {
        await options.authorizeArtifact(c, pin.attachmentVersionId, tx);
      } catch {
        return false;
      }
    }
    return true;
  }
  const policy: NotificationPlanningPolicy = {
    async forRecipient(source, principalId, tx, work) {
      if (object(source.payload.communication).schema !== SCHEMA) return work();
      const previous =
        (
          await sql<{
            principal: string;
          }>`SELECT current_setting('app.current_principal_id',true) principal`.execute(
            tx,
          )
        ).rows[0]?.principal ?? "";
      await sql`SELECT set_config('app.current_principal_id',${principalId},true)`.execute(
        tx,
      );
      try {
        await work();
      } finally {
        await sql`SELECT set_config('app.current_principal_id',${previous},true)`.execute(
          tx,
        );
      }
    },
    immediate(source) {
      return object(source.payload.communication).schema === SCHEMA;
    },
    async prepare(source, tx) {
      if (source.planeKey !== "neon") return source;
      const config = await configuration(source.tenantId, tx);
      if (!config) return source;
      const origin = new URL(config.public_origin);
      const payload = object(source.payload),
        coordinate = object(payload.coordinate);
      if (source.eventCode.startsWith(PREFIX)) {
        if (
          source.eventCode !== PREFIX + "attention" ||
          object(payload.communication).schema !== SCHEMA ||
          !uuid(payload.failedMessageId)
        )
          return null;
        const pin = object(payload.communication);
        if (!uuid(pin.attemptId)) return null;
        const current = await attempt(source.tenantId, pin.attemptId, tx);
        if (!current?.current_attempt) return null;
        const failed = (
          await sql`SELECT 1 FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id WHERE m.tenant_id=${source.tenantId}::uuid AND m.id=${payload.failedMessageId}::uuid AND m.entity_id=${current.case_id}::uuid AND m.payload->'communication'->>'attemptId'=${current.id} AND d.status='failed'`.execute(
            tx,
          )
        ).rows.length;
        if (!failed) return null;
        const link = new URL(
          `/mdg/business-partner/requests/${current.case_id}`,
          origin,
        );
        link.searchParams.set("attemptId", current.id);
        const recipients = [config.operational_owner_principal_id];
        return {
          ...source,
          entityType: "business_partner_case",
          entityId: current.case_id,
          recipientPrincipalIds: recipients,
          attachments: undefined,
          payload: {
            communication: {
              schema: SCHEMA,
              milestone: "attention",
              caseId: current.case_id,
              attemptId: current.id,
              cycleRunId: current.cycle_run_id,
              selectionId: current.selection_id,
              failedMessageId: payload.failedMessageId,
            },
            caseNo: current.case_code,
            status: current.case_status,
            caseUrl: link.toString(),
            milestone: "attention",
            recipient_principal_ids: recipients,
          },
        };
      }
      const workItemId = uuid(payload.work_item_id)
        ? payload.work_item_id
        : source.entityType === "workflow.work_item" && uuid(source.entityId)
          ? source.entityId
          : undefined;
      const item = workItemId
        ? await task(source.tenantId, workItemId, tx)
        : undefined;
      const jobId = uuid(payload.jobId) ? payload.jobId : undefined;
      const job = jobId
        ? await document(source.tenantId, jobId, tx)
        : undefined;
      let attemptId =
        text(item?.payload?.attemptId) ??
        text(job?.attempt_id) ??
        text(coordinate.attemptId);
      const caseId =
        text(payload.caseId) ??
        text(payload.case_id) ??
        ([
          "document.entity_case",
          "business_partner_case",
          "entity_case",
        ].includes(source.entityType ?? "")
          ? source.entityId
          : undefined);
      if (!attemptId && uuid(caseId)) {
        const selected = (
          await sql<Row>`SELECT a.id FROM governance.process_attempt a WHERE a.tenant_id=${source.tenantId}::uuid AND a.case_id=${caseId}::uuid AND a.created_at<=COALESCE((SELECT created_at FROM event.outbox WHERE tenant_id=${source.tenantId}::uuid AND id=${uuid(source.id) ? source.id : null}::uuid),${source.occurredAt ?? new Date().toISOString()}::timestamptz) ORDER BY a.attempt_number DESC LIMIT 1`.execute(
            tx,
          )
        ).rows[0];
        attemptId = selected?.id;
      }
      if (!uuid(attemptId)) return source;
      const a = await attempt(source.tenantId, attemptId, tx);
      if (!a) return source;
      if (
        source.occurredAt &&
        Date.parse(source.occurredAt) < new Date(config.enabled_from).getTime()
      )
        return null;
      // Generic BP/assignment events for a selected run have exactly one canonical source below.
      let milestone: string | undefined;
      if (source.eventCode === "entity.case.submitted") milestone = "submitted";
      else if (source.eventCode === "workflow.work_item.created" && item)
        milestone = "assignment";
      else if (source.eventCode === "workflow.work_item.reminder" && item)
        milestone = "reminder";
      else if (
        [
          "workflow.work_item.escalated",
          "workflow.work_item.sla_breached",
        ].includes(source.eventCode) &&
        item
      )
        milestone = "escalation";
      else if (source.eventCode === "workflow.task.information_request" && item) milestone = "information_requested";
      else if (source.eventCode === "workflow.task.information_escalate" && item) milestone = "information_escalated";
      else if (source.eventCode === "workflow.task.information_respond" && item) milestone = "information_answered";
      else if (source.eventCode === "workflow.task.supervisor_escalated" && item) milestone = "supervisor";
      else if (source.eventCode === "entity.case.return")
        milestone = "returned";
      else if (
        source.eventCode === "process.document.ready" &&
        job?.purpose === "decision_document"
      )
        milestone = "decision";
      else if (
        source.eventCode === "process.document.ready" &&
        job?.purpose === "activation_confirmation"
      )
        milestone = "activation";
      else if (
        source.eventCode === "process.document.failed" &&
        job &&
        (job.attempt_count >= 5 || job.result?.retryable === false)
      )
        milestone = "attention";
      if (
        source.eventCode === "process.document.gate_failed" &&
        job?.gate_status === "failed" &&
        Number(payload.failureCount) >= 5
      )
        milestone = "attention";
      if (!milestone || !a.current_attempt) return null;
      const pin: Row = {
        schema: SCHEMA,
        milestone,
        caseId: a.case_id,
        attemptId: a.id,
        cycleRunId: a.cycle_run_id,
        selectionId: a.selection_id,
      };
      if (item)
        Object.assign(pin, {
          workItemId: item.id,
          stageId: item.payload.workflowStageId,
          cycleTaskId: item.cycle_task_id,
        });
      if (job && milestone === "attention") pin.failedDocumentJobId = job.id;
      if (job && milestone !== "attention")
        Object.assign(pin, {
          documentJobId: job.id,
          attachmentVersionId: job.result?.attachmentVersionId,
          sourceSnapshotId: job.intent?.sourceSnapshot?.id,
        });
      const interactionId = milestone === "supervisor" ? payload.history_id : payload.information_id;
      const isInteraction = ["information_requested", "information_escalated", "information_answered", "supervisor"].includes(milestone);
      const interactionRecipient = isInteraction && item ? await interaction(source.tenantId, milestone, interactionId, item, tx) : undefined;
      if (isInteraction && !interactionRecipient) return null;
      if (isInteraction) pin.interactionId = interactionId;
      const candidates = interactionRecipient ? [interactionRecipient] : item
        ? [
            milestone === "escalation"
              ? (text(item.payload.sla_breach?.escalatedTo) ??
                item.assignee_principal_id)
              : item.assignee_principal_id,
          ]
        : milestone === "attention"
          ? [config.operational_owner_principal_id]
          : milestone === "submitted" || milestone === "returned"
            ? [a.requester]
            : [a.requester, a.owner_principal_id];
      const recipientPrincipalIds = [...new Set(candidates.filter(uuid))];
      const key = [
        a.id,
        milestone,
        isInteraction ? interactionId : item?.id ?? job?.id ?? "",
        milestone === "reminder" ? (payload.reminder_at ?? source.id) : "",
      ].join(":");
      const link = new URL(
        `/mdg/business-partner/requests/${a.case_id}`,
        origin,
      );
      link.searchParams.set("attemptId", a.id);
      if (item) link.searchParams.set("workItemId", item.id);
      if (job) link.searchParams.set("documentJobId", job.id);
      return {
        ...source,
        id: `supplier-communication:${hash(key)}`,
        eventCode: PREFIX + milestone,
        entityType: "business_partner_case",
        entityId: a.case_id,
        recipientPrincipalIds,
        attachments: undefined,
        payload: {
          communication: pin,
          caseNo: a.case_code,
          status:
            milestone === "decision"
              ? a.case_status === "rejected"
                ? "rejected"
                : "approved"
              : a.case_status,
          caseUrl: link.toString(),
          milestone,
          originalOutboxId: source.id,
          recipient_principal_ids: recipientPrincipalIds,
        },
      };
    },
    async authorizeRecipient(source, principalId, _channel, tx) {
      return object(source.payload.communication).schema === SCHEMA
        ? eligible(
            source.tenantId,
            principalId,
            object(source.payload.communication),
            tx,
          )
        : true;
    },
  };
  return {
    policy,
    async authorizeDelivery(delivery: ClaimedNotificationDelivery) {
      const data = object(delivery.payload.data),
        pin = object(data.communication ?? delivery.payload.communication);
      if (pin.schema !== SCHEMA) return { allowed: true };
      return options.transactions.run(
        delivery.planeKey,
        { tenantId: delivery.tenantId, principalId: delivery.principalId },
        async (tx) => {
          if (
            !(await eligible(delivery.tenantId, delivery.principalId, pin, tx))
          )
            return {
              allowed: false,
              reason: "SUPPLIER_NOTICE_STALE_OR_UNAUTHORIZED",
            };
          const eventCode = PREFIX + pin.milestone;
          const preference = (
            await sql<Row>`SELECT is_enabled FROM master.principal_notification_preference WHERE tenant_id=${delivery.tenantId}::uuid AND principal_id=${delivery.principalId}::uuid AND event_code=${eventCode} AND channel=${delivery.channel} AND status='active' LIMIT 1`.execute(
              tx,
            )
          ).rows[0];
          if (preference?.is_enabled === false)
            return {
              allowed: false,
              reason: "SUPPLIER_NOTICE_PREFERENCE_DISABLED",
            };
          if (delivery.channel === "in_app") return { allowed: true };
          if (delivery.channel !== "email")
            return {
              allowed: false,
              reason: "SUPPLIER_NOTICE_CHANNEL_NOT_CONFIGURED",
            };
          const contact = (
            await sql<Row>`SELECT link.value FROM master.contact_link link JOIN control.owner_type owner ON owner.id=link.owner_type_id WHERE link.tenant_id=${delivery.tenantId}::uuid AND link.owner_id=${delivery.principalId}::uuid AND owner.code='principal' AND link.status='active' AND link.effective_from<=now() AND (link.effective_until IS NULL OR link.effective_until>now()) AND link.channel_type='email' ORDER BY link.is_verified DESC,link.is_primary DESC,link.created_at LIMIT 1`.execute(
              tx,
            )
          ).rows[0];
          if (contact?.value !== delivery.recipientAddress)
            return {
              allowed: false,
              reason: "SUPPLIER_NOTICE_DESTINATION_CHANGED",
            };
          const permission = await options.consent.checkAt(
            {
              planeKey: "neon",
              tenantId: delivery.tenantId,
              subjectType: "principal",
              subjectId: delivery.principalId,
              channel: "email",
              destination: delivery.recipientAddress,
              at: new Date().toISOString(),
            },
            tx,
          );
          return {
            allowed: permission?.consented === true,
            reason: "SUPPLIER_NOTICE_CONSENT_UNAVAILABLE",
          };
        },
      );
    },
    async onTerminalFailure(
      delivery: ClaimedNotificationDelivery,
      _error: string,
      tx: Tx,
    ) {
      const data = object(delivery.payload.data),
        pin = object(data.communication ?? delivery.payload.communication);
      if (
        pin.schema !== SCHEMA ||
        pin.milestone === "attention" ||
        !uuid(pin.attemptId)
      )
        return;
      const a = await attempt(delivery.tenantId, pin.attemptId, tx);
      if (!a) return;
      const config = await configuration(delivery.tenantId, tx);
      if (!config) return;
      const origin = new URL(config.public_origin);
      const id = `supplier-notice-failure:${delivery.messageId}`;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${delivery.tenantId + ":" + id},0))`.execute(
        tx,
      );
      await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,actor_id,source,payload,created_by)
       SELECT ${delivery.tenantId}::uuid,'supplier-communications',${PREFIX + "attention"},${id},'business_partner_case',${a.case_id}::uuid,${delivery.actorPrincipalId}::uuid,'supplier-communications',${JSON.stringify({ communication: { ...pin, milestone: "attention", documentJobId: undefined, attachmentVersionId: undefined, sourceSnapshotId: undefined }, caseNo: a.case_code, status: a.case_status, caseUrl: new URL(`/mdg/business-partner/requests/${a.case_id}`, origin).toString(), milestone: "attention", recipient_principal_ids: [config.operational_owner_principal_id], failedMessageId: delivery.messageId })}::jsonb,${delivery.actorPrincipalId}::uuid
       WHERE NOT EXISTS(SELECT 1 FROM event.outbox WHERE tenant_id=${delivery.tenantId}::uuid AND event_type=${PREFIX + "attention"} AND event_key=${id}) ON CONFLICT (tenant_id,event_key) WHERE event_key IS NOT NULL DO NOTHING`.execute(
        tx,
      );
    },
    attachmentAccess: {
      async authorize({ request, attachment }) {
        if (
          request.planeKey !== "neon" ||
          request.versionPolicy !== "pinned" ||
          request.attachmentVersionId !== attachment.attachmentVersionId
        )
          return false;
        return options.transactions.run(
          "neon",
          {
            tenantId: request.tenantId,
            principalId: request.recipientPrincipalId,
          },
          async (tx) => {
            const recognized = (
              await sql`SELECT 1 FROM governance.process_document_job WHERE tenant_id=${request.tenantId}::uuid AND result->>'attachmentVersionId'=${attachment.attachmentVersionId}`.execute(
                tx,
              )
            ).rows.length;
            if (!recognized) return false;
            const c = await context(
              request.tenantId,
              request.recipientPrincipalId,
              tx,
            );
            if (!c) return false;
            try {
              await options.authorizeArtifact(
                c,
                attachment.attachmentVersionId,
                tx,
              );
              return true;
            } catch {
              return false;
            }
          },
        );
      },
    } satisfies NotificationAttachmentAccessPolicy,
  };
}
