import type {
  CompiledMetaEntityArtifact,
  MetaEntityChangeSet,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  compileGraph,
  runContractTests,
  validateGraph,
} from "./deterministic.js";
import {
  graphDependencies,
  type GraphDependency,
} from "./graph-dependencies.js";

export interface GraphPreviewInput {
  readonly context?: VerifiedRequestContext;
  readonly changeSet: MetaEntityChangeSet;
  readonly graph: MetaEntityGraph;
  readonly actorId: string;
}
export interface GraphPreviewStatus {
  readonly activeChangeSetId?: string;
  readonly developmentEvidence: true;
  readonly changeSetId: string;
  readonly savedRevision: number;
  readonly state: "compiling" | "active" | "failed" | "superseded";
  readonly activeRevision?: number;
  readonly contractHash?: string;
  readonly error?: string;
}
export interface MetaEntityGraphPreview {
  status?(
    changeSet: MetaEntityChangeSet,
  ): Promise<GraphPreviewStatus | undefined>;
  saved(input: GraphPreviewInput): Promise<GraphPreviewStatus>;
}

/** A prepared set must include every affected consumer. Its commit is a single
 * compare-and-swap of the activation head, not sequential plane activation. */
export interface PreparedGraphPreview {
  commit(): Promise<boolean>;
  discard(): Promise<void>;
}
export interface GraphPreviewPorts {
  /** Persist the latest save and return a unique claim, ordered across processes. */
  claim(input: GraphPreviewInput): Promise<string>;
  current(claim: string): Promise<boolean>;
  resolve(
    input: GraphPreviewInput,
    dependencies: readonly GraphDependency[],
  ): Promise<void>;
  /** Native runtime projection/registry checks, development signing and staging.
   * No release, human approval, grants or application data may be created here. */
  prepare(
    input: GraphPreviewInput,
    artifact: CompiledMetaEntityArtifact,
    claim: string,
  ): Promise<PreparedGraphPreview>;
  /** Store only if claim remains current; retain the previous active head on failure. */
  record(claim: string, status: GraphPreviewStatus): Promise<void>;
}

export function assertGraphPreviewEnvironment(env: NodeJS.ProcessEnv): void {
  if (
    env.ATHYPER_LOCAL_WORKSPACE !== "1" ||
    env.ATHYPER_ENV !== "local" ||
    env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test"
  ) {
    throw new Error("GRAPH_PREVIEW_LOCAL_WORKSPACE_REQUIRED");
  }
}

/** Uses the release compiler for the entire graph, without a cosmetic allowlist.
 * Runtime support and external dependencies are checked before any activation. */
export function createMetaEntityGraphPreview(
  ports: GraphPreviewPorts,
  env: NodeJS.ProcessEnv = process.env,
): MetaEntityGraphPreview {
  assertGraphPreviewEnvironment(env);
  return {
    async saved(original) {
      // The caller cannot change signed content while asynchronous work is running.
      const input = structuredClone(original);
      if (
        !input.changeSet.tenantId ||
        input.changeSet.status !== "draft" ||
        input.graph.entity.entityCode !== input.changeSet.entityCode
      ) {
        throw new Error("GRAPH_PREVIEW_TENANT_DRAFT_REQUIRED");
      }
      const claim = await ports.claim(input);
      const base = {
        developmentEvidence: true as const,
        changeSetId: input.changeSet.id,
        savedRevision: input.changeSet.revision,
      };
      let prepared: PreparedGraphPreview | undefined;
      let activated = false;
      let result: GraphPreviewStatus;
      try {
        await ports.record(claim, { ...base, state: "compiling" });
        const validation = validateGraph(input.graph);
        if (validation.issues.length)
          throw new Error(
            validation.issues
              .map((issue) => `${issue.code}:${issue.path}`)
              .join("; "),
          );
        const tests = runContractTests(input.graph);
        if (!tests.passed)
          throw new Error(
            `GRAPH_PREVIEW_CONTRACT_TESTS_FAILED:${tests.results
              .filter((test) => !test.passed)
              .map((test) => test.key)
              .join(",")}`,
          );
        const artifact = compileGraph(input.graph);
        await ports.resolve(input, graphDependencies(input.graph));
        if (!(await ports.current(claim)))
          return { ...base, state: "superseded" };
        prepared = await ports.prepare(input, artifact, claim);
        // prepare may take longer than a subsequent save. Commit must also check
        // the durable claim atomically; this check alone is not a lock.
        activated = (await ports.current(claim)) && (await prepared.commit());
        result = {
          ...base,
          state: activated ? "active" : "superseded",
          contractHash: artifact.contractHash,
          ...(activated ? { activeRevision: input.changeSet.revision } : {}),
        };
      } catch (error) {
        result = {
          ...base,
          state: "failed",
          error:
            error instanceof Error ? error.message : "GRAPH_PREVIEW_FAILED",
        };
      } finally {
        if (prepared && !activated) await prepared.discard();
      }
      await ports.record(claim, result);
      return result;
    },
  };
}
