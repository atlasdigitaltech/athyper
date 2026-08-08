import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;

// ── Shared types ──────────────────────────────────────────────────────────────

export type WidgetData =
  | { value: number | string; detail?: string; href?: string }
  | {
      items: Array<{
        id: string;
        title: string;
        detail?: string;
        status?: string;
        href?: string;
        occurredAt?: string;
      }>;
      total?: number;
      href?: string;
    };

/** null = widget query failed; the route handler surfaces it as state:"failed". */
export type KpiData = Record<string, WidgetData | null>;

export interface DashboardQueryProvider {
  getKpiData(
    tenantId: string,
    options?: { principalId?: string | null; accountCode?: string },
  ): Promise<KpiData>;
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function count(
  db: Db,
  query: ReturnType<typeof sql<{ value: string }>>,
  detail: string,
  href?: string,
): Promise<WidgetData> {
  const result = await query.execute(db);
  return { value: Number(result.rows[0]?.value ?? 0), detail, ...(href ? { href } : {}) };
}

function safe<T>(promise: Promise<T>): Promise<T | null> {
  return promise.catch(() => null);
}

function activeModuleCount(db: Db, tenantId: string, detail: string, href: string) {
  return count(
    db,
    sql<{ value: string }>`
      select count(distinct spm.module_id)::text as value
      from master.tenant t
      join control.subscription_plan sp
        on sp.id = t.subscription_plan_id
       and sp.status = 'active'
      join control.subscription_plan_module spm
        on spm.subscription_plan_id = sp.id
       and spm.status = 'active'
      join control.module m
        on m.id = spm.module_id
       and m.status = 'active'
      where t.id = ${tenantId}
        and t.status = 'active'
    `,
    detail,
    href,
  );
}

// ── Admin plane — queries athyper_platform DB ─────────────────────────────────

export function createAdminDashboardProvider(db: Db): DashboardQueryProvider {
  return {
    async getKpiData(tenantId) {
      const [
        tenantHealth,
        securityActions,
        failedJobs,
        notificationHealth,
        supportGrants,
        privilegedActivity,
        metadataDrift,
      ] = await Promise.all([
        safe(activeModuleCount(db, tenantId, "Modules enabled by the tenant's active plan", "/setup")),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from master.principal_identity_binding where tenant_id = ${tenantId} and (status <> 'active' or sync_status <> 'synced')`,
          "Identity bindings requiring review", "/inbox?view=security")),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from ops.job_execution where tenant_id = ${tenantId} and status in ('failed','timed_out','dead_letter') and created_at >= now() - interval '24 hours'`,
          "Failed or timed-out jobs in the last 24 hours", "/jobs")),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from event.notification_delivery where tenant_id = ${tenantId} and (status = 'failed' or bounced_at is not null) and created_at >= now() - interval '24 hours'`,
          "Failed or bounced deliveries in the last 24 hours", "/notifications")),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from master.tenant_relationship where to_tenant_id = ${tenantId} and status = 'active' and relationship_type in ('platform_support','implementation') and (effective_until is null or effective_until > now())`,
          "Active support and implementation relationships", "/setup/access")),
        safe((async (): Promise<WidgetData> => {
          const result = await sql<{ id: string; operation: string; occurred_at: Date; entity_type: string }>`
            select id::text, operation, occurred_at, entity_type from audit.audit_log
            where tenant_id = ${tenantId} order by occurred_at desc limit 6
          `.execute(db);
          return {
            items: result.rows.map((row) => ({
              id: row.id,
              title: row.operation,
              detail: row.entity_type,
              occurredAt: row.occurred_at.toISOString(),
              href: "/audit",
            })),
          };
        })()),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from metadata.entity_change_set where tenant_id = ${tenantId} and status in ('draft','in_review')`,
          "Metadata definitions not yet published", "/setup/metadata")),
      ]);
      return {
        "tenant-health": tenantHealth,
        "security-actions": securityActions,
        "failed-jobs": failedJobs,
        "notification-health": notificationHealth,
        "support-grants": supportGrants,
        "privileged-activity": privilegedActivity,
        "metadata-drift": metadataDrift,
      };
    },
  };
}

// ── Neon plane — queries athyper_neon DB ──────────────────────────────────────

export function createNeonDashboardProvider(db: Db): DashboardQueryProvider {
  return {
    async getKpiData(tenantId, { principalId = null } = {}) {
      const pid = principalId;
      const [
        assignedWork,
        pendingApprovals,
        financeExceptions,
        invoiceExceptions,
        recentDocuments,
        frequentSavedViews,
        setupReadiness,
      ] = await Promise.all([
        safe(pid
          ? count(db,
              sql<{ value: string }>`select count(*)::text as value from document.work_item where tenant_id = ${tenantId} and assignee_principal_id = ${pid} and status in ('open','claimed','in_progress','blocked')`,
              "Assigned work requiring attention", "/inbox")
          : Promise.resolve<WidgetData>({ items: [] })),
        safe(pid
          ? count(db,
              sql<{ value: string }>`select count(*)::text as value from document.work_item where tenant_id = ${tenantId} and assignee_principal_id = ${pid} and work_type_code = 'approval' and status in ('open','claimed','in_progress')`,
              "Approval decisions pending", "/inbox?view=assigned")
          : Promise.resolve<WidgetData>({ items: [] })),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from document.work_item where tenant_id = ${tenantId} and status = 'blocked' and payload->>'workspace' = 'finance'`,
          "Escalated finance and close items", "/workbench/finance/readiness")),
        safe(count(db,
          sql<{ value: string }>`select count(*)::text as value from document.workflow_request where tenant_id = ${tenantId} and status in ('rejected','escalated') and entity_type in ('purchase_invoice','purchase_order')`,
          "Invoice and purchasing workflow exceptions", "/app/purchase_invoice")),
        safe((async (): Promise<WidgetData> => {
          const result = await sql<{ id: string; entity_type: string; entity_id: string; status: string; created_at: Date }>`
            select id::text, entity_type, entity_id, status, created_at from document.workflow_request
            where tenant_id = ${tenantId} order by created_at desc limit 6
          `.execute(db);
          return {
            items: result.rows.map((row) => ({
              id: row.id,
              title: `${row.entity_type} ${row.entity_id}`,
              status: row.status,
              occurredAt: row.created_at.toISOString(),
              href: `/inbox/${row.id}`,
            })),
          };
        })()),
        safe((async (): Promise<WidgetData> => {
          const result = await sql<{ id: string; name: string; entity_code: string }>`
            select id::text, name, entity_code from master.saved_view
            where tenant_id = ${tenantId} and status = 'active'
              and (scope in ('shared','system') or owner_principal_id = ${pid})
            order by updated_at desc nulls last, created_at desc limit 6
          `.execute(db);
          return {
            items: result.rows.map((row) => ({
              id: row.id,
              title: row.name,
              detail: row.entity_code,
              href: "/saved-views",
            })),
          };
        })()),
        safe(activeModuleCount(db, tenantId, "Enabled modules contributing to tenant readiness", "/finance/setup")),
      ]);
      return {
        "assigned-work": assignedWork,
        "pending-approvals": pendingApprovals,
        "finance-exceptions": financeExceptions,
        "invoice-exceptions": invoiceExceptions,
        "recent-documents": recentDocuments,
        "frequent-saved-views": frequentSavedViews,
        "setup-readiness": setupReadiness,
      };
    },
  };
}

