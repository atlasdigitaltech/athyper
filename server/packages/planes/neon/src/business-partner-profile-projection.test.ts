import { createHash } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it, vi } from "vitest";
import { createBusinessPartnerProfileProjectionService, KyselyBusinessPartnerProfileProjectionRepository, type MeshBusinessPartnerProfileEnvelope, type ProfileProjectionHead } from "./business-partner-profile-projection.js";

const tenant = "11111111-1111-4111-8111-111111111111", sourceTenant = "22222222-2222-4222-8222-222222222222", principal = "33333333-3333-4333-8333-333333333333", sourceAccount = "44444444-4444-4444-8444-444444444444", recipientAccount = "55555555-5555-4555-8555-555555555555", relationship = "66666666-6666-4666-8666-666666666666";
const context = { planeKey: "neon", realmKey: "athyper", tenantId: tenant, principalId: principal, authEpoch: 1, profileHash: "profile", requestId: "request", assurance: "elevated", permissions: { planeKey: "neon", tenantId: tenant, principalId: principal, principalFingerprint: "fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } as VerifiedRequestContext;

class Repository extends KyselyBusinessPartnerProfileProjectionRepository {
  receipts = new Map<string, { id: string; envelope: MeshBusinessPartnerProfileEnvelope; envelopeHash: string }>(); headValue: ProfileProjectionHead | null = null; attempts: Array<{ eventId: string; disposition: string; reasonCode?: string; trigger: string }> = [];
  override async receiptByEventId(_tenant: string, eventId: string) { const value = this.receipts.get(eventId); return value ? { id: value.id, envelopeHash: value.envelopeHash, processingDisposition: this.attempts.filter(item => item.eventId === eventId).at(-1)?.disposition as import("./business-partner-profile-projection.js").ProjectionDisposition | undefined } : null; }
  override async createReceipt(input: any) { const id = `77777777-7777-4777-8777-${String(this.receipts.size + 1).padStart(12, "0")}`; this.receipts.set(input.eventId, { id, envelope: input.envelope, envelopeHash: input.envelopeHash }); return id; }
  override async receipt(_tenant: string, eventId: string) { const value = this.receipts.get(eventId); return value ? { id: value.id, envelope: value.envelope } : null; }
  override async lockCoordinate() {}
  override async head() { return this.headValue; }
  override async createSnapshot(input: any) { return `88888888-8888-4888-8888-${String(input.publicationVersion).padStart(12, "0")}`; }
  override async applyPublished(input: any) { this.headValue = { projectionId: "12121212-1212-4212-8212-121212121212", tenantId: tenant, sourceTenantId: sourceTenant, sourceNetworkAccountId: sourceAccount, recipientNetworkAccountId: recipientAccount, networkRelationshipId: relationship, publicationId: input.publicationId, publicationVersion: input.publicationVersion, lifecycleVersion: input.lifecycleVersion, snapshotId: input.snapshotId, status: "active", payload: this.receipts.get(input.eventId)?.envelope.payload }; }
  override async applyWithdrawn(input: any) { this.headValue = { ...this.headValue!, lifecycleVersion: input.lifecycleVersion, status: "withdrawn" }; }
  override async appendAttempt(input: any) { const receipt = [...this.receipts.entries()].find(([, value]) => value.id === input.inboxId)!; this.attempts.push({ eventId: receipt[0], disposition: input.disposition, reasonCode: input.reasonCode, trigger: input.trigger }); }
  override async list() { return this.headValue ? [this.headValue] : []; }
  override async listQuarantine() { return this.attempts.filter(item => item.disposition === "quarantined"); }
}
function fixture() { const repository = new Repository(); const permissions: string[] = []; const service = createBusinessPartnerProfileProjectionService({ repository, authorizer: { async authorize(input) { permissions.push(input.permissionCode); return { allowed: true }; } }, transactions: { async run(_plane, _actor, work) { return work({} as never); } } }); return { repository, permissions, service }; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`; }
function envelope(version = 1, eventId = "99999999-9999-4999-8999-999999999999"): MeshBusinessPartnerProfileEnvelope { const payload = { schemaCode: "mesh.business_partner_profile", schemaVersion: 1, fieldSetCode: "recipient_safe_v1", recipient: { tenantId: tenant, networkAccountId: recipientAccount, networkRelationshipId: relationship, proposedNeonRole: "supplier" }, partner: { accountCode: "supplier.one", displayName: "Supplier One" }, commodityCapabilities: [] }; return { eventId, eventType: "business_partner.profile_publication.published", schemaVersion: 1, sourcePlane: "mesh", sourceTenantId: sourceTenant, recipientTenantId: tenant, sourceNetworkAccountId: sourceAccount, recipientNetworkAccountId: recipientAccount, networkRelationshipId: relationship, publicationId: version === 1 ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", publicationVersion: version, lifecycleVersion: 1, payloadHash: createHash("sha256").update(stable(payload)).digest("hex"), occurredAt: "2026-08-28T00:00:00.000Z", payload }; }
function schemaEnvelope(schemaVersion:number,fieldSetCode=`recipient_safe_v${schemaVersion}`):MeshBusinessPartnerProfileEnvelope{const base=envelope(),payload={...base.payload!,schemaVersion,fieldSetCode};return{...base,schemaVersion,payload,payloadHash:createHash("sha256").update(stable(payload)).digest("hex")};}

describe("NEON MESH Business Partner profile projection", () => {
  it("reads bounded processing receipts under the authenticated tenant without exposing envelopes", async () => {
    const value = fixture();
    const receipts = [{event_id: envelope().eventId, attempt_no: 1, disposition: "quarantined", reason_code: "MESH_PROFILE_PUBLICATION_GAP"}];
    const read = vi.spyOn(value.repository, "processingReceipts").mockResolvedValue(receipts);
    expect(await value.service.processingReceipts({context, limit: 25})).toEqual(receipts);
    expect(read).toHaveBeenCalledWith(tenant, 25, expect.anything());
    expect(value.permissions).toEqual(["neon.business_partner_profile_projection.read"]);
    await expect(value.service.processingReceipts({context, limit: 101})).rejects.toMatchObject({status: 400});
    await expect(value.service.processingReceipts({context: {...context, planeKey: "mesh"}})).rejects.toMatchObject({status: 400});
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("denies receipt reads before opening a database transaction", async () => {
    const run = vi.fn();
    const service = createBusinessPartnerProfileProjectionService({repository: new Repository(), authorizer: {async authorize() {return {allowed: false, reason: "denied"};}}, transactions: {run}});
    await expect(service.processingReceipts({context})).rejects.toMatchObject({status: 403});
    expect(run).not.toHaveBeenCalled();
  });
  it("applies a verified publication once and deduplicates its event ID", async () => { const value = fixture(), event = envelope(); expect(await value.service.receive({ context, envelope: event })).toMatchObject({ disposition: "applied", projection: { publicationVersion: 1, status: "active" } }); expect(await value.service.receive({ context, envelope: event })).toMatchObject({ disposition: "duplicate", replayed: true }); expect(value.repository.attempts).toHaveLength(1); });
  it("accepts the current v2 MESH publication and quarantines mismatched version/field-set pairs",async()=>{await expect(fixture().service.receive({context,envelope:schemaEnvelope(2)})).resolves.toMatchObject({disposition:"applied"});await expect(fixture().service.receive({context,envelope:schemaEnvelope(2,"recipient_safe_v1")})).resolves.toMatchObject({disposition:"quarantined",reasonCode:"MESH_PROFILE_FIELD_SET_UNSUPPORTED"});});
  it("keeps a quarantined processing outcome on duplicate delivery until governed replay repairs it", async () => {
    const value = fixture(), second = envelope(2, "99999999-9999-4999-8999-999999999998");
    await value.service.receive({context, envelope: second});
    expect(await value.service.receive({context, envelope: second})).toMatchObject({disposition: "duplicate", processingDisposition: "quarantined"});
    await value.service.receive({context, envelope: envelope()});
    await value.service.replay({context, eventId: second.eventId});
    expect(await value.service.receive({context, envelope: second})).toMatchObject({disposition: "duplicate", processingDisposition: "applied"});
  });
  it("quarantines a hash mismatch without changing the projection", async () => { const value = fixture(), event = { ...envelope(), payloadHash: "f".repeat(64) }; expect(await value.service.receive({ context, envelope: event })).toMatchObject({ disposition: "quarantined", reasonCode: "MESH_PROFILE_PAYLOAD_HASH_MISMATCH" }); expect(value.repository.headValue).toBeNull(); });
  it("quarantines an ordering gap and applies it after its predecessor and governed replay", async () => { const value = fixture(), second = envelope(2, "99999999-9999-4999-8999-999999999998"); expect(await value.service.receive({ context, envelope: second })).toMatchObject({ disposition: "quarantined", reasonCode: "MESH_PROFILE_PUBLICATION_GAP" }); await value.service.receive({ context, envelope: envelope() }); expect(await value.service.replay({ context, eventId: second.eventId })).toMatchObject({ disposition: "applied", replayed: true, projection: { publicationVersion: 2 } }); expect(value.permissions.at(-1)).toBe("neon.business_partner_profile_projection.replay"); });
  it("applies withdrawal as lifecycle state without deleting its immutable snapshot", async () => { const value = fixture(), published = envelope(); await value.service.receive({ context, envelope: published }); const withdrawn: MeshBusinessPartnerProfileEnvelope = { ...published, eventId: "99999999-9999-4999-8999-999999999997", eventType: "business_partner.profile_publication.withdrawn", lifecycleVersion: 2, payload: undefined, withdrawal: { reason: "relationship ended" } }; expect(await value.service.receive({ context, envelope: withdrawn })).toMatchObject({ disposition: "applied", projection: { status: "withdrawn", snapshotId: value.repository.headValue?.snapshotId } }); });
});
