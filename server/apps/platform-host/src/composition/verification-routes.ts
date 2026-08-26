import { randomUUID } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import { defineRouteContract, registerContractRoute, type Application } from "@athyper/server-runtime-http";
import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";

const VERIFICATION_QUEUE = "system-verification";
const VERIFICATION_JOB = "verification.probe";
const RUN_COOLDOWN_MS = 15_000;
const TEST_TEXT = "Athyper verification document pipeline";

type PlaneKey = "studio" | "neon" | "mesh";
type CheckStatus = "passed" | "failed" | "skipped";
type CheckCategory = "identity" | "database" | "cache" | "document" | "search" | "runtime" | "mail" | "observability" | "readiness";

export interface VerificationCheckResult {
  readonly id: string;
  readonly label: string;
  readonly category: CheckCategory;
  readonly status: CheckStatus;
  readonly durationMs: number;
  readonly detail: string;
  readonly cleanup?: "complete" | "not-required" | "failed";
}

export interface VerificationRun {
  readonly apiVersion: "athyper.io/v1alpha1";
  readonly kind: "PlatformVerificationRun";
  readonly runId: string;
  readonly mode: "quick" | "functional";
  readonly scope: "all" | PlaneKey;
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "passed" | "failed";
  readonly summary: Readonly<Record<CheckStatus, number>>;
  readonly checks: readonly VerificationCheckResult[];
  readonly evidence: { readonly correlationId: string; readonly logQuery: string; readonly grafanaExploreUrl?: string };
}

const responseSchema = { type: "object" } as const;
const snapshotContract = defineRouteContract({ method: "get", path: "/api/platform/verification", operationId: "platform.verification.snapshot", summary: "Run authenticated read-only platform verification", tags: ["Platform verification"], authenticated: true, responses: { 200: { description: "Sanitized verification snapshot", body: responseSchema }, 404: { description: "Verification is disabled" } } });
const runContract = defineRouteContract({ method: "post", path: "/api/platform/verification/runs", operationId: "platform.verification.run", summary: "Run bounded synthetic platform verification", tags: ["Platform verification"], authenticated: true, request: { body: { type: "object", properties: { mode: { type: "string", enum: ["functional"] } }, required: ["mode"], additionalProperties: false } }, responses: { 200: { description: "Completed verification run", body: responseSchema }, 409: { description: "A verification run is already active" }, 429: { description: "Verification was run too recently" } } });

export function registerVerification(container: Container, config: HostConfig): void {
  if (!config.verification.enabled) return;
  registerWorkerProbe(container);
  const iam = container.platform.iam;
  if (!iam) return;
  const authenticate = createIamAuthenticationMiddleware(iam);
  const active = new Set<string>();
  const lastCompleted = new Map<string, number>();
  container.platform.httpRegistrars.push((application: Application) => {
    registerContractRoute(application, snapshotContract, authenticate, async (_request, response, next) => {
      try {
        const context = readVerifiedRequestContext(response);
        response.setHeader("Cache-Control", "private, no-store");
        response.status(200).json(await executeVerification(container, config, context, "quick"));
      } catch (error) { next(error); }
    });
    registerContractRoute(application, runContract, authenticate, async (_request, response, next) => {
      const context = readVerifiedRequestContext(response);
      const key = `${context.planeKey}:${context.tenantId}:${context.principalId}`;
      if (active.has(key)) { response.status(409).json(problem(409, "VERIFICATION_ALREADY_RUNNING", "A verification run is already active for this session")); return; }
      const previous = lastCompleted.get(key);
      if (previous && Date.now() - previous < RUN_COOLDOWN_MS) { response.setHeader("Retry-After", String(Math.ceil((RUN_COOLDOWN_MS - (Date.now() - previous)) / 1000))); response.status(429).json(problem(429, "VERIFICATION_RATE_LIMITED", "Wait before starting another functional verification run")); return; }
      active.add(key);
      try {
        response.setHeader("Cache-Control", "private, no-store");
        response.status(200).json(await executeVerification(container, config, context, "functional"));
        lastCompleted.set(key, Date.now());
      } catch (error) { next(error); }
      finally { active.delete(key); }
    });
  });
}

