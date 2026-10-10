import {
  assertOwnedLabelsComplete,
  validateNativeAiSemantics,
  validateNativeOperation,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  canonicalJson,
  sha256,
  validateNativeSnapshotReferences,
  validateConversionJsonData,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import type { NativeBootstrapProposal } from "./native-bootstrap-proposals.js";

/** Authoring input only. No compiler context, protected values, approvals,
 * initializer, SQL or executable callbacks are serialized in this bundle.
 * Canonical bootstrap still resolves and qualifies all installed resources.
 */
export function buildNativeBootstrapProposalBundle(input: {
  maximumBytes: number;
  maximumMembers: number;
  proposals: readonly {
    authorId: string;
    proposal: NativeBootstrapProposal;
  }[];
}) {
  const fail = (): never => {
    throw Error("NATIVE_BOOTSTRAP_BUNDLE_INVALID");
  };
  validateConversionJsonData(input, "/bundle");
  if (
    Object.keys(input).sort().join() !== "maximumBytes,maximumMembers,proposals"
  )
    fail();
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (
    !Number.isSafeInteger(input.maximumBytes) ||
    input.maximumBytes < 1 ||
    input.maximumBytes > 16 * 1024 * 1024 ||
    !Number.isSafeInteger(input.maximumMembers) ||
    input.maximumMembers < 1 ||
    input.maximumMembers > 100000 ||
    !Array.isArray(input.proposals) ||
    !input.proposals.length ||
    input.proposals.length > 256
  )
    fail();
  const seenDrafts = new Set<string>();
  const seenEntities = new Set<string>();
  const documents: Record<string, string> = {};
  const entries = input.proposals
    .map((entry) => {
      if (
        !entry ||
        Object.keys(entry).sort().join() !== "authorId,proposal" ||
        !uuid.test(entry.authorId)
      )
        fail();
      const proposal = entry.proposal;
      if (
        !proposal ||
        ![
          "baseReleaseId,branchCode,graph,title",
          "baseReleaseId,branchCode,graph,registration,title",
        ].includes(Object.keys(proposal).sort().join()) ||
        typeof proposal.title !== "string" ||
        !proposal.title.trim() ||
        proposal.title.length > 200 ||
        typeof proposal.branchCode !== "string" ||
        !/^[a-z][a-z0-9_.-]{0,126}$/.test(proposal.branchCode) ||
        (proposal.baseReleaseId !== null && !uuid.test(proposal.baseReleaseId))
      )
        fail();
      const graph = proposal.graph;
      const registration = proposal.registration;
      if (
        (proposal.baseReleaseId === null && !registration) ||
        (registration &&
          (!/^[a-z][a-z0-9_.-]{1,62}$/.test(registration.moduleCode) ||
            registration.entityCode !== graph?.entity?.entityCode ||
            ![
              "business",
              "configuration",
              "reference",
              "process",
              "projection",
              "technical",
            ].includes(registration.entityClass) ||
            registration.ownershipModel !== "system")) ||
        !graph ||
        graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
        graph.authoringSource?.sourceKind !== "product" ||
        graph.authoringSource.tenantId !== null ||
        !uuid.test(graph.authoringSource.entityId) ||
        !graph.ownedLabels ||
        !uuid.test(graph.ownedLabels.changeSetId)
      )
        fail();
      const entityId = graph.authoringSource.entityId;
      const changeSetId = graph.ownedLabels!.changeSetId;
      if (seenDrafts.has(changeSetId) || seenEntities.has(entityId)) fail();
      seenDrafts.add(changeSetId);
      seenEntities.add(entityId);
      const coordinate = { entityId, changeSetId, tenantId: null };
      validateNativeSnapshotReferences(graph, coordinate, input.maximumMembers);
      assertOwnedLabelsComplete(graph.ownedLabels!, {
        ...coordinate,
        supportedLocales: graph.ownedLabels!.requiredLocales,
      });
      for (const row of graph.fields) validateNormalizedCoreRow("field", row);
      for (const row of graph.runtimeProfiles)
        validateNormalizedCoreRow("runtime", row);
      for (const row of graph.surfaces)
        validateNormalizedCoreRow("surface", row);
      for (const row of graph.surfaceSections)
        validateNormalizedLayoutRow("section", row);
      for (const row of graph.surfaceFieldBindings)
        validateNormalizedLayoutRow("binding", row);
      for (const row of graph.operations) validateNativeOperation(row, true);
      validateNativeAiSemantics(graph.ai, input.maximumMembers);
      const proposalHash = sha256(graph);
      const document = {
        schema: "entity.native-bootstrap-proposal/1",
        ...structuredClone(proposal),
      };
      const bytes = canonicalJson(document);
      if (Buffer.byteLength(bytes) > input.maximumBytes) fail();
      const documentHash = sha256(document);
      const file = documentHash + ".json";
      documents[file] = bytes;
      return {
        entityId,
        changeSetId,
        authorId: entry.authorId,
        proposalHash,
        documentHash,
        file,
      };
    })
    .sort((a, b) => a.changeSetId.localeCompare(b.changeSetId));
  const manifest = {
    schema: "entity.native-bootstrap-proposals/1",
    proposals: entries,
  };
  const manifestText = canonicalJson(manifest);
  if (Buffer.byteLength(manifestText) > input.maximumBytes) fail();
  return {
    manifestHash: sha256(manifest),
    files: { ...documents, "manifest.json": manifestText },
    commands: entries.map((e) => ({
      entityId: e.entityId,
      changeSetId: e.changeSetId,
      proposalHash: e.proposalHash,
      // Stable retries reuse these exact coordinates; actor/tenant come from IAM.
      idempotencyKey: "native-bootstrap-" + e.documentHash,
    })),
  };
}
