import { normalizeGraphStorageOrder } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-storage-order.js";
import { createHash } from "node:crypto";
import {
  verifyMetadataSet,
  metadataHash,
  metadataKey,
} from "./metadata-set.mjs";
import { verifyNativeMetadataGraphs } from "./metadata-graphs.mts";
import {
  compileGraph,
  sha256,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { compileRuntimeRestoration } from "../../../server/packages/planes/studio/meta-entity-authoring/src/runtime-restoration.js";
import type { MetaEntityGraph } from "../../../server/packages/contracts/meta-entity-authoring/src/model.js";

function stableUuid(key: string) {
  const hex = createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
/** A fresh native draft is the import boundary. Source identities and hashes are
 * provenance only; no source approval, signature or activation is replayed. */
export function planMetadataImport(document: any) {
  verifyMetadataSet(document);
  verifyNativeMetadataGraphs(document);
  const candidateHash = metadataHash(document),
    branchCode = `candidate.${candidateHash.slice(0, 24)}`;
  const entities = document.items
    .filter((item: any) => item.reference.kind === "entity")
    .map((item: any) => {
      let graph = structuredClone(item.payload.graph) as MetaEntityGraph;
      if (!item.payload.registration || !item.payload.sourceArtifactHash)
        throw Error(
          `Native registration and signed source provenance required: ${item.reference.key}`,
        );
      if (!item.payload.compiled.descriptor.collectionRelationship) {
        const runtime = structuredClone(item.payload.runtimeRegistration);
        if (
          !runtime ||
          runtime.entityCode !== item.reference.key ||
          runtime.planeKey !== item.reference.plane
        )
          throw Error("Complete runtime registration required");
        const surfaces = (graph.surfaces ?? []).map((surface) => {
          const layout = { ...surface.layoutConfig };
          delete layout.baselineImport;
          delete layout.authorizationSuccessor;
          delete layout.runtimeRestoration;
          return { ...surface, layoutConfig: layout };
        });
        if (!surfaces.length)
          throw Error("Native runtime projection carrier required");
        surfaces[0] = {
          ...surfaces[0]!,
          layoutConfig: {
            ...surfaces[0]!.layoutConfig,
            runtimeRestoration: {
              schemaVersion: 1,
              kind: "reviewed_empty_target",
              publicationKey: `metadata.entity.${item.reference.key}.local-qa`,
              tenantId: document.tenantId,
              sourceArtifactHash: item.payload.sourceArtifactHash,
              descriptor: runtime,
              descriptorHash: metadataHash(runtime),
            },
          },
        };
        graph = { ...graph, surfaces };
        compileRuntimeRestoration(compileGraph(graph).descriptor);
      }
      // Stable fork IDs make a resumed import compare the same graph, while keeping
      // source IDs available for related entity mappings and provenance.
      const ids = new Map<string, string>();
      for (const [branch, rows] of Object.entries(graph))
        if (branch !== "classProfiles" && Array.isArray(rows))
          for (const row of rows)
            if (row && typeof row.id === "string")
              ids.set(
                row.id,
                stableUuid(`${candidateHash}:${item.reference.key}:${row.id}`),
              );
      const remap = (value: any): any =>
        typeof value === "string"
          ? (ids.get(value) ?? value)
          : Array.isArray(value)
            ? value.map(remap)
            : value && typeof value === "object"
              ? Object.fromEntries(
                  Object.entries(value).map(([key, val]) => [key, remap(val)]),
                )
              : value;
      graph = normalizeGraphStorageOrder(remap(graph));
      const compiled = compileGraph(graph);
      return {
        entityCode: item.reference.key,
        entityId: item.payload.sourceEntityId,
        registration: item.payload.registration,
        plane: item.reference.plane,
        branchCode,
        graph,
        contractHash: compiled.contractHash,
        sourceMetadataHash: item.sha256,
      };
    });
  const unsupported = document.items.filter(
    (item: any) =>
      ![
        "entity",
        "definition",
        "case_contract",
        "permission",
        "storage",
        "runtime",
        "handler",
        "resolver",
        "preflight",
        "provider",
        "capability",
        "policy",
        "numbering",
        "lifecycle",
      ].includes(item.reference.kind),
  );
  if (unsupported.length)
    throw Error("Native metadata import adapter unavailable");
  return {
    schema: "athyper.native-metadata-import-plan/1",
    tenantId: document.tenantId,
    candidateHash,
    entities,
    caseContracts: document.items.filter(
      (item: any) => item.reference.kind === "case_contract",
    ),
    definitions: document.items.filter(
      (item: any) => item.reference.kind === "definition",
    ),
    prerequisites: document.items.filter(
      (item: any) =>
        !["entity", "case_contract", "definition"].includes(
          item.reference.kind,
        ),
    ),
    approvalCopied: false,
    activationPerformed: false,
  };
}
/** Native persistence supplies empty optional branches and global class profile
 * identities. Everything else must retain the exact submitted semantics. */
export function equivalentNativeGraph(expected: any, actual: any) {
  if (!expected || !actual) return false;
  const arrays = [
    ...new Set(
      [...Object.keys(expected), ...Object.keys(actual)].filter(
        (key) => Array.isArray(expected[key]) || Array.isArray(actual[key]),
      ),
    ),
  ];
  const normalize = (value: any) => {
    const graph = structuredClone(value);
    for (const branch of arrays) graph[branch] ??= [];
    graph.classProfiles = (graph.classProfiles ?? []).map(
      ({ id, ...profile }: any) => profile,
    );
    return normalizeGraphStorageOrder(graph);
  };
  return sha256(normalize(expected)) === sha256(normalize(actual));
}
export interface NativeImportTransport {
  request(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<any>;
}
export async function importNativeMetadata(
  document: any,
  transport: NativeImportTransport,
  options: {
    verifyPrerequisites(items: any[]): Promise<void>;
    checkpoint(value: any): Promise<void>;
  },
) {
  const plan = planMetadataImport(document);
  await options.verifyPrerequisites(plan.prerequisites);
  const existing = await transport.request(
    "GET",
    "/api/meta-entity-authoring/change-sets",
  );
  if (!Array.isArray(existing))
    throw Error("Native authoring list unavailable");
  const result: any = {
    schema: "athyper.native-metadata-import-receipt/1",
    candidateHash: plan.candidateHash,
    tenantId: plan.tenantId,
    entities: [],
    caseContracts: [],
    definitions: [],
    nativeReviewRequired: true,
    releaseQualified: false,
  };
  for (const entity of plan.entities) {
    const matches = existing.filter(
      (row) =>
        row.entityCode === entity.entityCode &&
        row.branchCode === entity.branchCode,
    );
    if (matches.length > 1)
      throw Error("Ambiguous candidate draft; inspect import history");
    let changeSet = matches[0];
    if (!changeSet) {
      const identity = existing.find(
        (row) => row.entityCode === entity.entityCode,
      );
      changeSet = await transport.request(
        "POST",
        "/api/meta-entity-authoring/change-sets",
        {
          entityId: identity?.entityId ?? entity.entityId,
          entityCode: entity.entityCode,
          branchCode: entity.branchCode,
          title: `QA candidate ${plan.candidateHash.slice(0, 12)} ${entity.entityCode}`,
          ...(!identity ? { registration: entity.registration } : {}),
        },
      );
      // Persist identity before the graph write, so an interrupted import is visible.
      result.entities.push({
        entityCode: entity.entityCode,
        changeSetId: changeSet.id,
        state: "created",
      });
      await options.checkpoint(result);
    }
    if (changeSet.status !== "draft")
      throw Error(
        "Candidate draft already entered native review; verify its existing receipt",
      );
    const loaded = await transport.request(
      "GET",
      `/api/meta-entity-authoring/change-sets/${changeSet.id}/graph`,
    );
    const matchesStored = equivalentNativeGraph(entity.graph, loaded.graph);
    if (!matchesStored) {
      if (changeSet.revision !== 0 && loaded.graph.fields?.length)
        throw Error(
          "Candidate draft contains different content; do not overwrite it",
        );
      changeSet = await transport.request(
        "PUT",
        `/api/meta-entity-authoring/change-sets/${changeSet.id}/graph`,
        entity.graph,
        { "if-match": String(loaded.changeSet.revision) },
      );
    }
    const readback = await transport.request(
      "GET",
      `/api/meta-entity-authoring/change-sets/${changeSet.id}/graph`,
    );
    if (!equivalentNativeGraph(entity.graph, readback.graph))
      throw Error(
        "Native graph round-trip mismatch; stored draft requires inspection",
      );
    const compiled = compileGraph(readback.graph);
    // The repository adds native defaults. Bind the exact stored graph for review;
    // caller must review/sign these hashes, not an imported approval.
    const receipt = {
      entityCode: entity.entityCode,
      changeSetId: changeSet.id,
      revision: readback.changeSet.revision,
      sourceMetadataHash: entity.sourceMetadataHash,
      submittedContractHash: entity.contractHash,
      storedContractHash: compiled.contractHash,
      state: "draft",
    };
    result.entities = result.entities.filter(
      (row: any) => row.entityCode !== entity.entityCode,
    );
    result.entities.push(receipt);
    await options.checkpoint(result);
  }
  for (const item of plan.caseContracts) {
    const body = {
      bundle: {
        schema: "athyper.business-partner-case-contract-review/2",
        mode: "initial",
        previous: null,
        tenantId: plan.tenantId,
        entityId: item.payload.entityId,
        publicationKey: item.payload.publicationKey,
        candidate: { contract: item.payload.contract },
      },
      targetPlanes: [item.reference.plane],
    };
    const revision = await transport.request(
      "POST",
      "/api/studio/business-partner-case-contracts",
      body,
      {
        "idempotency-key": `candidate:${plan.candidateHash}:case:${item.reference.key}`,
      },
    );
    if (
      metadataHash(revision.contract ?? revision.bundle) !==
      metadataHash(item.payload.contract)
    )
      throw Error("Native case contract round-trip mismatch");
    result.caseContracts.push({
      reference: item.reference,
      revisionId: revision.id,
      contractHash: revision.contractHash,
    });
    await options.checkpoint(result);
  }
  for (const item of plan.definitions) {
    const revision = await transport.request(
      "POST",
      "/api/studio/business-partner-definitions",
      { bundle: item.payload, targetPlanes: [item.reference.plane] },
      {
        "idempotency-key": `candidate:${plan.candidateHash}:definition:${item.reference.key}`,
      },
    );
    if (metadataHash(revision.bundle) !== metadataHash(item.payload))
      throw Error("Native definition round-trip mismatch");
    result.definitions.push({
      reference: item.reference,
      revisionId: revision.id,
      bundleHash: revision.bundleHash,
    });
    await options.checkpoint(result);
  }
  return result;
}
