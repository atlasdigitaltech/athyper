import {
  FoundationContractError,
  type NormalizedCoreGraph,
  type NormalizedLayoutGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { Transaction } from "kysely";
import {
  resolveNativeComponentResources,
  type NativeComponentScope,
  type NativeComponentResourcePolicy,
} from "./native-component-resources.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import type { NativeConversionComposition } from "./native-conversion-composition.js";
type Tx = Transaction<Record<string, never>>;
export interface NativeComponentComposition {
  readonly resources: NativeComponentResourcePolicy;
  /** Existing host resolves its exact approved release, never a caller-provided hash. */
  scope(tx: Tx, tenantId: string | null): Promise<NativeComponentScope>;
}
function selected(
  core: NormalizedCoreGraph,
  layout: NormalizedLayoutGraph,
): string[] {
  return [
    ...new Set(
      [
        ...core.surface.map((s) => s.componentContractId),
        ...layout.section.map((s) => s.componentContractId),
        ...layout.binding.flatMap((b) => [
          b.componentDisplayId,
          b.componentInputId,
          b.componentFilterId,
          b.componentFormatId,
        ]),
      ].filter((id): id is string => id !== null),
    ),
  ].sort();
}
async function resolved(
  tx: Tx,
  tenantId: string | null,
  core: NormalizedCoreGraph,
  layout: NormalizedLayoutGraph,
  composition: NativeComponentComposition,
) {
  const scope = await composition.scope(tx, tenantId);
  if (scope.tenantId !== tenantId)
    throw new FoundationContractError(
      "COMPONENT_RESOURCE_SCOPE_INVALID",
      "/tenantId",
    );
  return resolveNativeComponentResources(
    tx,
    scope,
    selected(core, layout),
    composition.resources,
  );
}
/** Keeps existing admission, initialization, budgets and security/storage ports.
 * It replaces only the component roster with registry+installation resolution. */
export function withNativeComponentAuthoringResources(
  host: NativeAuthoringPolicy,
  composition: NativeComponentComposition,
): NativeAuthoringPolicy {
  return {
    ...host,
    async resolveContext(tx, input, state) {
      const context = await host.resolveContext(tx, input, state);
      const r = await resolved(
        tx,
        input.tenantId,
        state.core,
        state.layout,
        composition,
      );
      return {
        ...context,
        coreContext: { ...context.coreContext, components: r.coreComponents },
        components: r.layoutComponents,
      };
    },
  };
}
/** Both compilation and the existing reader recheck call this resolver. Exact
 * installation evidence joins the compilation-context hash, not authored rows. */
export function withNativeComponentCompilationResources(
  base: NativeConversionComposition,
  composition: NativeComponentComposition,
): NativeConversionComposition {
  return {
    ...base,
    host: withNativeComponentAuthoringResources(base.host, composition),
    async compiler(tx, graph) {
      const context = await base.compiler(tx, graph);
      const r = await resolved(
        tx,
        graph.authoringSource.tenantId,
        {
          field: graph.fields,
          runtime: graph.runtimeProfiles,
          surface: graph.surfaces,
        },
        { section: graph.surfaceSections, binding: graph.surfaceFieldBindings },
        composition,
      );
      return {
        ...context,
        core: { ...context.core, components: r.coreComponents },
        layout: { ...context.layout, components: r.layoutComponents },
        components: r.runtimeComponents,
        componentResourceEvidence: r.evidence,
      };
    },
  };
}
