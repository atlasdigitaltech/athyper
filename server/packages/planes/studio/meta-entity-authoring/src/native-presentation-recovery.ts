import {
  AuthoringPolicyError,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";
import { buildNativeSuccessorGraph } from "./native-successor-graph.js";

/** Authoring only. The existing bootstrap command resolves and admits the current
 * predecessor again. Historical authorization, identities and resources never
 * enter the successor; only explicitly selected presentation values do. */
export function buildNativePresentationRecovery(input: {
  current: Parameters<typeof buildNativeSuccessorGraph>[0];
  historical: {
    source: ExpandedNativeMetaEntityGraph;
    sourceHash: string;
    sourceReleaseId: string;
  };
  selections: readonly {
    surfaceKey: string;
    viewKey: string;
    property: "density";
  }[];
}) {
  const fail = (message: string): never => {
    throw new AuthoringPolicyError(
      "NATIVE_PRESENTATION_RECOVERY_INVALID",
      message,
    );
  };
  if (input.current.targetEnrollment) fail("Recovery cannot enroll targets.");
  const old = input.historical;
  if (
    old.source.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    sha256(old.source) !== old.sourceHash ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      old.sourceReleaseId,
    ) ||
    old.source.authoringSource.entityId !==
      input.current.source.authoringSource.entityId ||
    old.source.authoringSource.tenantId !== null ||
    old.source.authoringSource.sourceKind !== "product"
  )
    fail(
      "Resolve an exact historical native source for the same product entity.",
    );
  if (
    !Array.isArray(input.selections) ||
    !input.selections.length ||
    input.selections.length > 256
  )
    fail("Select at least one supported presentation property.");
  const seen = new Set<string>();
  const changes = input.selections.map((selection) => {
    if (
      !selection ||
      Object.keys(selection).sort().join() !== "property,surfaceKey,viewKey" ||
      selection.property !== "density" ||
      typeof selection.surfaceKey !== "string" ||
      !selection.surfaceKey ||
      typeof selection.viewKey !== "string" ||
      !selection.viewKey
    )
      fail("Only explicit list-view density recovery is currently supported.");
    const key = JSON.stringify([
      selection.surfaceKey,
      selection.viewKey,
      selection.property,
    ]);
    if (seen.has(key)) fail("Duplicate recovery selection.");
    seen.add(key);
    const resolve = (graph: ExpandedNativeMetaEntityGraph) => {
      const surfaces = graph.surfaces.filter(
        (s) =>
          s.surfaceKey === selection.surfaceKey && s.surfaceKind === "list",
      );
      const views =
        graph.referenceMembers?.members.surfaceView.filter(
          (v) =>
            surfaces.length === 1 &&
            v.entitySurfaceId === surfaces[0]!.id &&
            v.viewKey === selection.viewKey,
        ) ?? [];
      if (views.length !== 1)
        return fail(
          "Selected surface/view must resolve uniquely in both sources.",
        );
      if (
        !["comfortable", "compact", "spacious"].includes(
          views[0]!.density ?? "",
        )
      )
        fail("Selected density is invalid.");
      return views[0]!;
    };
    const current = resolve(input.current.source),
      historical = resolve(old.source);
    return {
      ...selection,
      currentId: current.id,
      before: current.density,
      after: historical.density,
    };
  });
  if (changes.every((c) => c.before === c.after))
    fail("Recovery would not change presentation.");
  const result = buildNativeSuccessorGraph(input.current);
  const references = result.graph.referenceMembers!;
  const graph = {
    ...result.graph,
    referenceMembers: {
      ...references,
      members: {
        ...references.members,
        surfaceView: references.members.surfaceView.map((row) => {
          const change = changes.find(
            (c) => result.memberIds[c.currentId] === row.id,
          );
          return change ? { ...row, density: change.after } : row;
        }),
      },
    },
  };
  return {
    ...result,
    graph,
    recovery: {
      historicalReleaseId: old.sourceReleaseId,
      historicalSourceHash: old.sourceHash,
      currentReleaseId: input.current.sourceReleaseId,
      currentSourceHash: input.current.sourceHash,
      changes: changes.map(({ currentId: _id, ...change }) => change),
    },
  };
}