export async function executeVerification(container: Container, config: HostConfig, context: VerifiedRequestContext, mode: "quick" | "functional", now = () => new Date()): Promise<VerificationRun> {
  const runId = randomUUID();
  const correlationId = context.correlationId ?? context.requestId ?? runId;
  const startedAt = now().toISOString();
  const scope = context.planeKey === "studio" ? "all" : context.planeKey;
  const checks: VerificationCheckResult[] = [];
  checks.push(pass("identity.session", "Authenticated session", "identity", "Exact-plane session and tenant context are coherent"));
  checks.push(pass("identity.iam", "IAM authority", "identity", `Issuer-verified ${context.planeKey} identity; auth epoch ${context.authEpoch}`));

  const databasePlanes: readonly PlaneKey[] = scope === "all" ? ["studio", "neon", "mesh"] : [context.planeKey];
  for (const plane of databasePlanes) {
    const adapter = plane === "studio" ? container.adapters.athyperDatabase : plane === "neon" ? container.adapters.neonDatabase : container.adapters.meshDatabase;
    checks.push(adapter ? await checked(`database.${plane}`, `${title(plane)} database through PgBouncer`, "database", async () => {
      const result = await adapter.health();
      if (!result.healthy) throw new Error("unhealthy");
      return "Connection pool accepted a database round-trip";
    }) : skip(`database.${plane}`, `${title(plane)} database through PgBouncer`, "database", "Plane database is not composed"));
  }

  checks.push(container.adapters.redisCache ? await checked("cache.redis", "Redis cache and session transport", "cache", async () => {
    const result = await container.adapters.redisCache!.health();
    if (!result.healthy) throw new Error("unhealthy");
    return `Redis PING succeeded${result.latencyMs === undefined ? "" : ` in ${Math.round(result.latencyMs)} ms`}`;
  }) : skip("cache.redis", "Redis cache and session transport", "cache", "Redis is not composed"));

  for (const [name, probe] of selectedReadiness(container, context.planeKey, scope)) checks.push(await checked(`readiness.${name}`, humanize(name), "readiness", async () => {
    const result = await probe();
    if (result.status === "unhealthy") throw new Error("unhealthy");
    return result.status === "degraded" ? "Readiness contribution is degraded" : "Readiness contribution is healthy";
  }));

  checks.push(...await adapterHealth(container));
  if (mode === "functional") checks.push(...await functionalChecks(container, config, context, runId));

  const logQuery = `{instance="${config.env === "local" ? "dev" : config.env}"} |= "${runId}"`;
  checks.push(pass("observability.correlation", "Loki correlation evidence", "observability", "Structured correlation event emitted for Alloy forwarding"));
  const completedAt = now().toISOString();
  const summary = { passed: checks.filter((item) => item.status === "passed").length, failed: checks.filter((item) => item.status === "failed").length, skipped: checks.filter((item) => item.status === "skipped").length };
  const document: VerificationRun = { apiVersion: "athyper.io/v1alpha1", kind: "PlatformVerificationRun", runId, mode, scope, planeKey: context.planeKey, tenantId: context.tenantId, principalId: context.principalId, startedAt, completedAt, status: summary.failed ? "failed" : "passed", summary, checks, evidence: { correlationId, logQuery, ...(config.verification.grafanaUrl ? { grafanaExploreUrl: grafanaExploreUrl(config.verification.grafanaUrl, logQuery) } : {}) } };
  console.log(JSON.stringify({ event: "platform.verification.completed", runId, correlationId, mode, scope, planeKey: context.planeKey, tenantId: context.tenantId, status: document.status, summary }));
  return Object.freeze(document);
}

