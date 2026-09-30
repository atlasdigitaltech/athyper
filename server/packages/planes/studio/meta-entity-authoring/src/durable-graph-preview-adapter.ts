import type { CompiledMetaEntityArtifact } from "@athyper/server-contract-meta-entity-authoring";
import {
  DurableGraphPreviewStore,
  type PreviewClaim,
} from "./durable-graph-preview.js";
import {
  createMetaEntityGraphPreview,
  type GraphPreviewInput,
  type MetaEntityGraphPreview,
  type GraphPreviewStatus,
} from "./graph-preview.js";
import type { GraphDependency } from "./graph-dependencies.js";
import { sha256 } from "./deterministic.js";

export interface DurablePreviewAdapterOptions {
  store: DurableGraphPreviewStore;
  privateKey: string;
  /** Must check native saved revision and current caller authority. */
  assertCurrent(input: GraphPreviewInput): Promise<void>;
  resolve(
    input: GraphPreviewInput,
    dependencies: readonly GraphDependency[],
  ): Promise<void>;
  /** Returns complete validated descriptors AND effective operation bindings.
   * Registry and catalog qualification must finish before this resolves. */
  project(
    input: GraphPreviewInput,
    artifact: CompiledMetaEntityArtifact,
  ): Promise<Readonly<Record<string, unknown>>>;
}

function createInvocation(
  options: DurablePreviewAdapterOptions,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Claims identify in-flight work only. Durable status and active artifacts live
  // in SQLite; restarting the process does not remove the previous active head.
  const claims = new Map<string, PreviewClaim>();
  const required = (id: string) => {
    const claim = claims.get(id);
    if (!claim) throw Error("GRAPH_PREVIEW_CLAIM_UNAVAILABLE");
    return claim;
  };
  const preview = createMetaEntityGraphPreview(
    {
      async claim(input) {
        await options.assertCurrent(input);
        const claim = options.store.claim({
          tenantId: input.changeSet.tenantId!,
          entityCode: input.changeSet.entityCode,
          changeSetId: input.changeSet.id,
          revision: input.changeSet.revision,
          graphHash: sha256(input.graph),
        });
        claims.set(claim.id, claim);
        return claim.id;
      },
      async current(id) {
        return options.store.current(required(id));
      },
      resolve: options.resolve,
      async prepare(input, artifact, id) {
        const claim = required(id);
        if (artifact.contractHash !== claim.graphHash)
          throw Error("GRAPH_PREVIEW_COMPILED_SOURCE_MISMATCH");
        const projections = await options.project(input, artifact);
        const sealed = options.store.seal(
          claim,
          projections,
          options.privateKey,
        );
        return {
          async commit() {
            await options.assertCurrent(input);
            return options.store.commit(claim, sealed);
          },
          async discard() {
            /* Staged bytes are in memory; active durable rows were never changed. */
          },
        };
      },
      async record(id, status) {
        options.store.record(required(id), status);
      },
    },
    env,
  );
  return preview;
}

export function createDurableGraphPreview(
  options: DurablePreviewAdapterOptions,
  env: NodeJS.ProcessEnv = process.env,
) {
  const enrich = (
    tenantId: string,
    entityCode: string,
    status: GraphPreviewStatus,
  ): GraphPreviewStatus => {
    const active = options.store.read({ tenantId, entityCode });
    return {
      ...status,
      ...(active
        ? {
            activeRevision: active.revision,
            activeChangeSetId: active.changeSetId,
          }
        : {}),
    };
  };
  return {
    async status(changeSet) {
      if (!changeSet.tenantId) return undefined;
      const status = options.store.status({
        tenantId: changeSet.tenantId,
        entityCode: changeSet.entityCode,
      }) as GraphPreviewStatus | undefined;
      if (!status) return undefined;
      return enrich(changeSet.tenantId, changeSet.entityCode, status);
    },
    async saved(input) {
      const result = await createInvocation(options, env).saved(input);
      return enrich(
        input.changeSet.tenantId!,
        input.changeSet.entityCode,
        result,
      );
    },
  } satisfies MetaEntityGraphPreview;
}
