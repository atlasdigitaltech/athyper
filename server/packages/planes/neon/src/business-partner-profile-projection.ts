import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;
export type ProjectionDisposition = "applied" | "duplicate" | "stale" | "quarantined";
export const businessPartnerProfileProjectionPermissions = Object.freeze({
  receive: "neon.business_partner_profile_projection.receive",
  read: "neon.business_partner_profile_projection.read",
  replay: "neon.business_partner_profile_projection.replay",
} as const);

export interface MeshBusinessPartnerProfileEnvelope {
  readonly eventId: string;
  readonly eventType: "business_partner.profile_publication.published" | "business_partner.profile_publication.withdrawn";
  readonly schemaVersion: number;
  readonly sourcePlane: "mesh";
  readonly sourceTenantId: string;
  readonly recipientTenantId: string;
  readonly sourceNetworkAccountId: string;
  readonly recipientNetworkAccountId: string;
  readonly networkRelationshipId: string;
  readonly publicationId: string;
  readonly publicationVersion: number;
  readonly lifecycleVersion: number;
  readonly payloadHash: string;
  readonly occurredAt: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly withdrawal?: { readonly reason?: string };
  readonly trace?: Readonly<Record<string, unknown>>;
}
export interface ProfileProjectionHead {
  readonly tenantId: string; readonly sourceTenantId: string; readonly sourceNetworkAccountId: string;
  readonly recipientNetworkAccountId: string; readonly networkRelationshipId: string;
  readonly publicationId: string; readonly publicationVersion: number; readonly lifecycleVersion: number;
  readonly snapshotId: string; readonly status: "active" | "withdrawn"; readonly payload?: Readonly<Record<string, unknown>>;
}
export interface ProfileProjectionResult { readonly eventId: string; readonly disposition: ProjectionDisposition; readonly reasonCode?: string; readonly replayed: boolean; readonly projection?: ProfileProjectionHead; }
export class NeonProfileProjectionError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "NeonProfileProjectionError"; } }
export interface ProfileProjectionTransactions { run<T>(plane: "neon", actor: { tenantId: string; principalId: string; requestId?: string; correlationId?: string }, work: (tx: Tx) => Promise<T>): Promise<T>; }

export interface BusinessPartnerProfileProjectionRepository {
  receiptByEventId(tenantId: string, eventId: string, tx: Tx): Promise<{ id: string; envelopeHash: string } | null>;
  createReceipt(input: ParsedEnvelope & { tenantId: string; principalId: string; envelope: MeshBusinessPartnerProfileEnvelope; envelopeHash: string }, tx: Tx): Promise<string | null>;
  receipt(tenantId: string, eventId: string, tx: Tx): Promise<{ id: string; envelope: MeshBusinessPartnerProfileEnvelope } | null>;
  lockCoordinate(tenantId: string, relationshipId: string, tx: Tx): Promise<void>;
  head(tenantId: string, relationshipId: string, tx: Tx): Promise<ProfileProjectionHead | null>;
  createSnapshot(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; payload: Readonly<Record<string, unknown>> }, tx: Tx): Promise<string>;
  applyPublished(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; snapshotId: string }, tx: Tx): Promise<void>;
  applyWithdrawn(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; snapshotId: string }, tx: Tx): Promise<void>;
  appendAttempt(input: { tenantId: string; inboxId: string; principalId: string; trigger: "delivery" | "replay"; disposition: ProjectionDisposition; reasonCode?: string; details?: Readonly<Record<string, unknown>> }, tx: Tx): Promise<void>;
  list(tenantId: string, relationshipId: string | undefined, limit: number, tx: Tx): Promise<readonly ProfileProjectionHead[]>;
  listQuarantine(tenantId: string, limit: number, tx: Tx): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

interface ParsedEnvelope {
  eventId: string; eventType: MeshBusinessPartnerProfileEnvelope["eventType"]; sourceTenantId: string;
  sourceNetworkAccountId: string; recipientNetworkAccountId: string; relationshipId: string; publicationId: string;
  publicationVersion: number; lifecycleVersion: number; schemaCode: string; schemaVersion: number;
  fieldSetCode: string; payloadHash: string; occurredAt: string;
}

