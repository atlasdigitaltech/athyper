import { runWithJobContext } from "@athyper/server-foundation/context";
import type { MetricsRegistry } from "@athyper/server-foundation/observability";
import type { NeonDatabaseAdapter } from "@athyper/server-adapter-db-neon";
import { sql } from "kysely";

export interface BusinessPartnerMetricsTarget {
  readonly tenantId: string;
  readonly principalId: string;
}

/** Operator-owned allowlist; never enumerate tenants through an unscoped query. */
export function parseBusinessPartnerMetricsTargets(value: string | undefined): readonly BusinessPartnerMetricsTarget[] {
  const targets: unknown = JSON.parse(value ?? "[]");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(targets) || targets.length > 1000) throw new Error("BUSINESS_PARTNER_METRICS_TARGETS must be an array of at most 1000 tenant/service-account pairs");
  const tenants = new Set<string>();
  return targets.map((target: unknown) => {
    if (!target || typeof target !== "object" || !("tenantId" in target) || !("principalId" in target)
      || typeof target.tenantId !== "string" || typeof target.principalId !== "string"
      || !uuid.test(target.tenantId) || !uuid.test(target.principalId)) {
      throw new Error("BUSINESS_PARTNER_METRICS_TARGETS requires UUID tenantId and principalId values");
    }
    const tenantId = target.tenantId.toLowerCase();
    if (tenants.has(tenantId)) throw new Error("BUSINESS_PARTNER_METRICS_TARGETS contains a duplicate tenant");
    tenants.add(tenantId);
    return { tenantId, principalId: target.principalId.toLowerCase() };
  });
}

