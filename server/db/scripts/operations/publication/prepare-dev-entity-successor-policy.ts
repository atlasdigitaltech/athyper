import { readFileSync } from "node:fs";
import { parseDevEntitySuccessorPolicy } from "../../../../packages/contracts/publication/src/policy/entity-successor-policy.js";
import { publicationCompilerIdentity } from "../../../../apps/platform-host/src/composition/shared/publication/compiler-build.js";

/** Construct reviewable policy pins from saved DEV receipts. This does not
 * approve or publish; the independent enrollment service checks current source. */
const args = process.argv.slice(2);
const baselinePath = args
  .find((arg) => arg.startsWith("--baseline="))
  ?.slice(11);
const draftPath = args.find((arg) => arg.startsWith("--draft="))?.slice(8);
const policyId = args.find((arg) => arg.startsWith("--policy-id="))?.slice(12);
if (args.length !== 3 || !baselinePath || !draftPath || !policyId)
  throw Error(
    "Use --baseline=<JSON> --draft=<JSON> --policy-id=<code> from the deployed compiler checkout",
  );
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const draft = JSON.parse(readFileSync(draftPath, "utf8"));
if (
  baseline.schema !== "athyper.dev-publication-successor-baseline/1" ||
  draft.schema !== "athyper.dev-successor-draft-receipt/1" ||
  draft.dryRun !== false ||
  draft.releaseCreated !== false ||
  draft.approvalCreated !== false ||
  draft.entityId !== baseline.source.entityId ||
  draft.predecessor.publicationReleaseId !==
    baseline.source.publication.releaseId
)
  throw Error("MATCHING_SAVED_DEV_RECEIPTS_REQUIRED");
const policy = parseDevEntitySuccessorPolicy({
  schema: "athyper.dev-entity-successor-policy/1",
  environment: "local",
  instance: "dev",
  authorityTenantId: draft.authorityTenantId,
  policyId,
  revision: 1,
  entityId: draft.entityId,
  changeSetId: draft.changeSet.id,
  contractHash: draft.contractHash,
  descriptorHash: draft.descriptorHash,
  authorPrincipalId: baseline.source.actors.submitter,
  publisherPrincipalId: baseline.source.actors.publisher,
  predecessor: draft.predecessor,
  compiler: publicationCompilerIdentity(),
  targets: baseline.targets.map(
    (target: {
      plane: string;
      head: Record<string, unknown>;
      applied: { sourceReleaseId: string };
    }) => ({
      plane: target.plane,
      environment: "local",
      instance: "dev",
      publicationKey: target.head.publication_key,
      appliedReleaseId: target.head.applied_release_id,
      sourceReleaseId: target.applied.sourceReleaseId,
      sourceReleaseNo: Number(target.head.source_release_no),
      artifactHash: target.head.artifact_hash,
      headVersion: Number(target.head.row_version),
    }),
  ),
});
console.log(JSON.stringify(policy, null, 2));
