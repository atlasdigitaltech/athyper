import { normalizedContractBuilders as b } from "./normalized-core-contract.js";
import {
  FoundationContractError,
  contractJsonSchema,
  validateFoundationNode,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";

const hash = { type: "string", pattern: "^[0-9a-f]{64}$" } as const;

/** Enrollment inputs are service-owned. This contract supplies no authority,
 * ownership inference, protected-state initializer or native cutover guard. */
export const nativeRootMember = b.define("entity_change_set", {
  nativeVersion: b.c(
    "native_core_layout_version",
    { type: "integer", minimum: 1, maximum: 2 },
    "integer",
    undefined,
    true,
  ),
  sourceKind: b.c(
    "source_kind",
    b.enumeration("product", "tenant_entity", "tenant_extension"),
    "text",
    undefined,
    true,
  ),
  schemaVersion: b.c(
    "schema_version",
    { type: "integer", minimum: 1, maximum: 2147483647 },
    "integer",
    undefined,
    true,
  ),
  authoringSchemaHash: b.c(
    "authoring_schema_hash",
    hash,
    "text",
    undefined,
    true,
  ),
  entityLabelId: b.ref("entity_label_id", "entity_label", true),
  defaultLocale: b.c(
    "default_locale",
    { type: "string", minLength: 1, maxLength: 127 },
    "text",
  ),
  requiredLocales: b.c(
    "required_locales",
    { type: "array", items: { type: "string", minLength: 1, maxLength: 127 } },
    "text[]",
  ),
  publicationResourceKey: b.str("publication_resource_key", true),
  sourceUri: b.c(
    "source_uri",
    b.nullable({ type: "string", minLength: 1, maxLength: 4000 }),
    "text",
  ),
  sourceHash: b.c("source_hash", b.nullable(hash), "text", undefined, true),
  publicationOwner: b.c(
    "publication_owner",
    b.enumeration("platform", "tenant"),
    "text",
    undefined,
    true,
  ),
  sourcePredecessorReleaseId: b.ref(
    "source_predecessor_release_id",
    "entity_release",
    false,
    true,
  ),
});
export type NativeRootRow = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly baseReleaseId: string | null;
} & {
  readonly [K in keyof typeof nativeRootMember.columns]: ContractValue<
    (typeof nativeRootMember.columns)[K]["node"]
  >;
};
export function nativeRootNode(): ContractNode {
  return {
    type: "object",
    properties: {
      id: referenceUuid,
      tenantId: b.nullable(referenceUuid),
      baseReleaseId: b.nullable(referenceUuid),
      ...Object.fromEntries(
        Object.entries(nativeRootMember.columns).map(([key, column]) => [
          key,
          column.node,
        ]),
      ),
    },
  };
}
export function nativeRootSchema(): object {
  return contractJsonSchema(nativeRootNode());
}
export function validateNativeRoot(row: unknown): asserts row is NativeRootRow {
  validateFoundationNode(nativeRootNode(), row, "/root");
  const r = row as NativeRootRow;
  const fail = (path: string): never => {
    throw new FoundationContractError("NATIVE_ROOT_INVALID", "/root/" + path);
  };
  if (r.sourceKind === "product") {
    if (r.tenantId !== null || r.publicationOwner !== "platform")
      fail("ownership");
  } else if (r.tenantId === null || r.publicationOwner !== "tenant")
    fail("ownership");
  if (r.sourceKind === "tenant_extension" && r.baseReleaseId === null)
    fail("baseReleaseId");
  if (
    !r.requiredLocales.includes(r.defaultLocale) ||
    new Set(r.requiredLocales).size !== r.requiredLocales.length
  )
    fail("requiredLocales");
}