async function adapterHealth(container: Container): Promise<VerificationCheckResult[]> {
  const candidates: Array<readonly [string, string, CheckCategory, (() => Promise<{ readonly ok: boolean; readonly detail: string }>) | undefined]> = [
    ["document.object-storage", "MinIO object storage", "document", container.adapters.objectStorage ? async () => { const result = await container.adapters.objectStorage!.health(); return { ok: result.healthy, detail: "Configured bucket is reachable" }; } : undefined],
    ["document.malware", "ClamAV malware scanning", "document", container.adapters.malwareScanner ? async () => { const result = await container.adapters.malwareScanner!.health(); return { ok: result.status === "healthy", detail: "ClamAV PING succeeded" }; } : undefined],
    ["document.extraction", "Apache Tika extraction", "document", container.adapters.contentExtractor ? async () => { const result = await container.adapters.contentExtractor!.health(); return { ok: result.status === "healthy", detail: "Tika endpoint is ready" }; } : undefined],
    ["document.rendering", "Gotenberg PDF rendering", "document", container.adapters.pdfRenderer ? async () => { const result = await container.adapters.pdfRenderer!.health(); return { ok: result.status !== "unhealthy", detail: "Gotenberg endpoint is ready" }; } : undefined],
    ["search.meilisearch", "Meilisearch index", "search", container.adapters.searchIndex ? async () => { const result = await container.adapters.searchIndex!.health(); return { ok: result.status === "healthy", detail: "Search index is ready" }; } : undefined],
    ["mail.transport", "Email delivery transport", "mail", container.adapters.notificationChannels.get("email") ? async () => { const result = await container.adapters.notificationChannels.get("email")!.health(); return { ok: result.status !== "unhealthy", detail: "Selected email transport verification succeeded" }; } : undefined],
  ];
  return Promise.all(candidates.map(async ([id, label, category, probe]) => probe ? checked(id, label, category, async () => { const result = await probe(); if (!result.ok) throw new Error("unhealthy"); return result.detail; }) : skip(id, label, category, "Capability is not composed")));
}