export class KyselyBusinessPartnerProfileProjectionRepository implements BusinessPartnerProfileProjectionRepository {
  async receiptByEventId(tenantId: string, eventId: string, tx: Tx) { const row = (await sql<Row>`SELECT id,envelope_hash FROM control.mesh_business_partner_profile_inbox WHERE tenant_id=${tenantId}::uuid AND event_id=${eventId}::uuid FOR UPDATE`.execute(tx)).rows[0]; return row ? { id: String(row["id"]), envelopeHash: String(row["envelope_hash"]) } : null; }
  async createReceipt(input: ParsedEnvelope & { tenantId: string; principalId: string; envelope: MeshBusinessPartnerProfileEnvelope; envelopeHash: string }, tx: Tx) { const row=(await sql<{ id: string }>`INSERT INTO control.mesh_business_partner_profile_inbox(tenant_id,event_id,event_type,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,lifecycle_version,schema_code,schema_version,field_set_code,payload_hash,envelope_json,envelope_hash,occurred_at,received_by) VALUES(${input.tenantId}::uuid,${input.eventId}::uuid,${input.eventType},${input.sourceTenantId}::uuid,${input.sourceNetworkAccountId}::uuid,${input.recipientNetworkAccountId}::uuid,${input.relationshipId}::uuid,${input.publicationId}::uuid,${input.publicationVersion},${input.lifecycleVersion},${input.schemaCode},${input.schemaVersion},${input.fieldSetCode},${input.payloadHash},${JSON.stringify(input.envelope)}::jsonb,${input.envelopeHash},${input.occurredAt}::timestamptz,${input.principalId}::uuid) ON CONFLICT(tenant_id,event_id) DO NOTHING RETURNING id`.execute(tx)).rows[0];return row?String(row.id):null; }
  async receipt(tenantId: string, eventId: string, tx: Tx) { const row = (await sql<Row>`SELECT id,envelope_json FROM control.mesh_business_partner_profile_inbox WHERE tenant_id=${tenantId}::uuid AND event_id=${eventId}::uuid`.execute(tx)).rows[0]; return row ? { id: String(row["id"]), envelope: object(row["envelope_json"]) as unknown as MeshBusinessPartnerProfileEnvelope } : null; }
  async lockCoordinate(tenantId: string, relationshipId: string, tx: Tx) { await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${relationshipId}`},0))`.execute(tx); }
  async head(tenantId: string, relationshipId: string, tx: Tx) { const row = (await sql<Row>`SELECT projection.tenant_id,projection.source_tenant_id,projection.source_network_account_id,projection.recipient_network_account_id,projection.network_relationship_id,projection.current_publication_id,projection.current_publication_version,projection.current_lifecycle_version,projection.current_snapshot_id,projection.projection_status,snapshot.payload_json FROM control.mesh_business_partner_profile_projection projection JOIN snapshot.mesh_business_partner_profile_received snapshot ON snapshot.tenant_id=projection.tenant_id AND snapshot.id=projection.current_snapshot_id WHERE projection.tenant_id=${tenantId}::uuid AND projection.network_relationship_id=${relationshipId}::uuid FOR UPDATE OF projection`.execute(tx)).rows[0]; return row ? mapHead(row) : null; }
  async createSnapshot(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; payload: Readonly<Record<string, unknown>> }, tx: Tx) { return String((await sql<{ id: string }>`INSERT INTO snapshot.mesh_business_partner_profile_received(tenant_id,inbox_event_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,publication_id,publication_version,schema_code,schema_version,field_set_code,payload_json,payload_hash,received_by) VALUES(${input.tenantId}::uuid,${input.inboxId}::uuid,${input.sourceTenantId}::uuid,${input.sourceNetworkAccountId}::uuid,${input.recipientNetworkAccountId}::uuid,${input.relationshipId}::uuid,${input.publicationId}::uuid,${input.publicationVersion},${input.schemaCode},${input.schemaVersion},${input.fieldSetCode},${JSON.stringify(input.payload)}::jsonb,${input.payloadHash},${input.principalId}::uuid) RETURNING id`.execute(tx)).rows[0]!.id); }
  async applyPublished(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; snapshotId: string }, tx: Tx) { await sql`INSERT INTO control.mesh_business_partner_profile_projection(tenant_id,source_tenant_id,source_network_account_id,recipient_network_account_id,network_relationship_id,current_publication_id,current_publication_version,current_lifecycle_version,current_snapshot_id,last_inbox_event_id,projection_status,updated_by) VALUES(${input.tenantId}::uuid,${input.sourceTenantId}::uuid,${input.sourceNetworkAccountId}::uuid,${input.recipientNetworkAccountId}::uuid,${input.relationshipId}::uuid,${input.publicationId}::uuid,${input.publicationVersion},${input.lifecycleVersion},${input.snapshotId}::uuid,${input.inboxId}::uuid,'active',${input.principalId}::uuid) ON CONFLICT(tenant_id,network_relationship_id) DO UPDATE SET current_publication_id=EXCLUDED.current_publication_id,current_publication_version=EXCLUDED.current_publication_version,current_lifecycle_version=EXCLUDED.current_lifecycle_version,current_snapshot_id=EXCLUDED.current_snapshot_id,last_inbox_event_id=EXCLUDED.last_inbox_event_id,projection_status='active',updated_by=EXCLUDED.updated_by`.execute(tx); }
  async applyWithdrawn(input: ParsedEnvelope & { tenantId: string; inboxId: string; principalId: string; snapshotId: string }, tx: Tx) { await sql`UPDATE control.mesh_business_partner_profile_projection SET current_lifecycle_version=${input.lifecycleVersion},last_inbox_event_id=${input.inboxId}::uuid,projection_status='withdrawn',updated_by=${input.principalId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND network_relationship_id=${input.relationshipId}::uuid AND current_snapshot_id=${input.snapshotId}::uuid`.execute(tx); }
  async appendAttempt(input: { tenantId: string; inboxId: string; principalId: string; trigger: "delivery" | "replay"; disposition: ProjectionDisposition; reasonCode?: string; details?: Readonly<Record<string, unknown>> }, tx: Tx) { await sql`INSERT INTO control.mesh_business_partner_profile_processing_attempt(tenant_id,inbox_event_id,attempt_no,trigger_kind,disposition,reason_code,details,processed_by) SELECT ${input.tenantId}::uuid,${input.inboxId}::uuid,COALESCE(max(attempt_no),0)+1,${input.trigger},${input.disposition},${input.reasonCode ?? null},${JSON.stringify(input.details ?? {})}::jsonb,${input.principalId}::uuid FROM control.mesh_business_partner_profile_processing_attempt WHERE tenant_id=${input.tenantId}::uuid AND inbox_event_id=${input.inboxId}::uuid`.execute(tx); }
  async list(tenantId: string, relationshipId: string | undefined, limit: number, tx: Tx) { const result = relationshipId ? await sql<Row>`SELECT projection.tenant_id,projection.source_tenant_id,projection.source_network_account_id,projection.recipient_network_account_id,projection.network_relationship_id,projection.current_publication_id,projection.current_publication_version,projection.current_lifecycle_version,projection.current_snapshot_id,projection.projection_status,snapshot.payload_json FROM control.mesh_business_partner_profile_projection projection JOIN snapshot.mesh_business_partner_profile_received snapshot ON snapshot.tenant_id=projection.tenant_id AND snapshot.id=projection.current_snapshot_id WHERE projection.tenant_id=${tenantId}::uuid AND projection.network_relationship_id=${relationshipId}::uuid ORDER BY projection.updated_at DESC LIMIT ${limit}`.execute(tx) : await sql<Row>`SELECT projection.tenant_id,projection.source_tenant_id,projection.source_network_account_id,projection.recipient_network_account_id,projection.network_relationship_id,projection.current_publication_id,projection.current_publication_version,projection.current_lifecycle_version,projection.current_snapshot_id,projection.projection_status,snapshot.payload_json FROM control.mesh_business_partner_profile_projection projection JOIN snapshot.mesh_business_partner_profile_received snapshot ON snapshot.tenant_id=projection.tenant_id AND snapshot.id=projection.current_snapshot_id WHERE projection.tenant_id=${tenantId}::uuid ORDER BY projection.updated_at DESC LIMIT ${limit}`.execute(tx); return result.rows.map(mapHead); }
  async listQuarantine(tenantId: string, limit: number, tx: Tx) { return (await sql<Row>`SELECT DISTINCT ON(attempt.inbox_event_id) inbox.event_id,inbox.network_relationship_id,inbox.publication_id,inbox.publication_version,inbox.lifecycle_version,attempt.attempt_no,attempt.disposition,attempt.reason_code,attempt.details,attempt.processed_at FROM control.mesh_business_partner_profile_processing_attempt attempt JOIN control.mesh_business_partner_profile_inbox inbox ON inbox.tenant_id=attempt.tenant_id AND inbox.id=attempt.inbox_event_id WHERE attempt.tenant_id=${tenantId}::uuid ORDER BY attempt.inbox_event_id,attempt.attempt_no DESC`.execute(tx)).rows.filter(row => row["disposition"] === "quarantined").slice(0, limit); }
}

