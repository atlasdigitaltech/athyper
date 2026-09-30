import {createHash} from "node:crypto";
import {createEntityAuthorizationPublicationReview, type VerifiedOperationReview} from "./entity-authorization-publication-review.js";

type Coordinate = VerifiedOperationReview["coordinate"];
type Json = Record<string, any>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("RELEASE_REVIEW_INVALID");
  return value as Json;
};
const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");
const requireTrue = (condition: unknown): void => {if (!condition) throw Error("RELEASE_REVIEW_INVALID");};

/** Reads the durable authenticated operation-review format. Storage and current
 * reviewer authority are trusted server ports, never request-supplied evidence.
 * Historical operation packets lack releaseReview and intentionally cannot sign.
 */
export function createAuthenticatedEntityReleaseReview(options: {
  load(coordinate: Coordinate): Promise<{packet: unknown; state: unknown; nomination: unknown; nominationSha256: string} | null>;
  currentReviewer(input: {reviewerId: string; principalId: string; tenantId: string; domains: readonly string[]; coordinate: Coordinate}): Promise<boolean>;
  sourceCurrent(coordinate: Coordinate, base: unknown): Promise<boolean>;
  evidenceCurrent(evidence: {path: string; sha256: string}): Promise<boolean>;
  now?: () => number;
}) {
  return createEntityAuthorizationPublicationReview({now: options.now, readVerified: async coordinate => {
    const loaded = await options.load(coordinate);
    if (!loaded) return null;
    // Detach before awaiting live authority so stored evidence cannot change in flight.
    const {packet: rawPacket, state: rawState, nomination: rawNomination, nominationSha256} = structuredClone(loaded);
    const packet = object(rawPacket), state = object(rawState), nomination = object(rawNomination);
    const {packetRevision, ...body} = packet;
    const release = object(packet.releaseReview);
    requireTrue(packet.schemaVersion === 1 && packet.kind === "bp_operation_decision_packet" &&
      hash(body) === packetRevision && state.schemaVersion === 1 && state.packetRevision === packetRevision &&
      packet.nominationSha256 === nominationSha256 && nomination.nominationOnly === true &&
      nomination.activationAuthorized === false && packet.activationAuthorized === false &&
      Array.isArray(packet.grantChanges) && packet.grantChanges.length === 0);
    requireTrue(release.schemaVersion === 1 && hash(release.coordinate) === hash(coordinate) &&
      nomination.scope?.tenantId === coordinate.tenantId && nomination.scope?.entityCode === coordinate.entityCode &&
      nomination.scope?.planeKey === coordinate.plane && nomination.scope?.publicationKey === packet.source?.base?.publicationKey);
    const now = options.now?.() ?? Date.now();
    requireTrue(Number.isFinite(Date.parse(release.notBefore)) && Date.parse(release.notBefore) <= now &&
      Number.isFinite(Date.parse(release.expiresAt)) && Date.parse(release.expiresAt) > now);
    requireTrue(Array.isArray(packet.rows) && packet.rows.length > 0 && Array.isArray(packet.reviewers) && packet.reviewers.length >= 2 &&
      new Set(packet.reviewers.map((r: Json) => r.principalId)).size === packet.reviewers.length &&
      new Set(packet.reviewers.map((r: Json) => r.id)).size === packet.reviewers.length &&
      new Set(packet.rows.map((r: Json) => r.operation)).size === packet.rows.length && Array.isArray(state.receipts));
    requireTrue(await options.sourceCurrent(coordinate, packet.source.base));
    const evidence = new Map<string, string>();
    const operations: VerifiedOperationReview["operations"][number][] = [];
    const receiptReferences = new Set<string>();
    for (const receipt of state.receipts) {
      requireTrue(typeof receipt.reference === "string" && receipt.reference.startsWith("neon-operation-review:") &&
        !receiptReferences.has(receipt.reference));
      receiptReferences.add(receipt.reference);
      requireTrue(packet.reviewers.some((r: Json) => r.id === receipt.actor?.reviewerId));
      requireTrue(Array.isArray(receipt.decisions) && receipt.decisions.length > 0 &&
        new Set(receipt.decisions.map((d: Json) => d.operation)).size === receipt.decisions.length &&
        receipt.decisions.every((d: Json) => packet.rows.some((r: Json) => r.operation === d.operation && r.proposalSha256 === d.proposalSha256)));
    }
    for (const row of packet.rows) {
      requireTrue(hash(row.proposal) === row.proposalSha256 && hash(row.proposal.releaseReview) === hash(release) &&
        ["include", "defer"].includes(row.proposal.disposition));
      const regression = row.proposal.regressionEvidence;
      requireTrue(Array.isArray(regression) && regression.length > 0 && Array.isArray(row.proposal.implementationEvidence) && row.proposal.implementationEvidence.length > 0);
      for (const e of [...regression, ...row.proposal.implementationEvidence]) {
        requireTrue(typeof e.path === "string" && e.path.length > 0 && /^[a-f0-9]{64}$/.test(e.sha256));
        requireTrue(!evidence.has(e.path) || evidence.get(e.path) === e.sha256);
        evidence.set(e.path, e.sha256);
      }
      const reasons: string[] = [];
      for (const reviewer of packet.reviewers) {
        const nominated = nomination.reviewers?.find((r: Json) => r.id === reviewer.id);
        requireTrue(nominated?.principalId === reviewer.principalId && nominated?.homeTenantId === reviewer.homeTenantId &&
          ["business", "security"].every(domain => nominated?.domains?.includes(domain)));
        const matches = state.receipts.flatMap((r: Json) => r.actor?.reviewerId === reviewer.id
          ? r.decisions.filter((d: Json) => d.operation === row.operation).map((d: Json) => ({r, d})) : []);
        requireTrue(matches.length === 1);
        const {r, d} = matches[0];
        requireTrue(r.authenticatedReviewer === true && r.actor.assurance === "elevated" &&
          r.actor.principalId === reviewer.principalId && r.actor.tenantId === reviewer.homeTenantId &&
          r.packetRevision === packetRevision && r.nominationSha256 === nominationSha256 &&
          r.activationAuthorized === false && Array.isArray(r.grantChanges) && r.grantChanges.length === 0 &&
          ["business", "security"].every(domain => r.domains?.includes(domain)) &&
          Number.isFinite(Date.parse(r.recordedAt)) && Date.parse(r.recordedAt) >= Date.parse(release.notBefore) &&
          Date.parse(r.recordedAt) <= now && Date.parse(r.recordedAt) < Date.parse(release.expiresAt) &&
          d.decision === "approve" && typeof d.reason === "string" && d.reason.trim().length > 0);
        reasons.push(`${reviewer.id}: ${d.reason}`);
      }
      operations.push({operation: row.operation, decision: row.proposal.disposition === "defer" ? "deferred" : "approved",
        reason: reasons.join("; "), regressionEvidenceSha256: regression.map((e: Json) => e.sha256)});
    }
    for (const [path, sha256] of evidence) requireTrue(await options.evidenceCurrent({path, sha256}));
    // Revalidate each identity after evidence I/O; expiry is checked again by the
    // outer publication guard. No permission snapshots restore revoked authority.
    for (const reviewer of packet.reviewers) requireTrue(await options.currentReviewer({reviewerId: reviewer.id,
      principalId: reviewer.principalId, tenantId: reviewer.homeTenantId, domains: ["business", "security"], coordinate}));
    requireTrue(await options.sourceCurrent(coordinate, packet.source.base));
    return {schemaVersion: 1, coordinate, receiptSha256: hash({packetRevision, receipts: state.receipts}),
      authorityCurrent: true, verifiedReviewerDomains: ["business", "security"], expiresAt: release.expiresAt,
      operations, grantChanges: [], activationAuthorized: false};
  }});
}
