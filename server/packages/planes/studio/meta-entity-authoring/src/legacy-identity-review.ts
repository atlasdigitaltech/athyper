import type { Transaction } from "kysely";
import {
  AuthoringPolicyError,
  referenceUuid,
  validateFoundationNode,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import type { LegacyReleaseCorrespondence } from "./legacy-field-lineage.js";
import type { LegacyIdentityInstallationPolicy } from "./legacy-identity-installation.js";
import type { LegacyOwnershipInput } from "./legacy-ownership-initialization.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";

type Tx = Transaction<Record<string, never>>;
/** An immutable identity decision, distinct from submit/approve publication
 * receipts. A content hash detects drift but never establishes review authority. */
export interface LegacyIdentityReviewReceipt {
  readonly schema: "entity.legacy-identity-review/1";
  readonly reference: string;
  readonly entityId: string;
  readonly changeSetId: string;
  readonly tenantId: null;
  readonly sourceHash: string;
  readonly authoringSchemaHash: string;
  readonly reviewedPlanHash: string;
  readonly proposerId: string;
  readonly reviewerId: string;
  readonly releases: readonly LegacyReleaseCorrespondence[];
}
export interface LegacyIdentityReviewStore {
  /** Resolve an immutable receipt from trusted installed storage by exact scope.
   * Client-supplied JSON or a bare file hash cannot implement this contract. */
  load(
    tx: Tx,
    input: LegacyOwnershipInput,
  ): Promise<{ receipt: LegacyIdentityReviewReceipt; hash: string } | null>;
  /** Check authenticated provenance, current reviewer eligibility, independent
   * review, revocation and resource trust while holding the applicable locks.
   * This must not return true just because the content hash is correct. */
  authorize(
    tx: Tx,
    receipt: LegacyIdentityReviewReceipt,
    hash: string,
  ): Promise<void>;
}
const denied = (): never => {
  throw new AuthoringPolicyError(
    "LEGACY_IDENTITY_REVIEW_UNAVAILABLE",
    "An exact, independently attributed current identity review is required.",
  );
};
export function createLegacyIdentityReviewResolver(options: {
  store: LegacyIdentityReviewStore;
  authoringSchemaHash: string;
  maximumBytes: number;
}): LegacyIdentityInstallationPolicy["resolveReview"] {
  if (
    !options.store?.load ||
    !options.store.authorize ||
    !/^[a-f0-9]{64}$/.test(options.authoringSchemaHash) ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  )
    denied();
  const schemaHash = options.authoringSchemaHash,
    maximumBytes = options.maximumBytes;
  return async (
    tx: Tx,
    request: LegacyOwnershipInput,
    source: MetaEntityGraph,
  ) => {
    const input = structuredClone(request);
    const sourceHash = sha256(source);
    const loaded = await options.store.load(tx, structuredClone(input));
    if (!loaded) return denied();
    validateConversionJsonData(loaded, "/identityReview");
    const { receipt, hash } = structuredClone(loaded);
    if (
      Object.keys(receipt).sort().join() !==
        "authoringSchemaHash,changeSetId,entityId,proposerId,reference,releases,reviewedPlanHash,reviewerId,schema,sourceHash,tenantId" ||
      receipt.schema !== "entity.legacy-identity-review/1" ||
      receipt.entityId !== input.entityId ||
      receipt.changeSetId !== input.changeSetId ||
      receipt.tenantId !== null ||
      receipt.sourceHash !== input.expectedSourceHash ||
      sourceHash !== receipt.sourceHash ||
      receipt.authoringSchemaHash !== schemaHash ||
      !/^[a-f0-9]{64}$/.test(receipt.reviewedPlanHash) ||
      !Array.isArray(receipt.releases) ||
      typeof receipt.reference !== "string" ||
      !receipt.reference.trim() ||
      receipt.reference.length > 1024 ||
      receipt.proposerId === receipt.reviewerId ||
      receipt.reviewerId === input.actorId ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      sha256(receipt) !== hash ||
      Buffer.byteLength(JSON.stringify(receipt)) > maximumBytes
    )
      return denied();
    for (const id of [receipt.proposerId, receipt.reviewerId])
      validateFoundationNode(referenceUuid, id, "/identityReview/principal");
    // Do not let an asynchronous store mutate the receipt used by the writer.
    await options.store.authorize(tx, structuredClone(receipt), hash);
    return {
      reviewerId: receipt.reviewerId,
      reviewReference: receipt.reference,
      reviewHash: hash,
      reviewedPlanHash: receipt.reviewedPlanHash,
      releases: receipt.releases,
    };
  };
}
