import { sql, type Transaction } from "kysely";
import {
  parsePublicationArtifactEnvelope,
  type PublicationVerifier,
} from "@athyper/server-contract-publication";
import { AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import type {
  HistoricalIdentityReviewReceipt,
  HistoricalIdentityReviewStore,
} from "./historical-identity-review.js";

type Tx = Transaction<Record<string, never>>;
export interface InstalledReferenceResourcePin {
  readonly publicationKey: string;
  readonly releaseId: string;
  readonly unsignedHash: string;
  readonly artifactHash: string;
  readonly kind: "entity_authoring_descriptor" | "entity_identity_review";
}
interface ResourceRow {
  document: Record<string, unknown>;
  release_no: number | string;
  unsigned_hash: string;
  signature: string;
  algorithm: string;
  key_id: string;
  author_id: string;
  reviewer_id: string;
}
const denied = (): never => {
  throw new AuthoringPolicyError(
    "REFERENCE_RESOURCE_NOT_QUALIFIED",
    "Exact installed, independently reviewed resource evidence is required.",
  );
};
/** Concrete read adapter over the existing publication ledger and local head.
 * No latest-version fallback or new writable resource catalogue. The installed
 * verifier must enforce its existing key trust/revocation policy. */
export function createInstalledReferenceResourceReader(options: {
  authorityTenantId: string;
  maximumBytes: number;
  verifier: PublicationVerifier;
  /** Existing governance eligibility check, executed for exact recorded humans
   * under the caller transaction; cryptographic integrity alone cannot supply it. */
  authorizeReview(
    tx: Tx,
    input: { authorId: string; reviewerId: string; releaseId: string },
  ): Promise<void>;
}) {
  if (
    !options.verifier?.verify ||
    !options.authorizeReview ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  )
    denied();
  return async (tx: Tx, input: InstalledReferenceResourcePin) => {
    if (!tx.isTransaction) denied();
    const pin = structuredClone(input);
    if (
      !/^[a-f0-9]{64}$/.test(pin.unsignedHash) ||
      !/^[a-f0-9]{64}$/.test(pin.artifactHash) ||
      !["entity_authoring_descriptor", "entity_identity_review"].includes(
        pin.kind,
      )
    )
      denied();
    const rows = (
      await sql<ResourceRow>`SELECT * FROM entity_command_private.read_reference_resource(${pin.releaseId}::uuid,${pin.publicationKey},${pin.unsignedHash},${pin.artifactHash},${pin.kind},${options.maximumBytes})`.execute(
        tx,
      )
    ).rows;
    if (rows.length !== 1) return denied();
    const row = rows[0]!;
    if (
      sha256(row.document) !== pin.unsignedHash ||
      sha256({ ...row.document, signature: row.signature }) !==
        pin.artifactHash ||
      row.algorithm !== "Ed25519" ||
      !row.key_id ||
      !row.signature
    )
      return denied();
    const bytes = Buffer.from(canonicalJson(row.document));
    if (
      bytes.length > options.maximumBytes ||
      !(await options.verifier.verify({
        keyId: row.key_id,
        algorithm: row.algorithm,
        bytes,
        signature: row.signature,
      }))
    )
      return denied();
    const envelope = parsePublicationArtifactEnvelope(row.document.envelope);
    const manifest = row.document.manifest as
      Record<string, unknown> | undefined;
    const releaseNo = Number(row.release_no);
    if (
      !Number.isSafeInteger(releaseNo) ||
      releaseNo < 1 ||
      envelope.releaseNo !== releaseNo ||
      envelope.artifactKind !== pin.kind ||
      envelope.releaseId !== pin.releaseId ||
      envelope.publicationKey !== pin.publicationKey ||
      envelope.targetPlane !== "studio" ||
      !manifest ||
      manifest.releaseId !== pin.releaseId ||
      manifest.publicationKey !== pin.publicationKey ||
      manifest.releaseNo !== envelope.releaseNo ||
      manifest.artifactKind !== pin.kind ||
      manifest.targetPlane !== "studio" ||
      manifest.signingKeyId !== row.key_id ||
      manifest.signatureAlgorithm !== row.algorithm ||
      manifest.payloadSha256 !== sha256(envelope.payload)
    )
      return denied();
    await options.authorizeReview(tx, {
      authorId: row.author_id,
      reviewerId: row.reviewer_id,
      releaseId: pin.releaseId,
    });
    return {
      document: structuredClone(envelope.payload) as unknown as Record<
        string,
        unknown
      >,
      authorId: row.author_id,
      reviewerId: row.reviewer_id,
    };
  };
}
export function createInstalledIdentityReviewStore(options: {
  read: ReturnType<typeof createInstalledReferenceResourceReader>;
  pin: InstalledReferenceResourcePin;
}): HistoricalIdentityReviewStore {
  const pin = structuredClone(options.pin);
  if (pin.kind !== "entity_identity_review") denied();
  const load = async (tx: Tx) => {
    const resource = await options.read(tx, pin);
    const receipt =
      resource.document as unknown as HistoricalIdentityReviewReceipt;
    if (
      receipt.schema !== "entity.historical-identity-review/1" ||
      receipt.proposerId !== resource.authorId ||
      receipt.reviewerId !== resource.reviewerId
    )
      return denied();
    return { receipt, hash: sha256(receipt) };
  };
  return {
    load: async (tx, input) => {
      const result = await load(tx);
      if (
        result.receipt.entityId !== input.entityId ||
        result.receipt.changeSetId !== input.changeSetId ||
        result.receipt.sourceHash !== input.expectedSourceHash
      )
        return denied();
      return result;
    },
    authorize: async (tx, receipt, hash) => {
      const current = await load(tx);
      if (
        current.hash !== hash ||
        canonicalJson(current.receipt) !== canonicalJson(receipt)
      )
        denied();
    },
  };
}
export async function resolveInstalledAuthoringDescriptor(
  tx: Tx,
  pin: InstalledReferenceResourcePin,
  read: ReturnType<typeof createInstalledReferenceResourceReader>,
  expectedHash: string,
) {
  if (pin.kind !== "entity_authoring_descriptor") return denied();
  const { document } = await read(tx, pin);
  if (
    Object.keys(document).sort().join() !==
      "descriptor,descriptorHash,schema,schemaVersion" ||
    document.schema !== "entity.installed-authoring-descriptor/1" ||
    !Number.isSafeInteger(document.schemaVersion) ||
    (document.schemaVersion as number) < 1 ||
    typeof document.descriptor !== "object" ||
    !document.descriptor ||
    Array.isArray(document.descriptor) ||
    document.descriptorHash !== expectedHash ||
    sha256(document.descriptor) !== expectedHash
  )
    return denied();
  return {
    schemaVersion: document.schemaVersion as number,
    authoringSchemaHash: expectedHash,
    descriptor: structuredClone(document.descriptor),
  };
}