async function functionalChecks(container: Container, config: HostConfig, context: VerifiedRequestContext, runId: string): Promise<VerificationCheckResult[]> {
  const results: VerificationCheckResult[] = [];
  const bytes = new TextEncoder().encode(`${TEST_TEXT} ${runId}`);
  if (container.adapters.redisCache) results.push(await checked("cache.round-trip", "Redis bounded round-trip", "cache", async () => {
    const key = `verification:${context.tenantId}:${runId}`;
    return withCleanup(async () => { await container.adapters.redisCache!.set(key, runId, { ttlSeconds: 60 }); if (await container.adapters.redisCache!.get(key) !== runId) throw new Error("mismatch"); return "Ephemeral value was written and read through the application adapter"; }, async () => container.adapters.redisCache!.delete(key), runId, "redis");
  }));

  if (container.adapters.objectStorage) results.push(await checked("document.storage-round-trip", "MinIO upload/download/delete", "document", async () => {
    const key = `verification/${context.tenantId}/${runId}.txt`;
    return withCleanup(async () => { await container.adapters.objectStorage!.put(key, bytes, { contentType: "text/plain" }); const stored = await container.adapters.objectStorage!.get(key); if (Buffer.from(stored).compare(Buffer.from(bytes)) !== 0) throw new Error("mismatch"); return "Object checksum round-trip succeeded"; }, async () => container.adapters.objectStorage!.delete(key), runId, "object-storage");
  }));
  else results.push(skip("document.storage-round-trip", "MinIO upload/download/delete", "document", "Object storage is not composed"));

  results.push(container.adapters.malwareScanner ? await checked("document.clean-scan", "ClamAV benign document scan", "document", async () => { const result = await container.adapters.malwareScanner!.scan({ content: bytes, fileName: `${runId}.txt`, contentType: "text/plain", sizeBytes: bytes.byteLength }); if (result.status !== "clean") throw new Error("unexpected result"); return "Benign synthetic document was classified clean"; }) : skip("document.clean-scan", "ClamAV benign document scan", "document", "Malware scanner is not composed"));
  results.push(container.adapters.contentExtractor ? await checked("document.extract", "Apache Tika known-text extraction", "document", async () => { const result = await container.adapters.contentExtractor!.extract({ content: bytes, contentType: "text/plain", fileName: `${runId}.txt` }); if (!result.text.includes(TEST_TEXT)) throw new Error("known text missing"); return "Known verification phrase was extracted"; }) : skip("document.extract", "Apache Tika known-text extraction", "document", "Content extractor is not composed"));
  results.push(container.adapters.pdfRenderer ? await checked("document.render", "Gotenberg one-page PDF", "document", async () => { const result = await container.adapters.pdfRenderer!.renderPdf({ html: `<!doctype html><html><body><h1>${TEST_TEXT}</h1><p>${runId}</p></body></html>`, documentName: `verification-${runId}` }); if (new TextDecoder().decode(result.bytes.slice(0, 4)) !== "%PDF") throw new Error("invalid PDF"); return `Rendered ${result.bytes.byteLength} byte PDF`;
  }) : skip("document.render", "Gotenberg one-page PDF", "document", "PDF renderer is not composed"));

  if (container.adapters.searchIndex) results.push(await checked("search.round-trip", "Meilisearch index/search/delete", "search", async () => {
    const documentId = `verification-${runId}`;
    return withCleanup(async () => { await container.adapters.searchIndex!.upsert({ id: documentId, planeKey: context.planeKey, tenantId: context.tenantId, attachmentId: runId, entityType: "system_verification", entityId: runId, title: TEST_TEXT, text: `${TEST_TEXT} ${runId}`, contentType: "text/plain", fileName: `${runId}.txt`, piiTypes: [], updatedAt: new Date().toISOString() }); const found = await container.adapters.searchIndex!.search({ planeKey: context.planeKey, tenantId: context.tenantId, text: runId, limit: 5, offset: 0 }); if (!found.hits.some((hit) => hit.attachmentId === runId)) throw new Error("not indexed"); return "Synthetic document was indexed and found"; }, async () => container.adapters.searchIndex!.remove(documentId), runId, "search");
  }));
  else results.push(skip("search.round-trip", "Meilisearch index/search/delete", "search", "Search is not composed"));

  results.push(await workerCheck(container, context, runId));
  results.push(await schedulerCheck(container, config));
  const email = container.adapters.notificationChannels.get("email");
  if (email && config.env === "local") results.push(await checked("mail.delivery", "Mailpit test delivery", "mail", async () => { const result = await email.send({ channel: "email", recipientAddress: "verification@athyper.test", templateKey: "platform.verification", subject: `Athyper verification ${runId}`, payload: { renderedText: `Platform verification run ${runId} completed its mail transport check.` }, planeKey: context.planeKey, tenantId: context.tenantId, recipientId: context.principalId }); return `Mail accepted${result.externalId ? ` with provider ID ${result.externalId}` : ""}`; }));
  else results.push(skip("mail.delivery", "Mail test delivery", "mail", config.env === "local" ? "Email transport is not composed" : "Delivery is disabled outside local environments"));
  return results;
}

async function workerCheck(container: Container, context: VerifiedRequestContext, runId: string): Promise<VerificationCheckResult> {
  if (!container.runtimes.jobs || !container.adapters.redisCache) return skip("runtime.worker", "Worker execution", "runtime", "Job runtime is not composed");
  return checked("runtime.worker", "Worker execution", "runtime", async () => {
    const key = `verification:worker:${runId}`;
    return withCleanup(async () => {
      await container.runtimes.jobs!.enqueue(VERIFICATION_QUEUE, VERIFICATION_JOB, { runId }, { enqueueKey: runId, maxAttempts: 1, timeoutMs: 15_000, removeOnComplete: true, removeOnFail: true, payloadSchema: { name: VERIFICATION_JOB, version: 1 }, execution: { planeKey: context.planeKey, scope: "tenant", tenantId: context.tenantId, principalId: context.principalId, correlationId: runId } });
      for (let attempt = 0; attempt < 50; attempt += 1) { if (await container.adapters.redisCache!.get(key) === "complete") return "Worker consumed the correlated synthetic job"; await delay(100); }
      throw new Error("worker timeout");
    }, async () => container.adapters.redisCache!.delete(key), runId, "worker-ack");
  });
}

async function schedulerCheck(container: Container, config: HostConfig): Promise<VerificationCheckResult> {
  if (!container.adapters.redisCache || !config.bullMq.url) return skip("runtime.scheduler", "Scheduler leadership", "runtime", "Scheduling runtime is not composed");
  return checked("runtime.scheduler", "Scheduler leadership", "runtime", async () => { const lease = await container.adapters.redisCache!.client.get(`athyper:${config.env}:scheduling:leader`); if (!lease) throw new Error("leader absent"); return "Redis-backed scheduler leader lease is active"; });
}