export function createBusinessPartnerProfileProjectionService(options: { authorizer: Authorizer; repository: BusinessPartnerProfileProjectionRepository; transactions: ProfileProjectionTransactions }) {
  const process = async (context: VerifiedRequestContext, envelope: MeshBusinessPartnerProfileEnvelope, trigger: "delivery" | "replay", existingInboxId?: string): Promise<ProfileProjectionResult> => {
    const parsed = parse(envelope);
    if (parsed.recipientTenantId !== context.tenantId) throw error(403, "MESH_PROFILE_RECIPIENT_MISMATCH", "Envelope recipient does not match the authenticated NEON tenant");
    await authorize(options.authorizer, context, trigger === "replay" ? businessPartnerProfileProjectionPermissions.replay : businessPartnerProfileProjectionPermissions.receive, parsed.relationshipId);
    return options.transactions.run("neon", actor(context), async tx => {
      const envelopeHash = hash(envelope);
      let inboxId = existingInboxId;
      if (!inboxId) {
        const existing = await options.repository.receiptByEventId(context.tenantId, parsed.eventId, tx);
        if (existing) {
          if (existing.envelopeHash !== envelopeHash) throw error(409, "MESH_PROFILE_EVENT_ID_COLLISION", "Event ID was reused with different content");
          return { eventId: parsed.eventId, disposition: "duplicate", reasonCode: "MESH_PROFILE_EVENT_DUPLICATE", replayed: true };
        }
        const created = await options.repository.createReceipt({ ...parsed, tenantId: context.tenantId, principalId: context.principalId, envelope, envelopeHash }, tx);
        if (!created) { const raced = await options.repository.receiptByEventId(context.tenantId, parsed.eventId, tx); if (!raced || raced.envelopeHash !== envelopeHash) throw error(409, "MESH_PROFILE_EVENT_ID_COLLISION", "Event ID was concurrently reused with different content"); return { eventId: parsed.eventId, disposition: "duplicate", reasonCode: "MESH_PROFILE_EVENT_DUPLICATE", replayed: true }; }
        inboxId = created;
      } else {
        const locked = await options.repository.receiptByEventId(context.tenantId, parsed.eventId, tx);
        if (!locked || locked.id !== inboxId || locked.envelopeHash !== envelopeHash) throw error(409, "MESH_PROFILE_EVENT_ID_COLLISION", "Replay receipt no longer matches the immutable event");
      }
      await options.repository.lockCoordinate(context.tenantId, parsed.relationshipId, tx);
      const validation = validate(envelope, parsed);
      const head = await options.repository.head(context.tenantId, parsed.relationshipId, tx);
      const ordering = validation ?? order(parsed, head);
      if (ordering) {
        await options.repository.appendAttempt({ tenantId: context.tenantId, inboxId, principalId: context.principalId, trigger, disposition: ordering.disposition, reasonCode: ordering.reasonCode }, tx);
        return { eventId: parsed.eventId, ...ordering, replayed: trigger === "replay", ...(head ? { projection: head } : {}) };
      }
      if (parsed.eventType.endsWith("published")) {
        const snapshotId = await options.repository.createSnapshot({ ...parsed, tenantId: context.tenantId, inboxId, principalId: context.principalId, payload: envelope.payload! }, tx);
        await options.repository.applyPublished({ ...parsed, tenantId: context.tenantId, inboxId, principalId: context.principalId, snapshotId }, tx);
      } else {
        await options.repository.applyWithdrawn({ ...parsed, tenantId: context.tenantId, inboxId, principalId: context.principalId, snapshotId: head!.snapshotId }, tx);
      }
      await options.repository.appendAttempt({ tenantId: context.tenantId, inboxId, principalId: context.principalId, trigger, disposition: "applied" }, tx);
      return { eventId: parsed.eventId, disposition: "applied", replayed: trigger === "replay", projection: (await options.repository.head(context.tenantId, parsed.relationshipId, tx))! };
    });
  };
  return Object.freeze({
    receive: (input: { context: VerifiedRequestContext; envelope: MeshBusinessPartnerProfileEnvelope }) => process(input.context, input.envelope, "delivery"),
    async replay(input: { context: VerifiedRequestContext; eventId: string }) { context(input.context); return options.transactions.run("neon", actor(input.context), async tx => { const receipt = await options.repository.receipt(input.context.tenantId, input.eventId, tx); if (!receipt) throw error(404, "MESH_PROFILE_EVENT_NOT_FOUND", "Inbox event was not found"); return receipt; }).then(receipt => process(input.context, receipt.envelope, "replay", receipt.id)); },
    async list(input: { context: VerifiedRequestContext; networkRelationshipId?: string; limit?: number }) { context(input.context); const limit = bounded(input.limit); await authorize(options.authorizer, input.context, businessPartnerProfileProjectionPermissions.read, input.networkRelationshipId); return options.transactions.run("neon", actor(input.context), tx => options.repository.list(input.context.tenantId, input.networkRelationshipId, limit, tx)); },
    async quarantine(input: { context: VerifiedRequestContext; limit?: number }) { context(input.context); await authorize(options.authorizer, input.context, businessPartnerProfileProjectionPermissions.read); return options.transactions.run("neon", actor(input.context), tx => options.repository.listQuarantine(input.context.tenantId, bounded(input.limit), tx)); },
  });
}

