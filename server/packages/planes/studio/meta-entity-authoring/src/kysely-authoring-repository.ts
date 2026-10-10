import { readNativeSignedRelease } from "./publication/read-native-signed-release.js";
import {
  applyNativeBootstrap,
  type NativeBootstrapInput,
  type NativeBootstrapPolicy,
} from "./native-bootstrap-application.js";
import {
  applyHistoricalIdentityInstallation,
  type HistoricalIdentityInstallationPolicy,
} from "./historical-identity-installation.js";
import {
  applyHistoricalOwnershipInitialization,
  type HistoricalOwnershipInput,
  type HistoricalOwnershipPolicy,
} from "./historical-ownership-initialization.js";
import { prepareHistoricalLabelNormalization } from "./historical-label-normalization.js";
import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import {
  applyHistoricalSourceNormalization,
  type HistoricalNormalizationApplicationInput,
  type HistoricalNormalizationApplicationPolicy,
} from "./historical-normalization-application.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  prepareHistoricalSourceNormalization,
  type HistoricalSourceNormalizationInput,
} from "./historical-source-normalization.js";
import { readNativeConversionHistory } from "./native-conversion-history.js";
import {
  applyNativeGraphConversion,
  type NativeConversionApplicationPolicy,
  type NativeConversionApplicationInput,
} from "./native-conversion-application.js";
import { validateNativeEntityLabelOwner } from "./native-localized-labels.js";
import {
  saveNativeCoreLayoutCommands,
  lockNativeDraft,
  assertNativeAuthoringContract,
  type NativeAuthoringPolicy,
  type NativeCommandInput,
  type NativeDraftRoot,
} from "./native-core-layout-persistence.js";
import {
  loadNativeSupplementalMembers,
  validateNativeSupplementalReferences,
} from "./native-supplemental-storage.js";
import {
  loadNormalizedCoreLayout,
  type NormalizedSaveCoordinate,
} from "./normalized-core-layout-storage.js";
import type {
  NativeAuthoringSnapshot,
  ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  loadReferenceMembers,
  saveReferenceCommands,
  loadFieldIdentities,
} from "./normalized-reference-storage.js";
import {
  loadNormalizedLabels,
  saveLabelCommands,
} from "./normalized-label-storage.js";
import { BRANCH_COLUMNS } from "./graph-storage-columns.js";
import { preserveOperationProtectedState } from "./operation-protected-state.js";
import { bindCanonicalRelationTargets } from "./canonical-relation-targets.js";
import { assertCanonicalRelationAuthoring } from "./canonical-relations.js";
import { normalizeGraphStorageOrder } from "./graph-storage-order.js";
import { changed, snakeKey } from "./graph-reconciliation.js";
import {
  readReconciliationPlans,
  writeReconciliationPlans,
} from "./scoped-graph-writer.js";
import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  ContractTestReport,
  MetaEntityAuthoringRepository,
  MetaEntityChangeSet,
  MetaEntityGraph,
  SignedMetaEntityArtifact,
  ValidationReport,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  validateFoundationNode,
  referenceUuid,
  parseNormalizedLayoutGraph,
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  canonicalJson,
  sha256,
  validateGraph,
  compileGraph,
} from "./deterministic.js";
import { parseEntityRegistration } from "./entity-registration.js";
import { cloneGraphIds } from "./graph-identity.js";
import { assertNoRetiredNativeGraphBranches } from "./retired-native-graph-branches.js";

type Database = Record<string, never>;
interface JsonRow {
  readonly value: unknown;
}
interface EntityHeaderRow {
  readonly entity_code: unknown;
  readonly entity_class: unknown;
  readonly ownership_model: unknown;
  readonly label_root?: {
    entity_label_id?: string | null;
    default_locale?: string;
    reference_contract_version?: number;
    native_core_layout_version?: number;
  };
}
interface ChangeSetRow {
  readonly reference_contract_version?: unknown;
  readonly native_core_layout_version?: unknown;
  readonly id: unknown;
  readonly tenant_id: unknown;
  readonly entity_id: unknown;
  readonly entity_code?: unknown;
  readonly branch_code: unknown;
  readonly status: unknown;
  readonly lock_version: unknown;
  readonly created_by: unknown;
  readonly submitted_by?: unknown;
  readonly reviewed_by?: unknown;
  readonly approved_by?: unknown;
}
interface AdvanceRow {
  readonly revision: unknown;
}
interface RevisionRow {
  readonly id: unknown;
  readonly revision_no: unknown;
  readonly revision_hash: unknown;
  readonly contract_hash: unknown;
  readonly contract_json?: unknown;
}
interface ParentRevisionRow {
  readonly id: unknown;
  readonly revision_hash: unknown;
}
interface ReleaseRow {
  readonly id: unknown;
  readonly release_no: unknown;
  readonly revision_id?: unknown;
  readonly contract_hash?: unknown;
  readonly revision_hash?: unknown;
}
interface ArtifactRow {
  readonly contract_hash: unknown;
  readonly signature_algorithm: unknown;
  readonly signing_key_id: unknown;
  readonly contract_signature: unknown;
  readonly compiled_hash: unknown;
  readonly compiled_json: unknown;
}

/** Installed read-only enrollment proposal resolver. It supplies no writer or
 * publication authority; request DTOs cannot carry labels, identities or ports. */
export interface HistoricalSourceNormalizationPolicy {
  readonly host: NativeAuthoringPolicy;
  resolve(
    database: Kysely<Database>,
    input: NormalizedSaveCoordinate & {
      actorId: string;
      expectedRevision: number;
      expectedSourceHash: string;
    },
    source: MetaEntityGraph,
  ): Promise<HistoricalSourceNormalizationInput>;
}