export function createBusinessPartnerMetricsCollector(options: {
  readonly database: Pick<NeonDatabaseAdapter, "withTenantTransaction">;
  readonly metrics: MetricsRegistry;
  readonly targets: readonly BusinessPartnerMetricsTarget[];
  readonly intervalMs?: number;
  readonly onError: (error: unknown, target: BusinessPartnerMetricsTarget) => void;
}) {
  const intervalMs = options.intervalMs ?? 30_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) throw new Error("Invalid Business Partner metrics interval");
  const targets = parseBusinessPartnerMetricsTargets(JSON.stringify(options.targets));
  const oldestCase = options.metrics.gauge("athyper_business_partner_case_oldest_open_seconds", "Age of the oldest non-terminal Business Partner case");
  const oldestRequest = options.metrics.gauge("athyper_business_partner_request_oldest_open_seconds", "Age of the oldest non-terminal Business Partner request");
  const oldestNotification = options.metrics.gauge("athyper_business_partner_notification_oldest_pending_seconds", "Age of the oldest pending Business Partner notification plan");
  const deadLetters = options.metrics.gauge("athyper_business_partner_notification_dead_letters", "Current Business Partner notification planning dead letters");
  const success = options.metrics.gauge("athyper_business_partner_metrics_collection_success", "Whether the last complete metrics sweep succeeded");
  const lastSuccess = options.metrics.gauge("athyper_business_partner_metrics_last_success_timestamp_seconds", "Unix time of the last successful complete metrics sweep");
  options.metrics.gauge("athyper_business_partner_metrics_configured_tenants", "Number of authorized tenants configured for collection").set(targets.length, { plane: "neon" });
  const labels = { plane: "neon" };
  const failedTenants = options.metrics.gauge("athyper_business_partner_metrics_failed_tenants", "Number of tenant collections that failed in the last sweep");
  success.set(0, labels);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let closed = false;
  let inFlight: Promise<void> | undefined;

  async function collect(): Promise<void> {
    let failures = 0;
    let caseAge = 0;
    let notificationAge = 0;
    let notificationDeadLetters = 0;
    for (const target of targets) {
      if (closed) break;
      try {
        const sample = await runWithJobContext({ ...target, planeKey: "neon", signal: controller.signal }, () =>
          options.database.withTenantTransaction(async (transaction) => {
            // Both settings are local to this transaction and cannot leak through the pool.
            await sql`SELECT set_config('statement_timeout','5000',true), set_config('lock_timeout','1000',true)`.execute(transaction);
            const actor = await sql<{ allowed: boolean }>`SELECT EXISTS(
              SELECT 1 FROM master.principal principal JOIN master.tenant tenant ON tenant.id=principal.tenant_id
              WHERE principal.tenant_id=${target.tenantId}::uuid AND principal.id=${target.principalId}::uuid
                AND principal.principal_type='service_account' AND principal.status='active' AND tenant.status='active'
            ) AS allowed`.execute(transaction);
            if (!actor.rows[0]?.allowed) throw new Error("Metrics collection requires an active service account in an active tenant");
            controller.signal.throwIfAborted();
            const cases = await sql<{ oldest_open_seconds: number }>`SELECT
              GREATEST(COALESCE(extract(epoch FROM clock_timestamp()-min(created_at)),0),0)::double precision AS oldest_open_seconds
              FROM document.entity_case WHERE tenant_id=${target.tenantId}::uuid AND entity_code='master.business_partner'
              AND status IN('draft','submitted','in_review','approved','materializing','conflicted')`.execute(transaction);
            controller.signal.throwIfAborted();
            const notifications = await sql<{ oldest_pending_seconds: number; dead_letters: number }>`SELECT
              GREATEST(COALESCE(extract(epoch FROM clock_timestamp()-(min(state.created_at) FILTER (WHERE state.status IN('pending','failed','processing')))),0),0)::double precision oldest_pending_seconds,
              count(*) FILTER (WHERE state.status='dead_letter')::double precision dead_letters
              FROM event.notification_outbox_state state
              JOIN event.outbox outbox ON outbox.tenant_id=state.tenant_id AND outbox.id=state.outbox_id
              WHERE state.tenant_id=${target.tenantId}::uuid AND outbox.event_type LIKE 'business_partner.%'`.execute(transaction);
            return { cases: cases.rows[0]!, notifications: notifications.rows[0]! };
          }, controller.signal));
        if (closed) break;
        caseAge = Math.max(caseAge, Number(sample.cases.oldest_open_seconds));
        notificationAge = Math.max(notificationAge, Number(sample.notifications.oldest_pending_seconds));
        notificationDeadLetters += Number(sample.notifications.dead_letters);
      } catch (error) {
        if (closed) break;
        failures += 1;
        try { options.onError(error, target); } catch { /* Diagnostic transport must not stop the remaining tenants. */ }
      }
    }
    if (closed) return;
    failedTenants.set(failures, labels);
    success.set(targets.length > 0 && failures === 0 ? 1 : 0, labels);
    // Keep the previous complete sample on failure; never publish a partial total
    // or report zero for tenants whose data could not be read.
    if (targets.length > 0 && failures === 0) {
      oldestCase.set(caseAge, labels);
      oldestRequest.set(caseAge, labels);
      oldestNotification.set(notificationAge, labels);
      deadLetters.set(notificationDeadLetters, labels);
      lastSuccess.set(Date.now() / 1000, labels);
    }
  }

  function collectNow(): Promise<void> {
    if (closed) return Promise.resolve();
    inFlight ??= collect().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  function schedule(): void {
    if (!running || closed) return;
    timer = setTimeout(() => { void tick(); }, intervalMs);
    timer.unref();
  }
  async function tick(): Promise<void> {
    try { await collectNow(); } finally { schedule(); }
  }
  return {
    collectNow,
    start(): void {
      if (running || closed) return;
      running = true;
      // Start in the background; startup and readiness never wait for collection.
      timer = setTimeout(() => { void tick(); }, 0);
      timer.unref();
    },
    async close(): Promise<void> {
      closed = true;
      running = false;
      if (timer) clearTimeout(timer);
      controller.abort();
      await inFlight;
    },
  };
}