export type BusinessPartnerProfileProjectionService = ReturnType<typeof createBusinessPartnerProfileProjectionService>;

function parse(value: MeshBusinessPartnerProfileEnvelope): ParsedEnvelope & { recipientTenantId: string } { contextEnvelope(value); const payload = object(value.payload); return { eventId: uuid(value.eventId, "eventId"), eventType: value.eventType, sourceTenantId: uuid(value.sourceTenantId, "sourceTenantId"), recipientTenantId: uuid(value.recipientTenantId, "recipientTenantId"), sourceNetworkAccountId: uuid(value.sourceNetworkAccountId, "sourceNetworkAccountId"), recipientNetworkAccountId: uuid(value.recipientNetworkAccountId, "recipientNetworkAccountId"), relationshipId: uuid(value.networkRelationshipId, "networkRelationshipId"), publicationId: uuid(value.publicationId, "publicationId"), publicationVersion: positive(value.publicationVersion, "publicationVersion"), lifecycleVersion: positive(value.lifecycleVersion, "lifecycleVersion"), schemaCode: String(payload["schemaCode"] ?? "mesh.business_partner_profile"), schemaVersion: positive(value.schemaVersion, "schemaVersion"), fieldSetCode: String(payload["fieldSetCode"] ?? "recipient_safe_v1"), payloadHash: hashText(value.payloadHash), occurredAt: instant(value.occurredAt) }; }
function validate(envelope: MeshBusinessPartnerProfileEnvelope, parsed: ParsedEnvelope): { disposition: "quarantined"; reasonCode: string } | undefined { if (envelope.sourcePlane !== "mesh") return quarantine("MESH_PROFILE_SOURCE_PLANE_INVALID"); if (parsed.schemaCode !== "mesh.business_partner_profile" || parsed.schemaVersion !== 1) return quarantine("MESH_PROFILE_SCHEMA_UNSUPPORTED"); if (parsed.fieldSetCode !== "recipient_safe_v1") return quarantine("MESH_PROFILE_FIELD_SET_UNSUPPORTED"); if (parsed.eventType.endsWith("published")) { if (!envelope.payload) return quarantine("MESH_PROFILE_PAYLOAD_MISSING"); if (hash(envelope.payload) !== parsed.payloadHash) return quarantine("MESH_PROFILE_PAYLOAD_HASH_MISMATCH"); if (!safe(envelope.payload)) return quarantine("MESH_PROFILE_SENSITIVE_FIELD_REJECTED"); const recipient = object(object(envelope.payload)["recipient"]); if (recipient["tenantId"] !== envelope.recipientTenantId || recipient["networkAccountId"] !== envelope.recipientNetworkAccountId || recipient["networkRelationshipId"] !== envelope.networkRelationshipId) return quarantine("MESH_PROFILE_RECIPIENT_BINDING_MISMATCH"); if (parsed.lifecycleVersion !== 1) return quarantine("MESH_PROFILE_LIFECYCLE_INVALID"); } else if (envelope.payload) return quarantine("MESH_PROFILE_WITHDRAWAL_PAYLOAD_FORBIDDEN"); return undefined; }
function order(event: ParsedEnvelope, head: ProfileProjectionHead | null): { disposition: "stale" | "quarantined"; reasonCode: string } | undefined { if (!head) return event.eventType.endsWith("published") && event.publicationVersion === 1 ? undefined : quarantine("MESH_PROFILE_PUBLICATION_GAP"); if (event.publicationVersion < head.publicationVersion) return { disposition: "stale", reasonCode: "MESH_PROFILE_EVENT_STALE" }; if (event.publicationVersion > head.publicationVersion + 1) return quarantine("MESH_PROFILE_PUBLICATION_GAP"); if (event.publicationVersion === head.publicationVersion + 1) return event.eventType.endsWith("published") && event.lifecycleVersion === 1 ? undefined : quarantine("MESH_PROFILE_PUBLICATION_ORDER_INVALID"); if (event.publicationId !== head.publicationId) return quarantine("MESH_PROFILE_PUBLICATION_ID_CONFLICT"); if (event.lifecycleVersion <= head.lifecycleVersion) return { disposition: "stale", reasonCode: "MESH_PROFILE_EVENT_STALE" }; if (event.lifecycleVersion !== head.lifecycleVersion + 1 || !event.eventType.endsWith("withdrawn")) return quarantine("MESH_PROFILE_LIFECYCLE_GAP"); return undefined; }
function context(value: VerifiedRequestContext) { if (value.planeKey !== "neon") throw error(400, "NEON_PROFILE_PROJECTION_REQUIRED", "Profile projection executes only in NEON"); }
function contextEnvelope(value: MeshBusinessPartnerProfileEnvelope) { if (!value || typeof value !== "object" || !["business_partner.profile_publication.published", "business_partner.profile_publication.withdrawn"].includes(String(value.eventType))) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", "Supported MESH publication envelope required"); }
async function authorize(authorizer: Authorizer, contextValue: VerifiedRequestContext, permissionCode: string, relationshipId?: string) { context(contextValue); if (!(await authorizer.authorize({ context: contextValue, permissionCode, resource: { tenantId: contextValue.tenantId, ...(relationshipId ? { networkRelationshipId: relationshipId } : {}) } })).allowed) throw error(403, "FORBIDDEN", `Permission denied: ${permissionCode}`); }
function actor(value: VerifiedRequestContext) { return { tenantId: value.tenantId, principalId: value.principalId, requestId: value.requestId, correlationId: value.correlationId }; }
function mapHead(row: Row): ProfileProjectionHead { return { tenantId: String(row["tenant_id"]), sourceTenantId: String(row["source_tenant_id"]), sourceNetworkAccountId: String(row["source_network_account_id"]), recipientNetworkAccountId: String(row["recipient_network_account_id"]), networkRelationshipId: String(row["network_relationship_id"]), publicationId: String(row["current_publication_id"]), publicationVersion: Number(row["current_publication_version"]), lifecycleVersion: Number(row["current_lifecycle_version"]), snapshotId: String(row["current_snapshot_id"]), status: String(row["projection_status"]) as "active" | "withdrawn", payload: object(row["payload_json"]) }; }
function safe(value: unknown): boolean { if (Array.isArray(value)) return value.every(safe); if (!value || typeof value !== "object") return true; return Object.entries(value as Record<string, unknown>).every(([key, child]) => !/(bank|iban|swift|bic|routing|account.?number|tax|registration.?number|metadata|contact|email|phone|address|identifier|person|workforce|employee|employment|work.?assignment|compensation|date.?of.?birth|national.?id)/i.test(key) && safe(child)); }
function object(value: unknown): Readonly<Record<string, unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; }
function hash(value: unknown) { return createHash("sha256").update(stable(value)).digest("hex"); }
function hashText(value: unknown) { const text = String(value); if (!/^[a-f0-9]{64}$/.test(text)) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", "payloadHash must be lowercase SHA-256"); return text; }
function uuid(value: unknown, name: string) { const text = String(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", `${name} must be a UUID`); return text; }
function positive(value: unknown, name: string) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", `${name} must be a positive integer`); return number; }
function instant(value: unknown) { const date = new Date(String(value)); if (Number.isNaN(date.valueOf())) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", "occurredAt must be an instant"); return date.toISOString(); }
function bounded(value?: number) { const limit = value ?? 50; if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw error(400, "MESH_PROFILE_ENVELOPE_INVALID", "limit must be between 1 and 100"); return limit; }
function quarantine(reasonCode: string) { return { disposition: "quarantined" as const, reasonCode }; }
function error(status: number, code: string, message: string) { return new NeonProfileProjectionError(status, code, message); }
