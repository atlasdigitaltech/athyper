import {
  FoundationContractError,
  validateNormalizedCoreRow,
  type MetaEntityGraph,
  type NormalizedCoreRow,
} from "@athyper/server-contract-meta-entity-authoring";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
import { sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";

/** Field-level semantic roles are shared across their binding declarations.
 * Initialization must be independently admitted and used by the core adapter;
 * this factory neither initializes fields nor derives authority from legacy JSON. */
export function createLegacyNativeFieldSemanticsAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly fields: readonly NormalizedCoreRow<"field">[];
}): NativeNestedConversionAdapter {
  const fail = (code: string, path: string): never => {
    throw new FoundationContractError(code, path);
  };
  validateConversionJsonData(input.source, "/source");
  const sourceHash = input.sourceHash;
  if (sha256(input.source) !== sourceHash)
    fail("NATIVE_SEMANTICS_SOURCE_HASH_MISMATCH", "/source");
  const fields = structuredClone(input.fields);
  const ids = new Set(fields.map((f) => f.id));
  if (ids.size !== fields.length)
    fail("NATIVE_SEMANTICS_INVENTORY_INVALID", "/fields");
  for (const field of fields) validateNormalizedCoreRow("field", field);
  const enrolled = (input.source.surfaceFieldBindings ?? []).filter(
    (b) => b.displayConfig && Object.hasOwn(b.displayConfig, "semanticRole"),
  );
  if (!enrolled.length) fail("NATIVE_SEMANTICS_INVENTORY_INVALID", "/bindings");
  const scopes = new Map<string, { fieldId: string; surfaceId: string }>();
  const forward = (graph: MetaEntityGraph): MetaEntityGraph => {
    validateConversionJsonData(graph, "/source");
    if (sha256(graph) !== sourceHash)
      fail("NATIVE_SEMANTICS_SOURCE_HASH_MISMATCH", "/source");
    const result = structuredClone(graph);
    const seen = new Set<string>();
    for (const b of result.surfaceFieldBindings ?? []) {
      if (!b.displayConfig || !Object.hasOwn(b.displayConfig, "semanticRole"))
        continue;
      const matches = fields.filter((f) => f.id === b.entityFieldId);
      if (
        !b.id ||
        seen.has(b.id) ||
        matches.length !== 1 ||
        (graph.fields ?? []).filter((f) => f.id === b.entityFieldId).length !==
          1 ||
        (graph.surfaces ?? []).filter((s) => s.id === b.entitySurfaceId)
          .length !== 1
      )
        fail("NATIVE_SEMANTICS_BINDING_SCOPE_INVALID", "/bindings");
      seen.add(b.id!);
      const role = b.displayConfig.semanticRole;
      if (
        typeof role !== "string" ||
        !/^[a-z][a-z0-9_.-]{0,126}$/.test(role) ||
        role !== matches[0]!.semanticRole
      )
        fail(
          "NATIVE_SEMANTICS_CORRELATED_SOURCE_CONFLICT",
          "/bindings/displayConfig/semanticRole",
        );
      scopes.set(b.id!, {
        fieldId: b.entityFieldId!,
        surfaceId: b.entitySurfaceId!,
      });
      const rest = { ...b.displayConfig };
      delete rest.semanticRole;
      (b as { displayConfig?: object }).displayConfig = rest;
      if (!Object.keys(rest).length)
        delete (b as { displayConfig?: object }).displayConfig;
    }
    return result;
  };
  const preparedHash = sha256(forward(input.source));
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone(input.dependencies),
    forward,
    reverse(prepared, target) {
      if (sha256(prepared) !== preparedHash)
        fail("NATIVE_SEMANTICS_SOURCE_HASH_MISMATCH", "/prepared");
      const result = structuredClone(prepared);
      for (const b of result.surfaceFieldBindings ?? []) {
        const scope = scopes.get(b.id ?? "");
        if (!scope) continue;
        const bindings = target.surfaceFieldBindings.filter(
          (n) =>
            n.id === b.id &&
            n.entityFieldId === scope.fieldId &&
            n.entitySurfaceId === scope.surfaceId,
        );
        const matches = target.fields.filter((f) => f.id === scope.fieldId);
        if (bindings.length !== 1 || matches.length !== 1)
          fail("NATIVE_SEMANTICS_BINDING_SCOPE_INVALID", "/target");
        validateNormalizedCoreRow("field", matches[0]);
        const role = matches[0]!.semanticRole;
        if (typeof role !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(role))
          fail(
            "NATIVE_SEMANTICS_REVERSE_NOT_REPRESENTABLE",
            "/target/semanticRole",
          );
        (b as { displayConfig?: object }).displayConfig = {
          ...b.displayConfig,
          semanticRole: role,
        };
      }
      return result;
    },
  };
}