// ── Mesh plane — queries athyper_mesh DB ──────────────────────────────────────

export function createMeshDashboardProvider(db: Db): DashboardQueryProvider {
  return {
    async getKpiData(tenantId) {
      const related = sql`(buyer_tenant_id = ${tenantId} or supplier_tenant_id = ${tenantId})`;
      const [
        activeConnections,
        inboundEnvelopes,
        outboundEnvelopes,
        awaitingAck,
        failedExchanges,
        deliverySla,
        onboardingStatus,
        recentExchangeDocuments,
      ] = await Promise.all([
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.network_relationship where ${related} and status = 'active'`, "Active buyer-supplier relationships", "/connections")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.document_envelope where receiver_tenant_id = ${tenantId} and received_at >= now() - interval '24 hours'`, "Inbound envelopes in the last 24 hours", "/app/document_envelope")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.document_envelope where sender_tenant_id = ${tenantId} and received_at >= now() - interval '24 hours'`, "Outbound envelopes in the last 24 hours", "/app/document_envelope")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.document_envelope e where e.sender_tenant_id = ${tenantId} and e.status in ('accepted','routed') and not exists (select 1 from mesh.document_acknowledgement a where a.envelope_id = e.id and a.responder_tenant_id = e.receiver_tenant_id)`, "Envelopes awaiting acknowledgement", "/inbox")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.document_envelope where (sender_tenant_id = ${tenantId} or receiver_tenant_id = ${tenantId}) and status in ('failed','rejected')`, "Failed or rejected exchanges", "/inbox?view=escalated")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from event.outbox where tenant_id = ${tenantId} and status in ('pending','failed') and available_at < now() - interval '15 minutes'`, "Deliveries outside the 15-minute processing target", "/workbench")),
        safe(count(db, sql<{ value: string }>`select count(*)::text as value from mesh.network_relationship where ${related} and status = 'requested'`, "Connection requests awaiting onboarding action", "/connections")),
        safe((async (): Promise<WidgetData> => {
          const result = await sql<{ id: string; envelope_code: string; document_type: string; status: string; received_at: Date }>`
            select e.id::text, e.envelope_code, dt.code as document_type, e.status, e.received_at
            from mesh.document_envelope e
            join control.network_document_type dt on dt.id = e.document_type_id
            where e.sender_tenant_id = ${tenantId} or e.receiver_tenant_id = ${tenantId}
            order by e.received_at desc limit 6
          `.execute(db);
          return {
            items: result.rows.map((row) => ({
              id: row.id,
              title: row.envelope_code,
              detail: row.document_type,
              status: row.status,
              occurredAt: row.received_at.toISOString(),
              href: `/app/document_envelope/${row.id}`,
            })),
          };
        })()),
      ]);
      return {
        "active-connections": activeConnections,
        "inbound-envelopes": inboundEnvelopes,
        "outbound-envelopes": outboundEnvelopes,
        "awaiting-ack": awaitingAck,
        "failed-exchanges": failedExchanges,
        "delivery-sla": deliverySla,
        "onboarding-status": onboardingStatus,
        "recent-exchange-documents": recentExchangeDocuments,
      };
    },
  };
}