export class KyselyMetaEntityAuthoringRepository implements MetaEntityAuthoringRepository {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly prepareRelease?: (
      database: Kysely<Database>,
      input: {
        releaseId: string;
        artifact: SignedMetaEntityArtifact;
        targetPlanes: readonly string[];
      },
    ) => Promise<void>,
    private readonly normalizedPolicy?: import("@athyper/server-contract-meta-entity-authoring").NormalizedAuthoringPolicy,
    private readonly referencePolicy?: import("@athyper/server-contract-meta-entity-authoring").ReferenceCommandPolicy,
    private readonly nativePolicy?: NativeAuthoringPolicy,
    private readonly conversionPolicy?: NativeConversionApplicationPolicy,
    private readonly enrollmentPolicy?: HistoricalSourceNormalizationPolicy,
    private readonly enrollmentApplicationPolicy?: HistoricalNormalizationApplicationPolicy,
    private readonly ownershipPolicy?: HistoricalOwnershipPolicy,
    private readonly identityInstallationPolicy?: HistoricalIdentityInstallationPolicy,
    private readonly bootstrapPolicy?: NativeBootstrapPolicy,
  ) {}
  async executeNativeBootstrap(input: NativeBootstrapInput) {
    const policy = this.bootstrapPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "NATIVE_BOOTSTRAP_HOST_NOT_CONFIGURED",
        "An installed native authoring composition is required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT native_bootstrap`.execute(tx);
      try {
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          policy.host,
        );
        const result = await applyNativeBootstrap(tx, input, policy, {
          empty: () => repository.loadGraphParts(input.changeSetId, false),
          native: async (root) => {
            const graph = await repository.nativeSnapshot(tx, input, root);
            if (graph.contractSchema !== "athyper.meta-entity-contract/2.5")
              throw new AuthoringPolicyError(
                "NATIVE_BOOTSTRAP_READBACK_VERSION_INVALID",
                "Expanded native readback required.",
              );
            return graph;
          },
        });
        await sql`RELEASE SAVEPOINT native_bootstrap`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT native_bootstrap`.execute(tx);
        await sql`RELEASE SAVEPOINT native_bootstrap`.execute(tx);
        throw error;
      }
    });
  }
  async executeHistoricalIdentityInstallation(input: HistoricalOwnershipInput) {
    const policy = this.identityInstallationPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "LEGACY_IDENTITY_HOST_NOT_CONFIGURED",
        "Installed reviewed identity authority is required.",
      );
    return atomic(
      this.database,
      async (tx) => {
        await sql`SAVEPOINT legacy_identity_installation`.execute(tx);
        try {
          const repository = new KyselyMetaEntityAuthoringRepository(tx);
          const result = await applyHistoricalIdentityInstallation(
            tx,
            input,
            policy,
            () => repository.loadGraphParts(input.changeSetId, false),
          );
          await sql`RELEASE SAVEPOINT legacy_identity_installation`.execute(tx);
          return result;
        } catch (error) {
          await sql`ROLLBACK TO SAVEPOINT legacy_identity_installation`.execute(
            tx,
          );
          await sql`RELEASE SAVEPOINT legacy_identity_installation`.execute(tx);
          throw error;
        }
      },
      true,
    );
  }
  async executeHistoricalOwnershipInitialization(
    input: HistoricalOwnershipInput,
  ) {
    const policy = this.ownershipPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "LEGACY_OWNERSHIP_HOST_NOT_CONFIGURED",
        "Installed ownership authority is required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT legacy_ownership_initialization`.execute(tx);
      try {
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const result = await applyHistoricalOwnershipInitialization(
          tx,
          input,
          policy,
          () => repository.loadGraphParts(input.changeSetId, false),
        );
        await sql`RELEASE SAVEPOINT legacy_ownership_initialization`.execute(
          tx,
        );
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT legacy_ownership_initialization`.execute(
          tx,
        );
        await sql`RELEASE SAVEPOINT legacy_ownership_initialization`.execute(
          tx,
        );
        throw error;
      }
    });
  }
  async executeHistoricalNormalization(
    input: HistoricalNormalizationApplicationInput,
  ) {
    const policy = this.enrollmentApplicationPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "LEGACY_ENROLLMENT_HOST_NOT_CONFIGURED",
        "Independent canonical enrollment authority is required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT legacy_source_enrollment`.execute(tx);
      try {
        const repository = new KyselyMetaEntityAuthoringRepository(tx);
        const result = await applyHistoricalSourceNormalization(
          tx,
          input,
          policy,
          () => repository.loadGraphParts(input.changeSetId, false),
        );
        await sql`RELEASE SAVEPOINT legacy_source_enrollment`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT legacy_source_enrollment`.execute(tx);
        await sql`RELEASE SAVEPOINT legacy_source_enrollment`.execute(tx);
        throw error;
      }
    });
  }
  async prepareHistoricalNormalization(
    input: NormalizedSaveCoordinate & {
      actorId: string;
      expectedRevision: number;
      expectedSourceHash: string;
    },
  ) {
    const policy = this.enrollmentPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "LEGACY_ENROLLMENT_HOST_NOT_CONFIGURED",
        "An installed read-only source enrollment resolver is required.",
      );
    validateConversionJsonData(input, "/enrollment");
    input = structuredClone(input);
    if (
      Object.keys(input).sort().join() !==
        "actorId,changeSetId,entityId,expectedRevision,expectedSourceHash,tenantId" ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !/^[a-f0-9]{64}$/.test(input.expectedSourceHash)
    )
      throw new AuthoringPolicyError(
        "LEGACY_ENROLLMENT_REQUEST_INVALID",
        "Exact saved source coordinates are required.",
      );
    for (const id of [
      input.entityId,
      input.changeSetId,
      input.actorId,
      ...(input.tenantId === null ? [] : [input.tenantId]),
    ])
      validateFoundationNode(referenceUuid, id, "/enrollment/id");
    return atomic(this.database, async (tx) => {
      await policy.host.admit(tx, { ...input, batch: null }, "read");
      const root = (
        await sql<{
          source: Record<string, unknown>;
        }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs WHERE id=${input.changeSetId}::uuid AND entity_id=${input.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid FOR SHARE`.execute(
          tx,
        )
      ).rows[0]?.source;
      if (!root)
        throw new AuthoringPolicyError(
          "AUTHORING_DRAFT_NOT_FOUND",
          "The scoped source draft is unavailable.",
        );
      if (Number(root.lock_version) !== input.expectedRevision)
        throw new AuthoringConflictError("Stale enrollment source revision.");
      if (
        root.native_core_layout_version != null ||
        root.reference_contract_version != null
      )
        throw new AuthoringPolicyError(
          "LEGACY_ENROLLMENT_VERSION_UNSUPPORTED",
          "Only an unenrolled legacy source can produce this proposal.",
        );
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const source = await repository.loadGraphParts(input.changeSetId, false);
      if (sha256(source) !== input.expectedSourceHash)
        throw new AuthoringConflictError("Enrollment source hash changed.");
      const resolved = await policy.resolve(
        tx,
        structuredClone(input),
        structuredClone(source),
      );
      if (
        resolved.context.entityId !== input.entityId ||
        resolved.context.changeSetId !== input.changeSetId ||
        resolved.context.tenantId !== input.tenantId ||
        resolved.revision !== input.expectedRevision ||
        resolved.sourceHash !== input.expectedSourceHash
      )
        throw new AuthoringPolicyError(
          "LEGACY_ENROLLMENT_SOURCE_MISMATCH",
          "Resolver must bind the exact locked source.",
        );
      return prepareHistoricalSourceNormalization(source, resolved);
    });
  }
  async readNativeConversionHistory(
    input: NormalizedSaveCoordinate & { actorId: string; revision: number },
  ) {
    if (!this.conversionPolicy)
      throw new AuthoringPolicyError(
        "NATIVE_CONVERSION_HOST_NOT_CONFIGURED",
        "An installed archival conversion decoder is required.",
      );
    const policy = this.conversionPolicy;
    return atomic(this.database, (tx) =>
      readNativeConversionHistory(tx, input, policy),
    );
  }
  async executeNativeConversion(input: NativeConversionApplicationInput) {
    const policy = this.conversionPolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "NATIVE_CONVERSION_HOST_NOT_CONFIGURED",
        "Installed conversion/schema/compiler/reader evidence is required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT native_format_conversion`.execute(tx);
      try {
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          policy.host,
        );
        const result = await applyNativeGraphConversion(tx, input, policy, {
          source: () => repository.loadGraphParts(input.changeSetId, false),
          native: async (root) => {
            const graph = await repository.nativeSnapshot(tx, input, root);
            if (graph.contractSchema !== "athyper.meta-entity-contract/2.5")
              throw new AuthoringPolicyError(
                "NATIVE_CONVERSION_READBACK_VERSION_INVALID",
                "Expanded native readback required.",
              );
            return graph;
          },
        });
        await sql`RELEASE SAVEPOINT native_format_conversion`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT native_format_conversion`.execute(tx);
        await sql`RELEASE SAVEPOINT native_format_conversion`.execute(tx);
        throw error;
      }
    });
  }
  async executeNativeCoreLayoutCommands(input: NativeCommandInput) {
    const policy = this.nativePolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_HOST_NOT_CONFIGURED",
        "Independent host admission, budgets and initialization sources are required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT native_core_layout_batch`.execute(tx);
      try {
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          policy,
        );
        const result = await saveNativeCoreLayoutCommands(
          tx,
          input,
          policy,
          (root) => repository.nativeSnapshot(tx, input, root),
        );
        await sql`RELEASE SAVEPOINT native_core_layout_batch`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT native_core_layout_batch`.execute(tx);
        await sql`RELEASE SAVEPOINT native_core_layout_batch`.execute(tx);
        throw error;
      }
    });
  }
  async loadNativeGraph(
    input: NormalizedSaveCoordinate & { actorId: string },
  ): Promise<NativeAuthoringSnapshot> {
    const policy = this.nativePolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_HOST_NOT_CONFIGURED",
        "Independent host admission is required.",
      );
    return atomic(this.database, async (tx) => {
      await policy.admit(tx, { ...input, batch: null }, "read");
      const root = await lockNativeDraft(
        tx,
        input,
        policy.commands.authoringSchemaHash,
        policy.snapshotVersions,
      );
      await assertNativeAuthoringContract(
        tx,
        input,
        root.authoringSchemaHash,
        root.nativeVersion,
      );
      const graph = await new KyselyMetaEntityAuthoringRepository(
        tx,
        undefined,
        undefined,
        undefined,
        policy,
      ).nativeSnapshot(tx, input, root);
      const state = await loadNormalizedCoreLayout(tx, input);
      const context = await policy.resolveContext(tx, input, state);
      if (
        context.coreContext.entityId !== input.entityId ||
        context.coreContext.tenantId !== input.tenantId
      )
        throw new AuthoringPolicyError(
          "NORMALIZED_SAVE_CONTEXT_MISMATCH",
          "Read context must match the exact source scope.",
        );
      parseNormalizedLayoutGraph(state.layout, {
        ...context,
        maxMembers: Math.min(context.maxMembers, policy.commands.maxMembers),
        core: state.core,
      });
      validateNativeSnapshotReferences(
        graph,
        input,
        policy.commands.maxMembers,
      );
      return graph;
    });
  }
  async readNativeDraftSave(
    input: NormalizedSaveCoordinate & { actorId: string; revision: number },
  ): Promise<NativeAuthoringSnapshot | null> {
    const policy = this.nativePolicy;
    if (!policy)
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_HOST_NOT_CONFIGURED",
        "Independent history admission is required.",
      );
    if (!Number.isSafeInteger(input.revision) || input.revision < 0)
      throw new AuthoringPolicyError(
        "AUTHORING_REVISION_INVALID",
        "Valid saved revision required.",
      );
    return atomic(this.database, async (tx) => {
      await policy.admit(tx, { ...input, batch: null }, "history");
      const root = await lockNativeDraft(
        tx,
        input,
        policy.commands.authoringSchemaHash,
        policy.snapshotVersions,
      );
      await assertNativeAuthoringContract(
        tx,
        input,
        root.authoringSchemaHash,
        root.nativeVersion,
      );
      const row = (
        await sql<{
          graph: NativeAuthoringSnapshot;
          graph_hash: string;
        }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${input.changeSetId}::uuid AND lock_version=${input.revision} AND tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      if (!row) return null;
      if (sha256(row.graph) !== row.graph_hash)
        throw new AuthoringConflictError(
          "Saved history integrity check failed",
        );
      validateNativeEntityLabelOwner(row.graph, input);
      const source = row.graph.authoringSource;
      const savedVersion =
        row.graph.contractSchema === "athyper.meta-entity-contract/2.5"
          ? 2
          : row.graph.contractSchema === "athyper.meta-entity-contract/2.4"
            ? 1
            : null;
      const historicalVersions = policy.historicalSnapshotVersions ?? [
        root.nativeVersion,
      ];
      if (
        savedVersion === null ||
        !historicalVersions.includes(savedVersion) ||
        !source ||
        source.entityId !== input.entityId ||
        source.tenantId !== input.tenantId ||
        source.sourceKind !== root.sourceKind ||
        source.authoringSchemaHash !== root.authoringSchemaHash
      )
        throw new AuthoringPolicyError(
          "NATIVE_AUTHORING_HISTORY_SOURCE_MISMATCH",
          "History requires an exact supported source version and scope.",
        );
      if (row.graph.contractSchema === "athyper.meta-entity-contract/2.5")
        validateNativeSupplementalReferences(
          row.graph,
          policy.commands.maxMembers,
        );
      const state = {
        core: {
          field: row.graph.fields,
          runtime: row.graph.runtimeProfiles,
          surface: row.graph.surfaces,
        },
        layout: {
          section: row.graph.surfaceSections,
          binding: row.graph.surfaceFieldBindings,
        },
      };
      const context = await policy.resolveContext(tx, input, state);
      if (
        context.coreContext.entityId !== input.entityId ||
        context.coreContext.tenantId !== input.tenantId
      )
        throw new AuthoringPolicyError(
          "NORMALIZED_SAVE_CONTEXT_MISMATCH",
          "History context must match its source.",
        );
      parseNormalizedLayoutGraph(state.layout, {
        ...context,
        maxMembers: Math.min(context.maxMembers, policy.commands.maxMembers),
        core: state.core,
      });
      validateNativeSnapshotReferences(
        row.graph,
        input,
        policy.commands.maxMembers,
      );
      return row.graph;
    });
  }
  private async nativeSnapshot(
    tx: Transaction<Database>,
    input: NormalizedSaveCoordinate,
    root: NativeDraftRoot,
  ): Promise<NativeAuthoringSnapshot> {
    const expanded = root.nativeVersion === 2;
    const parts = await this.loadGraphParts(input.changeSetId, true, expanded);
    validateNativeEntityLabelOwner(parts, input);
    const state = await loadNormalizedCoreLayout(tx, input);
    const core = {
      ...parts,
      authoringSource: {
        entityId: input.entityId,
        tenantId: input.tenantId,
        sourceKind: root.sourceKind,
        authoringSchemaHash: root.authoringSchemaHash,
      },
      fields: state.core.field,
      runtimeProfiles: state.core.runtime,
      surfaces: state.core.surface,
      surfaceSections: state.layout.section,
      surfaceFieldBindings: state.layout.binding,
    };
    if (!expanded) {
      const graph: NativeAuthoringSnapshot = {
        ...core,
        contractSchema: "athyper.meta-entity-contract/2.4",
      };
      validateNativeSnapshotReferences(
        graph,
        input,
        this.nativePolicy!.commands.maxMembers,
      );
      return graph;
    }
    const policy = this.nativePolicy;
    if (!policy?.snapshotVersions?.includes(2))
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_HOST_NOT_CONFIGURED",
        "Expanded source admission and a finite snapshot budget are required.",
      );
    const graph: ExpandedNativeMetaEntityGraph = {
      ...core,
      contractSchema: "athyper.meta-entity-contract/2.5",
      searchFields:
        core.searchFields as unknown as ExpandedNativeMetaEntityGraph["searchFields"],
      ...(await loadNativeSupplementalMembers(
        tx,
        input,
        policy.commands.maxMembers,
      )),
    };
    validateNativeSnapshotReferences(graph, input, policy.commands.maxMembers);
    return graph;
  }
  /** Executes reviewed source-bound label enrollment through the existing writer.
   * Host admission and DB RLS are independent mandatory controls, never supplied
   * by the proposal. Replay reconstructs the batch from immutable source history. */
  async executeHistoricalLabelNormalization(input: {
    changeSetId: string;
    actorId: string;
    tenantId: string | null;
    proposal: Parameters<typeof prepareHistoricalLabelNormalization>[1];
  }) {
    if (!this.nativePolicy || !this.normalizedPolicy)
      throw new AuthoringPolicyError(
        "PRODUCT_AUTHORING_AUTHORITY_REQUIRED",
        "Installed host admission and normalized command policy are required.",
      );
    validateConversionJsonData(input, "/enrollment");
    const request = structuredClone(input),
      host = this.nativePolicy,
      policy = this.normalizedPolicy;
    if (
      !Number.isSafeInteger(request.proposal.revision) ||
      request.proposal.revision < 0 ||
      !/^[a-f0-9]{64}$/.test(request.proposal.sourceHash)
    )
      throw new AuthoringPolicyError(
        "LEGACY_LABEL_SOURCE_MISMATCH",
        "Exact source revision and hash required.",
      );
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT legacy_label_enrollment`.execute(tx);
      try {
        const root = await assertHistoricalCommandSource(
          tx,
          request.changeSetId,
          request.tenantId,
        );
        if (root.tenant_id !== request.tenantId)
          throw new AuthoringPolicyError(
            "AUTHORING_DRAFT_NOT_FOUND",
            "Exact source scope is required.",
          );
        await host.admit(
          tx,
          {
            changeSetId: request.changeSetId,
            entityId: string(root, "entity_id"),
            tenantId: request.tenantId,
            actorId: request.actorId,
            batch: null,
          },
          "read",
        );
        const repository = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          policy,
          undefined,
          host,
        );
        const source =
          Number(root.lock_version) === request.proposal.revision
            ? await repository.loadGraph(request.changeSetId)
            : await repository.readDraftSave(
                request.changeSetId,
                request.proposal.revision,
              );
        if (!source)
          throw new AuthoringConflictError(
            "Enrollment source history unavailable.",
          );
        const prepared = prepareHistoricalLabelNormalization(
          source,
          request.proposal,
          policy,
        );
        const result = await repository.executeLabelCommands({
          changeSetId: request.changeSetId,
          actorId: request.actorId,
          tenantId: request.tenantId,
          batch: prepared.batch,
        });
        await sql`RELEASE SAVEPOINT legacy_label_enrollment`.execute(tx);
        return {
          ...result,
          sourceHash: prepared.sourceHash,
          proposalHash: prepared.proposalHash,
        };
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT legacy_label_enrollment`.execute(tx);
        await sql`RELEASE SAVEPOINT legacy_label_enrollment`.execute(tx);
        throw error;
      }
    });
  }
  private async admitHistoricalProductCommand(
    tx: Transaction<Database>,
    input: {
      changeSetId: string;
      actorId: string;
      tenantId: string | null;
      batch: unknown;
    },
  ) {
    const source = await assertHistoricalCommandSource(
      tx,
      input.changeSetId,
      input.tenantId,
    );
    if (source.tenant_id !== input.tenantId)
      throw new AuthoringPolicyError(
        "AUTHORING_DRAFT_NOT_FOUND",
        "Exact source scope is required.",
      );
    if (source.tenant_id === null) {
      if (!this.nativePolicy)
        throw new AuthoringPolicyError(
          "PRODUCT_AUTHORING_AUTHORITY_REQUIRED",
          "Install the independently governed product-host admission path before product commands.",
        );
      await this.nativePolicy.admit(
        tx,
        { ...input, entityId: string(source, "entity_id") },
        "write",
      );
    }
  }
  async executeReferenceCommands(input: {
    changeSetId: string;
    actorId: string;
    tenantId: string | null;
    batch: unknown;
  }) {
    if (!this.referencePolicy)
      throw new AuthoringPolicyError(
        "REFERENCE_AUTHORING_NOT_CONFIGURED",
        "Host budget evidence required",
      );
    const policy = this.referencePolicy;
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT normalized_reference_batch`.execute(tx);
      try {
        await this.admitHistoricalProductCommand(tx, input);
        const result = await saveReferenceCommands(
          tx,
          input,
          policy,
          (revision, kind) =>
            captureDraftSave(
              tx,
              input.changeSetId,
              revision,
              input.actorId,
              kind,
            ),
        );
        await sql`RELEASE SAVEPOINT normalized_reference_batch`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT normalized_reference_batch`.execute(tx);
        await sql`RELEASE SAVEPOINT normalized_reference_batch`.execute(tx);
        throw error;
      }
    });
  }
  async executeLabelCommands(input: {
    changeSetId: string;
    actorId: string;
    tenantId: string | null;
    batch: unknown;
  }) {
    if (!this.normalizedPolicy)
      throw new AuthoringPolicyError(
        "NORMALIZED_AUTHORING_NOT_CONFIGURED",
        "Host locale and budget evidence is required",
      );
    const policy = this.normalizedPolicy;
    return atomic(this.database, async (tx) => {
      await sql`SAVEPOINT normalized_label_batch`.execute(tx);
      try {
        await this.admitHistoricalProductCommand(tx, input);
        const result = await saveLabelCommands(
          tx,
          input,
          policy,
          (revision, kind) =>
            captureDraftSave(
              tx,
              input.changeSetId,
              revision,
              input.actorId,
              kind,
            ),
        );
        await sql`RELEASE SAVEPOINT normalized_label_batch`.execute(tx);
        return result;
      } catch (error) {
        await sql`ROLLBACK TO SAVEPOINT normalized_label_batch`.execute(tx);
        await sql`RELEASE SAVEPOINT normalized_label_batch`.execute(tx);
        throw error;
      }
    });
  }
  async listInspectionReleases(tenantId: string) {
    const result = await sql<
      import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease
    >`
      SELECT r.id::text, e.entity_code AS "entityCode", r.change_set_id::text AS "changeSetId",
        CASE WHEN r.tenant_id IS NULL THEN 'product' ELSE 'tenant' END AS "sourceScope",
        r.tenant_id::text AS "sourceTenantId",
        r.release_no::integer AS "releaseNo", r.contract_hash AS "contractHash",
        r.target_planes AS "targetPlanes", r.published_at::text AS "publishedAt"
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
        AND e.tenant_id IS NOT DISTINCT FROM r.tenant_id
      JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.entity_id=r.entity_id
        AND cs.tenant_id IS NOT DISTINCT FROM r.tenant_id
      WHERE (r.tenant_id=${tenantId}::uuid OR
        (r.tenant_id IS NULL AND e.ownership_model='system' AND r.release_kind='publish'
          AND cs.status='published'))
      ORDER BY r.release_no DESC LIMIT 100`.execute(this.database);
    return result.rows;
  }
  async readInspectionRelease(tenantId: string, releaseId: string) {
    const result = await sql<{
      release: import("@athyper/server-contract-meta-entity-authoring").MetaEntityInspectionRelease;
      graph: MetaEntityGraph;
      legacyHashMatches: boolean;
    }>`
      SELECT jsonb_build_object('id',r.id,'entityCode',e.entity_code,'changeSetId',r.change_set_id,
        'sourceScope',CASE WHEN r.tenant_id IS NULL THEN 'product' ELSE 'tenant' END,
        'sourceTenantId',r.tenant_id,
        'releaseNo',r.release_no,'contractHash',r.contract_hash,'targetPlanes',r.target_planes,
        'publishedAt',r.published_at) AS release, snapshot.contract_json AS graph,
        (snapshot.contract_hash=r.contract_hash AND
          encode(sha256(convert_to(snapshot.contract_json::text,'UTF8')),'hex')=r.contract_hash)
          AS "legacyHashMatches"
      FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
        AND e.tenant_id IS NOT DISTINCT FROM r.tenant_id
      JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.entity_id=r.entity_id
        AND cs.tenant_id IS NOT DISTINCT FROM r.tenant_id
      JOIN snapshot.entity_contract_revision snapshot ON snapshot.id=r.revision_id
        AND snapshot.tenant_id IS NOT DISTINCT FROM r.tenant_id AND snapshot.entity_id=r.entity_id
        AND snapshot.change_set_id=r.change_set_id
      WHERE (r.tenant_id=${tenantId}::uuid OR
        (r.tenant_id IS NULL AND e.ownership_model='system' AND r.release_kind='publish'
          AND cs.status='published')) AND r.id=${releaseId}::uuid`.execute(
      this.database,
    );
    const row = result.rows[0];
    if (!row) return null;
    // Early SQL-authored releases hashed PostgreSQL jsonb text. Verify that
    // representation against both stored hashes; never trust a stored hash alone.
    if (
      sha256(row.graph) !== row.release.contractHash &&
      row.legacyHashMatches !== true
    )
      throw new AuthoringConflictError(
        "Stored release graph does not match its contract hash",
      );
    return { release: row.release, graph: row.graph };
  }
  async list(tenantId: string) {
    const rows =
      await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.tenant_id=${tenantId}::uuid AND cs.status IN ('draft','in_review','approved','published') ORDER BY cs.created_at DESC LIMIT 100`.execute(
        this.database,
      );
    return rows.rows.map((row) => this.map(row));
  }
  async listDraftSaves(id: string) {
    const result = await sql<{
      revision: number;
      capturedAt: string;
      kind: string;
    }>`SELECT lock_version AS revision, captured_at::text AS "capturedAt", capture_kind AS kind FROM snapshot.entity_draft_save WHERE change_set_id=${id}::uuid ORDER BY lock_version DESC`.execute(
      this.database,
    );
    return result.rows.map((row) => ({
      ...row,
      revision: Number(row.revision),
    }));
  }
  async readDraftSave(id: string, revision: number) {
    const result = await sql<{
      graph: MetaEntityGraph;
      graph_hash: string;
    }>`SELECT graph, graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${id}::uuid AND lock_version=${revision}`.execute(
      this.database,
    );
    const row = result.rows[0];
    if (!row) return null;
    if (sha256(row.graph) !== row.graph_hash)
      throw new AuthoringConflictError("Saved history integrity check failed");
    if (
      (row.graph as { contractSchema: string }).contractSchema ===
      "athyper.meta-entity-contract/2.4"
    )
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_READER_REQUIRED",
        "Use the versioned native reader; history cannot be decoded as legacy metadata.",
      );
    return row.graph;
  }
  async forkDraft(input: { sourceChangeSetId: string; actorId: string }) {
    return atomic(this.database, async (tx) => {
      const repository = new KyselyMetaEntityAuthoringRepository(tx);
      const source = await repository.get(input.sourceChangeSetId);
      if (!source || source.status !== "published")
        throw new AuthoringPolicyError(
          "PUBLISHED_SOURCE_REQUIRED",
          "Choose a published source for a new working draft",
        );
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${source.tenantId}:${source.entityId}:local-preview`},0))`.execute(
        tx,
      );
      const existing =
        await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.entity_id=${source.entityId}::uuid AND cs.tenant_id IS NOT DISTINCT FROM ${source.tenantId}::uuid AND cs.branch_code='local-preview' AND cs.status IN ('draft','in_review','approved') LIMIT 1`.execute(
          tx,
        );
      if (existing.rows[0]) {
        const current = repository.map(existing.rows[0]);
        if (current.status === "draft" && current.createdBy === input.actorId)
          return current;
        throw new AuthoringConflictError(
          "An open local working draft already exists; open it before creating another",
        );
      }
      const graph = cloneGraphIds(await repository.loadGraph(source.id));
      const draft = await repository.createDraft({
        tenantId: source.tenantId,
        entityId: source.entityId,
        entityCode: source.entityCode,
        branchCode: "local-preview",
        title: `${source.entityCode} working draft`,
        actorId: input.actorId,
      });
      return repository.replaceGraph({
        changeSetId: draft.id,
        expectedRevision: draft.revision,
        graph,
        actorId: input.actorId,
      });
    });
  }
  async createDraft(
    input: Parameters<MetaEntityAuthoringRepository["createDraft"]>[0],
  ) {
    const id = randomUUID(),
      code = `${input.branchCode.replace(/[^a-z0-9_.-]/g, "-")}.${id}`.slice(
        0,
        127,
      );
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(input.entityCode))
      throw new TypeError("Canonical entity code required");
    const registration = parseEntityRegistration(input.registration);
    if (
      input.productBase &&
      (!input.tenantId || registration || input.baseRelease)
    )
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "Product ancestry requires an isolated tenant knowledge draft",
      );
    if (registration && !input.tenantId)
      throw new AuthoringPolicyError(
        "FORBIDDEN",
        "Draft registration requires tenant authoring authority",
      );
    return atomic(this.database, async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.tenantId, input.entityCode])},0))`.execute(
        tx,
      );
      if (input.productBase)
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`system-entity-release:${input.entityId}`},0))`.execute(
          tx,
        );
      if (registration) {
        // Inserts only a draft identity. Conflicts fail; no existing identity,
        // publication, grant, or retired row is reactivated.
        const inserted =
          await sql`INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
        SELECT ${input.entityId}::uuid,${input.tenantId}::uuid,m.id,${input.entityCode},${registration.entityClass}::metadata.entity_class_d,${registration.ownershipModel}::metadata.entity_ownership_d,'draft',${input.actorId}::uuid
        FROM control.module m WHERE m.code=${registration.moduleCode} AND m.status='active' RETURNING id`.execute(
            tx,
          );
        if (inserted.rows.length !== 1)
          throw new AuthoringPolicyError(
            "ENTITY_MODULE_UNAVAILABLE",
            "An active module is required",
          );
      }
      const entity =
        await sql`SELECT id FROM metadata.entity WHERE id=${input.entityId}::uuid
          AND (tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid
            OR (${Boolean(input.productBase)} AND tenant_id IS NULL AND ownership_model='system'))
          AND entity_code=${input.entityCode} AND status IN ('draft','active') ${input.productBase ? sql`` : sql`FOR SHARE`}`.execute(
          tx,
        );
      if (entity.rows.length !== 1)
        throw new AuthoringPolicyError(
          "ENTITY_IDENTITY_UNAVAILABLE",
          "A matching draft or active entity identity is required",
        );
      if (input.baseRelease) {
        const base = (
          await sql`SELECT r.id FROM metadata.entity_release r JOIN metadata.entity_change_set c ON c.id=r.change_set_id
          WHERE r.id=${input.baseRelease.releaseId}::uuid AND r.release_hash=${input.baseRelease.releaseHash}
            AND r.entity_id=${input.entityId}::uuid AND r.tenant_id IS NOT DISTINCT FROM ${input.tenantId}::uuid
            AND c.status='published' AND r.release_kind='publish'
            AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=r.entity_id
              AND newer.tenant_id IS NOT DISTINCT FROM r.tenant_id AND newer.release_no>r.release_no) FOR SHARE OF r`.execute(
            tx,
          )
        ).rows;
        if (base.length !== 1)
          throw new AuthoringConflictError(
            "Draft predecessor is not the current published release for this entity and tenant",
          );
      }
      if (input.productBase) {
        const base = (
          await sql`SELECT r.id FROM metadata.entity_release r
          JOIN metadata.entity_change_set c ON c.id=r.change_set_id AND c.tenant_id IS NULL
          WHERE r.id=${input.productBase.releaseId}::uuid AND r.release_hash=${input.productBase.releaseHash}
            AND r.entity_id=${input.entityId}::uuid AND r.tenant_id IS NULL
            AND c.status='published' AND r.release_kind='publish'
            AND r.contract_signature IS NOT NULL AND r.signature_algorithm='Ed25519'
            AND c.approved_by IS NOT NULL AND c.approved_by<>c.created_by AND c.approved_by IS DISTINCT FROM c.submitted_by
            AND NOT EXISTS(SELECT 1 FROM metadata.entity_release newer WHERE newer.entity_id=r.entity_id
              AND newer.tenant_id IS NULL AND newer.release_no>r.release_no)`.execute(
            tx,
          )
        ).rows;
        if (base.length !== 1)
          throw new AuthoringConflictError(
            "The pinned product predecessor changed",
          );
      }
      const result =
        await sql<ChangeSetRow>`INSERT INTO metadata.entity_change_set(id,tenant_id,entity_id,change_set_code,branch_code,title,created_by,base_release_id)
      VALUES(${id}::uuid,${input.tenantId}::uuid,${input.entityId}::uuid,${code},${input.branchCode},${input.title},${input.actorId}::uuid,${input.baseRelease?.releaseId ?? input.productBase?.releaseId ?? null}::uuid) RETURNING *`.execute(
          tx,
        );
      return this.map({
        ...required(result.rows[0]),
        entity_code: input.entityCode,
      });
    });
  }
  private async localPublicationRow(
    db: Kysely<Database>,
    id: string,
  ): Promise<ChangeSetRow | undefined> {
    const scope = (
      await sql<{
        hash: string | null;
      }>`SELECT NULLIF(current_setting('app.local_publication_request_hash',true),'') AS hash`.execute(
        db,
      )
    ).rows[0]?.hash;
    if (!scope) return undefined;
    const row = (
      await sql<{
        root: ChangeSetRow;
      }>`SELECT root_json || jsonb_build_object('entity_code',graph#>>'{entity,entityCode}') AS root FROM publication.read_native_worker_source(${id}::uuid,4194304)`.execute(
        db,
      )
    ).rows[0]?.root;
    if (!row)
      throw new AuthoringConflictError("Local publication source unavailable");
    return row;
  }
  async get(id: string) {
    const local = await this.localPublicationRow(this.database, id);
    if (local) return this.map(local);
    const result =
      await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${id}::uuid`.execute(
        this.database,
      );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }
  async loadGraph(id: string): Promise<MetaEntityGraph> {
    return this.loadGraphParts(id, false);
  }
  private async loadGraphParts(
    id: string,
    native: boolean,
    expanded = false,
  ): Promise<MetaEntityGraph> {
    const header = required(
      (
        await sql<EntityHeaderRow>`SELECT e.entity_code,e.entity_class,e.ownership_model,to_jsonb(cs) AS label_root FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${id}::uuid`.execute(
          this.database,
        )
      ).rows[0],
    );
    if (
      header.label_root?.native_core_layout_version != null &&
      ![1, 2].includes(header.label_root.native_core_layout_version)
    )
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_VERSION_UNSUPPORTED",
        "Unknown source versions cannot use a legacy decoder.",
      );
    if (
      [1, 2].includes(header.label_root?.native_core_layout_version ?? 0) !==
      native
    )
      throw new AuthoringPolicyError(
        native
          ? "NATIVE_AUTHORING_SOURCE_NOT_INITIALIZED"
          : "NATIVE_AUTHORING_READER_REQUIRED",
        "The reader must match the declared source version.",
      );
    if (
      native &&
      (header.label_root?.native_core_layout_version === 2) !== expanded
    )
      throw new AuthoringPolicyError(
        "NATIVE_AUTHORING_VERSION_UNSUPPORTED",
        "The native reader must match the declared branch inventory.",
      );
    const rows = async (table: GraphTable) => {
      const result =
        table === "entity_class_profile"
          ? await sql<JsonRow>`SELECT to_jsonb(t) AS value FROM metadata.entity_class_profile t WHERE entity_class=${string(header, "entity_class")} LIMIT 1`.execute(
              this.database,
            )
          : table === "entity_relation_target"
            ? await sql<JsonRow>`SELECT to_jsonb(t) || jsonb_build_object('target_entity_code',e.entity_code) AS value FROM metadata.entity_relation_target t JOIN metadata.entity e ON e.id=t.target_entity_id
              WHERE t.change_set_id=${id}::uuid ORDER BY t.id`.execute(
                this.database,
              )
            : await sql<JsonRow>`SELECT to_jsonb(t) AS value FROM ${sql.table(`metadata.${table}`)} t WHERE change_set_id=${id}::uuid ORDER BY id`.execute(
                this.database,
              );
      return result.rows.map((row) => object(row.value));
    };
    const branch = async <T extends object>(
      table: GraphTable,
    ): Promise<T[]> => {
      if (expanded && table === "entity_operation") return [];
      if (
        native &&
        [
          "entity_field",
          "entity_runtime_profile",
          "entity_surface",
          "entity_surface_section",
          "entity_surface_field_binding",
        ].includes(table)
      )
        return [];
      return (await rows(table)).map((row) => {
        const value = decodeRow<T>(row, BRANCH_COLUMNS[table]);
        // Native structural numeric(6,3) weights use their exact decimal DTO;
        // retain the legacy numerical decoder for legacy graphs only.
        if (expanded && table === "entity_search_field" && row.weight != null)
          Reflect.set(value, "weight", String(row.weight));
        return value;
      });
    };
    const ownedLabels = header.label_root?.default_locale
      ? await loadNormalizedLabels(this.database, id)
      : null;
    const referenceMembers = header.label_root?.reference_contract_version
      ? await loadReferenceMembers(this.database, id)
      : null;
    const fieldIdentities = referenceMembers
      ? await loadFieldIdentities(this.database, id)
      : undefined;
    return {
      ...(referenceMembers ? { referenceMembers, fieldIdentities } : {}),
      ...(ownedLabels ? { ownedLabels } : {}),
      contractSchema: referenceMembers
        ? "athyper.meta-entity-contract/2.3"
        : ownedLabels
          ? "athyper.meta-entity-contract/2.2"
          : "athyper.meta-entity-contract/2.1",
      entity: {
        entityCode: string(header, "entity_code"),
        ...(native &&
        header.label_root?.entity_label_id !== undefined &&
        header.label_root?.entity_label_id !== null
          ? { entityLabelId: header.label_root.entity_label_id }
          : {}),
        entityClass: string(header, "entity_class"),
        ownershipModel: string(header, "ownership_model"),
      },
      classProfiles: await branch("entity_class_profile"),
      runtimeProfiles: await branch("entity_runtime_profile"),
      fields: await branch("entity_field"),
      keys: await branch("entity_key"),
      keyFields: await branch("entity_key_field"),
      searchProfiles: await branch("entity_search_profile"),
      searchFields: await branch("entity_search_field"),
      relations: await branch("entity_relation"),
      relationTargets: await branch("entity_relation_target"),
      relationFields: await branch("entity_relation_field"),
      operations: await branch("entity_operation"),
      operationPermissions: await branch("entity_operation_permission"),
      operationRules: await branch("entity_operation_rule"),
      operationScopeBindings: await branch("entity_operation_scope_binding"),
      operationContextRequirements: await branch(
        "entity_operation_context_requirement",
      ),
      fieldReferenceBindings: await branch("entity_field_reference_binding"),
      surfaces: await branch("entity_surface"),
      surfaceSections: await branch("entity_surface_section"),
      surfaceFieldBindings: await branch("entity_surface_field_binding"),
      surfaceOperations: await branch("entity_surface_operation"),
      flows: await branch("entity_flow"),
      flowSteps: await branch("entity_flow_step"),
      policyBindings: await branch("entity_policy_binding"),
      capabilities: await branch("entity_capability"),
      fieldPolicyBindings: await branch("entity_field_policy_binding"),
      numberingBindings: await branch("entity_numbering_binding"),
    };
  }
  async replaceGraph(
    input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
  ) {
    return atomic(this.database, async (tx) => {
      await replaceGraphInTransaction(tx, input);
      return required(
        await new KyselyMetaEntityAuthoringRepository(tx).get(
          input.changeSetId,
        ),
      );
    });
  }
  /** Keeps imported draft creation and graph replacement inside the transfer transaction. */
  async replaceGraphInTransaction(
    input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
    transaction: Kysely<Database>,
  ) {
    await replaceGraphInTransaction(transaction, input);
    return this.map(
      required(
        (
          await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${input.changeSetId}::uuid`.execute(
            transaction,
          )
        ).rows[0],
      ),
    );
  }
  async recordValidation(
    id: string,
    revision: number,
    report: ValidationReport,
    actorId: string,
    nativeSource?: import("@athyper/server-contract-meta-entity-authoring").ExpandedNativeMetaEntityGraph,
  ) {
    const graph = nativeSource ?? (await this.loadGraph(id)),
      current = required(await this.get(id));
    if (
      nativeSource &&
      (current.tenantId !== null ||
        nativeSource.contractSchema !== "athyper.meta-entity-contract/2.5" ||
        nativeSource.authoringSource.sourceKind !== "product" ||
        nativeSource.authoringSource.tenantId !== null ||
        nativeSource.authoringSource.entityId !== current.entityId ||
        nativeSource.ownedLabels?.changeSetId !== id)
    )
      throw new AuthoringPolicyError(
        "NATIVE_PUBLICATION_SOURCE_MISMATCH",
        "Exact native product source required",
      );
    if (current.revision !== revision)
      throw new AuthoringConflictError("Validation revision is stale");
    if (sha256(graph) !== report.contractHash)
      throw new AuthoringConflictError(
        "Validation report does not match the current graph",
      );
    if (current.tenantId === null) {
      await sql`SELECT publication.fn_record_system_entity_validation(${id}::uuid,${revision}::bigint,
        ${canonicalJson(graph)}::jsonb,${JSON.stringify(report)}::jsonb,${actorId}::uuid)`.execute(
        this.database,
      );
      return;
    }
    await atomic(this.database, async (tx) => {
      const locked = (
        await sql`SELECT id FROM metadata.entity_change_set WHERE id=${id}::uuid AND lock_version=${revision} FOR UPDATE`.execute(
          tx,
        )
      ).rows[0];
      if (!locked)
        throw new AuthoringConflictError("Validation revision is stale");
      const parent = (
        await sql<{
          id: string;
          revision_no: number;
          revision_hash: string;
          contract_json: unknown;
          validation_status: string;
        }>`SELECT id,revision_no,revision_hash,contract_json,validation_status FROM snapshot.entity_contract_revision WHERE change_set_id=${id}::uuid ORDER BY revision_no DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      const status = report.issues.length ? "invalid" : "valid";
      if (
        parent &&
        sha256(parent.contract_json) === report.contractHash &&
        parent.validation_status === status
      )
        return;
      // Snapshot revision numbers form their own contiguous chain; authoring lock
      // versions also advance during submit/review and are not snapshot numbers.
      await sql`INSERT INTO snapshot.entity_contract_revision(tenant_id,entity_id,change_set_id,revision_no,parent_revision_id,parent_revision_hash,base_release_id,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,validation_status,validation_diagnostics,captured_by)
        SELECT ${current.tenantId}::uuid,${current.entityId}::uuid,${id}::uuid,${parent ? Number(parent.revision_no) + 1 : 1},${parent?.id ?? null}::uuid,${parent?.revision_hash ?? null},base_release_id,'athyper.meta-entity-contract','2.1',${canonicalJson(graph)}::jsonb,${report.contractHash},${sha256({ report, revision })},${Buffer.byteLength(canonicalJson(graph))},${status},${JSON.stringify(report.issues)}::jsonb,${actorId}::uuid FROM metadata.entity_change_set WHERE id=${id}::uuid`.execute(
        tx,
      );
    });
  }

  async recordTestRun(
    id: string,
    revision: number,
    report: ContractTestReport,
    actorId: string,
  ) {
    const graph = await this.loadGraph(id),
      current = required(await this.get(id));
    if (current.revision !== revision)
      throw new AuthoringConflictError("Test revision is stale");
    if (sha256(graph) !== report.contractHash)
      throw new AuthoringConflictError(
        "Test report does not match the current graph",
      );
    if (!current.tenantId) return;
    await sql`INSERT INTO snapshot.entity_contract_test_run(tenant_id,source_tenant_id,entity_id,change_set_id,source_lock_version,contract_schema_code,contract_schema_version,source_contract_json,source_contract_hash,runner_code,runner_version,status,total_count,passed_count,failed_count,error_count,duration_ms,run_hash,executed_by)
      VALUES(${current.tenantId}::uuid,${current.tenantId}::uuid,${current.entityId}::uuid,${id}::uuid,${revision},'athyper.meta-entity-contract','2.1',${canonicalJson(graph)}::jsonb,${report.contractHash},'athyper.contract-tests','1.0.0',${report.passed ? "passed" : "failed"},${report.results.length},${report.results.filter((x) => x.passed).length},${report.results.filter((x) => !x.passed).length},0,0,${sha256(report)},${actorId}::uuid)`.execute(
      this.database,
    );
  }
  async transition(
    input: Parameters<MetaEntityAuthoringRepository["transition"]>[0],
  ) {
    const current = required(await this.get(input.changeSetId));
    if (current.tenantId === null) {
      const result =
        await sql<ChangeSetRow>`SELECT * FROM publication.fn_transition_system_entity_change_set(
        ${input.changeSetId}::uuid,${input.expectedRevision}::bigint,${input.from},${input.to},${input.actorId}::uuid)`.execute(
          this.database,
        );
      if (!result.rows[0])
        throw new AuthoringConflictError("Stale authoring revision or state");
      return this.map({ ...result.rows[0], entity_code: current.entityCode });
    }
    const result =
      await sql<ChangeSetRow>`UPDATE metadata.entity_change_set SET status=${input.to}::metadata.entity_change_set_status_d,status_changed_by=${input.actorId}::uuid,rejection_reason=${input.to === "rejected" ? (input.breakGlass?.reason ?? "Rejected by reviewer") : null} WHERE id=${input.changeSetId}::uuid AND lock_version=${input.expectedRevision} AND status=${input.from}::metadata.entity_change_set_status_d RETURNING *`.execute(
        this.database,
      );
    if (!result.rows[0])
      throw new AuthoringConflictError("Stale authoring revision or state");
    return this.map(result.rows[0]);
  }
  async createRelease(
    input: Parameters<MetaEntityAuthoringRepository["createRelease"]>[0],
  ) {
    if (
      input.expectedSourceReleaseId === null &&
      (!input.expectedContractHash || !this.prepareRelease)
    )
      throw new AuthoringConflictError(
        "First publication requires a reviewed source pin and publication preparation",
      );
    return atomic(this.database, async (tx) => {
      const current = required(
        (await this.localPublicationRow(tx, input.changeSetId)) ??
          (
            await sql<{
              tenant_id: string | null;
            }>`SELECT tenant_id FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid`.execute(
              tx,
            )
          ).rows[0],
      );
      if (current.tenant_id === null) {
        if (
          input.releaseKind !== "publish" ||
          input.expectedSourceReleaseId === undefined ||
          !this.prepareRelease ||
          input.expectedContractHash !== input.artifact.contractHash
        )
          throw new AuthoringConflictError(
            "System publication requires explicit enrolled release pins",
          );
        const releaseId = randomUUID();
        const release = required(
          (
            await (
              input.expectedSourceReleaseId === null
                ? sql<ReleaseRow>`SELECT * FROM publication.fn_create_system_entity_release(
          ${releaseId}::uuid,${input.changeSetId}::uuid,${input.expectedRevision}::bigint,
          ${JSON.stringify(input.artifact)}::jsonb,${input.targetPlanes}::text[],${input.actorId}::uuid)`
                : sql<ReleaseRow>`SELECT * FROM publication.fn_create_system_entity_successor(
          ${releaseId}::uuid,${input.changeSetId}::uuid,${input.expectedRevision}::bigint,${input.expectedSourceReleaseId}::uuid,
          ${JSON.stringify(input.artifact)}::jsonb,${input.targetPlanes}::text[],${input.actorId}::uuid)`
            ).execute(tx)
          ).rows[0],
        );
        await this.prepareRelease(tx, {
          releaseId,
          artifact: input.artifact,
          targetPlanes: input.targetPlanes,
        });
        return { id: releaseId, releaseNo: Number(release.release_no) };
      }
      const cs = required(
        (
          await sql<ChangeSetRow>`SELECT * FROM metadata.entity_change_set WHERE id=${input.changeSetId}::uuid AND lock_version=${input.expectedRevision} AND status='approved' FOR UPDATE`.execute(
            tx,
          )
        ).rows[0],
      );
      // Tenant knowledge drafts may reference a shared product identity. They
      // cannot enter the legacy full-entity publication path: compiled extension
      // delivery and runtime ancestry admission must be registered first.
      const sharedProduct = (
        await sql<{
          shared_product: boolean;
        }>`SELECT EXISTS(SELECT 1 FROM metadata.entity
        WHERE id=${cs["entity_id"]}::uuid AND tenant_id IS NULL AND ownership_model='system') AS shared_product`.execute(
          tx,
        )
      ).rows[0];
      if (sharedProduct?.shared_product)
        throw new AuthoringPolicyError(
          "LEARNING_EXTENSION_PUBLICATION_UNAVAILABLE",
          "Tenant product extensions require qualified compiled publication and runtime ancestry admission",
        );
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${cs["tenant_id"] ?? "global"}:${cs["entity_id"]}`},0))`.execute(
        tx,
      );
      const revision =
        input.releaseKind === "rollback"
          ? required(
              (
                await sql<RevisionRow>`SELECT revision.id,revision.revision_no,revision.revision_hash,revision.contract_hash FROM metadata.entity_release prior JOIN snapshot.entity_contract_revision revision ON revision.id=prior.revision_id WHERE prior.id=${input.rollbackOfReleaseId ?? null}::uuid AND prior.entity_id=${cs["entity_id"]}::uuid AND prior.tenant_id IS NOT DISTINCT FROM ${cs["tenant_id"]}::uuid LIMIT 1`.execute(
                  tx,
                )
              ).rows[0],
            )
          : required(
              (
                await sql<RevisionRow>`SELECT id,revision_no,revision_hash,contract_hash,contract_json FROM snapshot.entity_contract_revision WHERE change_set_id=${input.changeSetId}::uuid AND validation_status='valid' ORDER BY revision_no DESC LIMIT 1`.execute(
                  tx,
                )
              ).rows[0],
            );
      if (
        (revision.contract_json
          ? sha256(revision.contract_json)
          : String(revision["contract_hash"])) !== input.artifact.contractHash
      )
        throw new AuthoringConflictError(
          "Signed artifact does not match the current validated revision",
        );
      const previous = (
        await sql<ReleaseRow>`SELECT id,release_no FROM metadata.entity_release WHERE entity_id=${cs["entity_id"]}::uuid AND tenant_id IS NOT DISTINCT FROM ${cs["tenant_id"]}::uuid ORDER BY release_no DESC LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      if (
        input.expectedContractHash !== undefined &&
        input.artifact.contractHash !== input.expectedContractHash
      )
        throw new AuthoringConflictError(
          "Signed artifact does not match the reviewed source pin",
        );
      if (
        input.expectedSourceReleaseId !== undefined &&
        (previous?.id ?? null) !== input.expectedSourceReleaseId
      )
        throw Error("DEV_PUBLICATION_SOURCE_CHANGED");
      const releaseId = randomUUID(),
        releaseNo = previous ? Number(previous["release_no"]) + 1 : 1;
      await sql`INSERT INTO metadata.entity_release(id,tenant_id,entity_id,change_set_id,revision_id,release_no,release_kind,supersedes_release_id,rollback_of_release_id,contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,signature_algorithm,signing_key_id,contract_signature,published_by) VALUES(${releaseId}::uuid,${cs["tenant_id"] ?? null}::uuid,${cs["entity_id"]}::uuid,${input.changeSetId}::uuid,${revision["id"]}::uuid,${releaseNo},${input.releaseKind},${previous?.["id"] ?? null}::uuid,${input.rollbackOfReleaseId ?? null}::uuid,'athyper.meta-entity-contract','2.1',${input.artifact.contractHash},${revision["revision_hash"]},${input.artifact.descriptorHash},'backward_compatible',${input.targetPlanes}::text[],${input.artifact.signatureAlgorithm},${input.artifact.signingKeyId},${input.artifact.signature},${input.actorId}::uuid)`.execute(
        tx,
      );
      if (this.prepareRelease)
        await this.prepareRelease(tx, {
          releaseId,
          artifact: input.artifact,
          targetPlanes: input.targetPlanes,
        });
      return { id: releaseId, releaseNo };
    });
  }
  async getSignedRelease(id: string) {
    // Coordinated recovery must redispatch the originally signed native graph,
    // not pair its signature with a target-specific descriptor or SQL ledger hash.
    const native = (
      await sql<{
        contract_json: MetaEntityGraph | ExpandedNativeMetaEntityGraph;
        contract_signature: string;
        signature_algorithm: string;
        signing_key_id: string;
        source_contract_hash: string;
        source_descriptor_hash: string;
        target_planes: string[];
        artifacts: Parameters<typeof readNativeSignedRelease>[0]["artifacts"];
      }>`SELECT s.contract_json,r.contract_signature,
      r.signature_algorithm,r.signing_key_id,r.target_planes,
      p.metadata->>'sourceContractHash' source_contract_hash,
      p.metadata->>'sourceDescriptorHash' source_descriptor_hash,
      (SELECT jsonb_agg(jsonb_build_object('plane',a.plane_key,'descriptor',a.compiled_json,'compliance',a.compliance_report) ORDER BY a.plane_key)
        FROM snapshot.entity_release_artifact a WHERE a.source_release_id=r.id AND a.source_revision_id=r.revision_id AND a.entity_id=r.entity_id AND a.tenant_id IS NULL) artifacts
      FROM metadata.entity_release r
      JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.entity_id=r.entity_id AND s.tenant_id IS NULL
      JOIN publication.entity_release_link l ON l.entity_release_id=r.id
      JOIN publication.release p ON p.id=l.publication_release_id
      WHERE r.id=${id}::uuid AND r.tenant_id IS NULL AND p.tenant_id=shared.current_tenant_id_soft()
        AND p.metadata ? 'humanExecutionPolicy' AND r.published_by=master.current_principal_id_soft()`.execute(
        this.database,
      )
    ).rows[0];
    if (
      native &&
      Reflect.get(native.contract_json, "contractSchema") ===
        "athyper.meta-entity-contract/2.5"
    )
      return readNativeSignedRelease(native);
    if (native)
      return {
        ...compileGraph(native.contract_json as MetaEntityGraph),
        signature: native.contract_signature,
        signatureAlgorithm: native.signature_algorithm,
        signingKeyId: native.signing_key_id,
      };
    const result =
      await sql<ArtifactRow>`SELECT r.contract_hash,r.signature_algorithm,r.signing_key_id,r.contract_signature,a.compiled_hash,a.compiled_json FROM metadata.entity_release r JOIN snapshot.entity_release_artifact a ON a.source_release_id=r.id WHERE r.id=${id}::uuid ORDER BY a.plane_key LIMIT 1`.execute(
        this.database,
      );
    const row = result.rows[0];
    if (!row) {
      const source = (
        await sql<
          Record<string, unknown>
        >`SELECT r.contract_signature,r.signature_algorithm,r.signing_key_id,s.contract_json FROM metadata.entity_release r JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id AND s.tenant_id=r.tenant_id WHERE r.id=${id}::uuid AND r.tenant_id=shared.current_tenant_id()`.execute(
          this.database,
        )
      ).rows[0];
      if (!source?.contract_signature) return null;
      const compiled = compileGraph(source.contract_json as MetaEntityGraph);
      if (!compiled.descriptor.collectionRelationship) return null;
      return {
        ...compiled,
        signature: String(source.contract_signature),
        signatureAlgorithm: String(source.signature_algorithm),
        signingKeyId: String(source.signing_key_id),
      } as SignedMetaEntityArtifact;
    }
    return {
      schema: "athyper.entity-runtime-descriptor/1.0",
      compiler: { name: "@athyper/meta-entity-compiler", version: "1.0.0" },
      contractHash: string(row, "contract_hash"),
      descriptorHash: string(row, "compiled_hash"),
      descriptor: object(row["compiled_json"]),
      signatureAlgorithm: string(row, "signature_algorithm"),
      signingKeyId: string(row, "signing_key_id"),
      signature: string(row, "contract_signature"),
    } as SignedMetaEntityArtifact;
  }
  private map(row: ChangeSetRow): MetaEntityChangeSet {
    return {
      id: string(row, "id"),
      tenantId: row.tenant_id === null ? null : string(row, "tenant_id"),
      entityId: string(row, "entity_id"),
      entityCode:
        typeof row.entity_code === "string" ? row.entity_code : "unknown",
      branchCode: string(row, "branch_code"),
      status: string(row, "status") as MetaEntityChangeSet["status"],
      revision: Number(row.lock_version),
      createdBy: string(row, "created_by"),
      ...(typeof row.submitted_by === "string"
        ? { submittedBy: row.submitted_by }
        : {}),
      ...(typeof row.reviewed_by === "string"
        ? { reviewedBy: row.reviewed_by }
        : {}),
      ...(typeof row.approved_by === "string"
        ? { approvedBy: row.approved_by }
        : {}),
    };
  }
}
type JsonObject = { readonly [key: string]: unknown };
type GraphTable = keyof typeof BRANCH_COLUMNS;
async function replaceGraphInTransaction(
  db: Kysely<Database>,
  input: Parameters<MetaEntityAuthoringRepository["replaceGraph"]>[0],
) {
  input = {
    ...input,
    graph: normalizeGraphStorageOrder(
      await bindCanonicalRelationTargets(db, input.changeSetId, input.graph),
    ),
  };
  try {
    assertCanonicalRelationAuthoring(input.graph);
  } catch (error) {
    throw new AuthoringPolicyError(
      "ENTITY_RELATION_AUTHORING_INVALID",
      (error as Error).message,
    );
  }
  if (input.graph.referenceMembers !== undefined) {
    if (
      canonicalJson(await loadReferenceMembers(db, input.changeSetId)) !==
        canonicalJson(input.graph.referenceMembers) ||
      canonicalJson(await loadFieldIdentities(db, input.changeSetId)) !==
        canonicalJson(input.graph.fieldIdentities)
    )
      throw new AuthoringPolicyError(
        "NORMALIZED_COMMAND_REQUIRED",
        "Use typed commands to change normalized reference members",
      );
  }
  if (input.graph.ownedLabels !== undefined) {
    const stored = await loadNormalizedLabels(db, input.changeSetId);
    if (canonicalJson(stored) !== canonicalJson(input.graph.ownedLabels))
      throw new AuthoringPolicyError(
        "NORMALIZED_COMMAND_REQUIRED",
        "Use typed commands to change normalized labels",
      );
  }
  const validation = validateGraph(input.graph);
  if (validation.issues.length) {
    const issue = validation.issues[0]!;
    throw new AuthoringPolicyError(
      "ENTITY_GRAPH_INVALID",
      `${issue.path}: ${issue.message}`,
    );
  }
  if (input.graph.classProfiles?.length) {
    const classRow = required(
      (
        await sql<JsonRow>`SELECT to_jsonb(profile) AS value FROM metadata.entity_class_profile profile JOIN metadata.entity entity ON entity.entity_class=profile.entity_class JOIN metadata.entity_change_set change_set ON change_set.entity_id=entity.id WHERE change_set.id=${input.changeSetId}::uuid`.execute(
          db,
        )
      ).rows[0],
    );
    const persisted = decodeRow(
      object(classRow.value),
      BRANCH_COLUMNS.entity_class_profile,
    );
    if (canonicalJson(input.graph.classProfiles) !== canonicalJson([persisted]))
      throw new AuthoringConflictError(
        "Entity class profiles are immutable platform-owned defaults",
      );
  }
  assertNoRetiredNativeGraphBranches(input.graph);
  const locked = required(
    (
      await sql<ChangeSetRow>`SELECT cs.*,e.entity_code FROM metadata.entity_change_set cs JOIN metadata.entity e ON e.id=cs.entity_id WHERE cs.id=${input.changeSetId}::uuid FOR UPDATE OF cs`.execute(
        db,
      )
    ).rows[0],
  );
  if (locked.native_core_layout_version != null)
    throw new AuthoringPolicyError(
      "NATIVE_AUTHORING_COMMAND_REQUIRED",
      "Legacy graph replacement cannot mutate a native source.",
    );
  if (locked.entity_code !== input.graph.entity.entityCode)
    throw new AuthoringPolicyError(
      "AUTHORING_ENTITY_IDENTITY_MISMATCH",
      "The graph must belong to the locked draft entity.",
    );
  if (Number(locked.lock_version) !== input.expectedRevision)
    throw new AuthoringConflictError(
      "Stale authoring revision; reload before retrying",
    );
  if (locked.status !== "draft" && locked.status !== "rejected")
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_EDITABLE",
      "Only draft or rejected graphs can be edited.",
    );
  input = {
    ...input,
    graph: {
      ...input.graph,
      operations: await preserveOperationProtectedState(
        db,
        input.changeSetId,
        input.graph.operations,
      ),
    },
  };
  const coordinate = {
    tenant_id: locked.tenant_id ?? null,
    entity_id: locked.entity_id,
    change_set_id: input.changeSetId,
    created_by: input.actorId,
  };
  const branches: [
    Exclude<GraphTable, "entity_class_profile">,
    readonly object[] | undefined,
  ][] = [
    ["entity_runtime_profile", input.graph.runtimeProfiles],
    ["entity_field", input.graph.fields],
    ["entity_key", input.graph.keys],
    ["entity_key_field", input.graph.keyFields],
    ["entity_search_profile", input.graph.searchProfiles],
    ["entity_search_field", input.graph.searchFields],
    ["entity_relation", input.graph.relations],
    ["entity_relation_target", input.graph.relationTargets],
    ["entity_relation_field", input.graph.relationFields],
    // Operation reference guards require their target surfaces to exist first.
    ["entity_surface", input.graph.surfaces],
    ["entity_operation", input.graph.operations],
    ["entity_operation_permission", input.graph.operationPermissions],
    ["entity_operation_rule", input.graph.operationRules],
    ["entity_operation_scope_binding", input.graph.operationScopeBindings],
    [
      "entity_operation_context_requirement",
      input.graph.operationContextRequirements,
    ],
    ["entity_field_reference_binding", input.graph.fieldReferenceBindings],
    ["entity_surface_section", input.graph.surfaceSections],
    ["entity_surface_field_binding", input.graph.surfaceFieldBindings],
    ["entity_surface_operation", input.graph.surfaceOperations],
    ["entity_flow", input.graph.flows],
    ["entity_flow_step", input.graph.flowSteps],
    ["entity_policy_binding", input.graph.policyBindings],
    ["entity_capability", input.graph.capabilities],
    ["entity_field_policy_binding", input.graph.fieldPolicyBindings],
    ["entity_numbering_binding", input.graph.numberingBindings],
  ];
  const plans = await readReconciliationPlans(db, input.changeSetId, branches);
  if (!plans.some(changed)) return;
  const advanced =
    await sql<AdvanceRow>`SELECT metadata.fn_advance_entity_change_set(${input.changeSetId}::uuid,${input.expectedRevision},${input.actorId}::uuid) AS revision`
      .execute(db)
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          Reflect.get(error, "code") === "40001"
        )
          throw new AuthoringConflictError(
            "Stale authoring revision; reload the saved graph before retrying",
          );
        throw error;
      });
  if (Number(advanced.rows[0]?.["revision"]) !== input.expectedRevision + 1)
    throw new AuthoringConflictError("Stale authoring revision");
  await captureDraftSave(
    db,
    input.changeSetId,
    input.expectedRevision,
    input.actorId,
    "previous",
  );
  await writeReconciliationPlans(db, plans, coordinate);
  await sql`SELECT metadata.fn_validate_entity_graph(${input.changeSetId}::uuid)`.execute(
    db,
  );
  if (locked.reference_contract_version === 1)
    await sql`SELECT metadata.validate_reference_members(${input.changeSetId}::uuid)`.execute(
      db,
    );
  await captureDraftSave(
    db,
    input.changeSetId,
    input.expectedRevision + 1,
    input.actorId,
    "saved",
  );
}
async function assertHistoricalCommandSource(
  db: Kysely<Database>,
  id: string,
  tenant: string | null,
) {
  const row = (
    await sql<{
      source: Record<string, unknown>;
    }>`SELECT to_jsonb(cs) AS source FROM metadata.entity_change_set cs WHERE id=${id}::uuid AND tenant_id IS NOT DISTINCT FROM ${tenant}::uuid FOR UPDATE`.execute(
      db,
    )
  ).rows[0];
  if (!row)
    throw new AuthoringPolicyError(
      "AUTHORING_DRAFT_NOT_FOUND",
      "Scoped source unavailable.",
    );
  if (row.source.native_core_layout_version != null)
    throw new AuthoringPolicyError(
      "NATIVE_AUTHORING_COMMAND_REQUIRED",
      "Native labels/reference editing requires a version-aware complete snapshot protocol.",
    );
  return row.source;
}
async function captureDraftSave(
  db: Kysely<Database>,
  id: string,
  revision: number,
  actor: string,
  kind: string,
) {
  const repository = new KyselyMetaEntityAuthoringRepository(db);
  const current = required(await repository.get(id));
  const graph = await repository.loadGraph(id);
  await sql`INSERT INTO snapshot.entity_draft_save(change_set_id,lock_version,tenant_id,graph,graph_hash,captured_by,capture_kind)
    VALUES(${id}::uuid,${revision},${current.tenantId}::uuid,${canonicalJson(graph)}::jsonb,${sha256(graph)},${actor}::uuid,${kind}) ON CONFLICT(change_set_id,lock_version) DO NOTHING`.execute(
    db,
  );
  const existing = await repository.readDraftSave(id, revision);
  if (!existing || sha256(existing) !== sha256(graph))
    throw new AuthoringConflictError(
      "Saved revision already contains different content",
    );
}
function decodeRow<T extends object>(
  row: JsonObject,
  columns: readonly string[],
): T {
  const result: Record<string, unknown> = {};
  for (const property of columns) {
    const value = row[snakeKey(property)];
    if (value !== null && value !== undefined)
      result[property] = NUMERIC_PROPERTIES.has(property)
        ? Number(value)
        : value;
  }
  return result as T;
}
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error("META_ENTITY_ROW_NOT_FOUND");
  return v;
}
function string(row: object, key: string) {
  const v = Reflect.get(row, key);
  if (typeof v !== "string") throw new Error(`META_ENTITY_ROW_INVALID:${key}`);
  return v;
}
function object(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as JsonObject)
    : {};
}
const NUMERIC_PROPERTIES = new Set([
  "position",
  "priority",
  "weight",
  "profileVersion",
  "draftTtlHours",
  "minimumQueryLength",
  "columnCount",
  "columnSpan",
  "lifecycleRevision",
  "policyRevision",
  "deprecatedSinceReleaseNo",
  "plannedRemovalReleaseNo",
]);

function atomic<T>(
  database: Kysely<Database>,
  work: (transaction: Transaction<Database>) => Promise<T>,
  serializable = false,
): Promise<T> {
  return database.isTransaction
    ? work(database as Transaction<Database>)
    : serializable
      ? database.transaction().setIsolationLevel("serializable").execute(work)
      : database.transaction().execute(work);
}