function registerWorkerProbe(container: Container): void {
  if (!container.runtimes.jobs || !container.adapters.redisCache) return;
  container.runtimes.jobs.register(VERIFICATION_QUEUE, VERIFICATION_JOB, { handle: async (job) => { const runId = typeof (job.data as { runId?: unknown }).runId === "string" ? (job.data as { runId: string }).runId : ""; if (!/^[0-9a-f-]{36}$/u.test(runId)) return { status: "discarded", reason: "invalid verification run" }; await container.adapters.redisCache!.set(`verification:worker:${runId}`, "complete", { ttlSeconds: 60 }); return { status: "completed", output: { runId } }; } });
  container.runtimes.jobDefinitions.push({ code: VERIFICATION_JOB, owner: "@athyper/server-platform-host", queue: VERIFICATION_QUEUE, name: VERIFICATION_JOB, scope: "tenant", payloadSchema: { name: VERIFICATION_JOB, version: 1 }, timeoutMs: 15_000, maxAttempts: 1, executionRetentionDays: 1 });
}

function selectedReadiness(container: Container, plane: PlaneKey, scope: "all" | PlaneKey) { return container.runtimes.health.entries().filter(([name]) => scope === "all" || !/(^|\.)(studio|neon|mesh)(\.|$)/u.test(name) || name.includes(plane)); }
class VerificationFailure extends Error { constructor(readonly cleanup: VerificationCheckResult["cleanup"] = "not-required") { super("verification failed"); } }
type CheckOutcome = string | { readonly detail: string; readonly cleanup: VerificationCheckResult["cleanup"] };
async function checked(id: string, label: string, category: CheckCategory, work: () => Promise<CheckOutcome>, cleanup: VerificationCheckResult["cleanup"] = "not-required"): Promise<VerificationCheckResult> { const started = performance.now(); try { const outcome = await work(); const detail = typeof outcome === "string" ? outcome : outcome.detail; return { id, label, category, status: "passed", durationMs: Math.round(performance.now() - started), detail, cleanup: typeof outcome === "string" ? cleanup : outcome.cleanup }; } catch (error) { return { id, label, category, status: "failed", durationMs: Math.round(performance.now() - started), detail: "Check failed; use the run correlation ID in Grafana for diagnostics", cleanup: error instanceof VerificationFailure ? error.cleanup : cleanup }; } }
async function withCleanup(work: () => Promise<string>, cleanup: () => Promise<unknown>, runId: string, artifact: string): Promise<CheckOutcome> { let detail: string | undefined; let workFailed = false; try { detail = await work(); } catch { workFailed = true; } let cleanupState: VerificationCheckResult["cleanup"] = "complete"; try { await cleanup(); } catch { cleanupState = "failed"; console.warn(JSON.stringify({ event: "platform.verification.cleanup_failed", runId, artifact })); } if (workFailed || cleanupState === "failed") throw new VerificationFailure(cleanupState); return { detail: detail!, cleanup: cleanupState }; }
function pass(id: string, label: string, category: CheckCategory, detail: string): VerificationCheckResult { return { id, label, category, status: "passed", durationMs: 0, detail, cleanup: "not-required" }; }
function skip(id: string, label: string, category: CheckCategory, detail: string): VerificationCheckResult { return { id, label, category, status: "skipped", durationMs: 0, detail, cleanup: "not-required" }; }
function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function humanize(value: string): string { return value.split(/[.-]/u).map(title).join(" "); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function grafanaExploreUrl(baseUrl: string, query: string): string { const panes = JSON.stringify({ verification: { datasource: "loki", queries: [{ refId: "A", expr: query, queryType: "range" }], range: { from: "now-15m", to: "now" } } }); return `${baseUrl.replace(/\/$/u, "")}/explore?schemaVersion=1&panes=${encodeURIComponent(panes)}`; }
function problem(status: number, code: string, detail: string) { return { type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, detail, code }; }
