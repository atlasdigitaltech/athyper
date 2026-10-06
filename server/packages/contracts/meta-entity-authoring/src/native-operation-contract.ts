import { normalizedContractBuilders as b } from "./normalized-core-contract.js";
import {
  contractJsonSchema,
  validateFoundationNode,
  FoundationContractError,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
const domain = <const V extends readonly string[]>(
  column: string,
  values: V,
  sqlType: string,
) => ({ ...b.choice(column, values, true), sqlType });
/** Target operation dictionary. Protected-state persistence remains separately
 * service owned; this contract adds no MFA input, requirement or initializer. */
export const nativeOperationMember = b.define("entity_operation", {
  operationKey: b.str("operation_key", true),
  operationKind: domain(
    "operation_kind",
    [
      "create",
      "read",
      "update",
      "delete",
      "execute",
      "transition",
      "import",
      "export",
    ],
    "metadata.entity_operation_kind_d",
  ),
  description: b.c(
    "description",
    b.nullable({ ...b.text, maxLength: 4000 }),
    "text",
  ),
  labelId: b.ref("label_id", "entity_label", true),
  auditEventCode: b.str("audit_event_code", true),
  executionMode: domain(
    "execution_mode",
    ["synchronous", "asynchronous"],
    "metadata.entity_operation_execution_d",
  ),
  idempotencyMode: domain(
    "idempotency_mode",
    ["none", "optional", "required"],
    "metadata.entity_operation_idempotency_d",
  ),
  inputSurfaceId: b.ref("input_surface_id", "entity_surface"),
  resultSurfaceId: b.ref("result_surface_id", "entity_surface"),
  authorizationTarget: b.choice(
    "authorization_target",
    ["collection", "existing", "new"],
    true,
  ),
  authorizationEffect: b.choice(
    "authorization_effect",
    ["read", "write", "navigation"],
    true,
  ),
  requiresParentRead: b.boolean("requires_parent_read", true),
  requiresPreflight: b.c(
    "requires_preflight",
    b.nullable({ type: "boolean" }),
    "boolean",
    undefined,
    true,
  ),
  replacementOperationId: b.ref("replacement_operation_id", "entity_operation"),
  handlerKey: b.str("handler_key"),
  handlerVersion: b.int("handler_version"),
  preflightKey: b.str("preflight_key"),
  preflightVersion: b.int("preflight_version"),
  extensionFieldMode: b.choice(
    "extension_field_mode",
    ["none", "allow_owned_fields"],
    true,
  ),
  exportFormats: b.array(
    "export_formats",
    b.str("format", true).node,
    "text[]",
  ),
  exportMaxRecords: b.c(
    "export_max_records",
    b.nullable({ type: "string", pattern: "^[1-9][0-9]{0,18}$" }),
    "bigint",
  ),
});
export type NativeOperationRow = { readonly id: string } & {
  readonly [K in keyof typeof nativeOperationMember.columns]: ContractValue<
    (typeof nativeOperationMember.columns)[K]["node"]
  >;
};
export function nativeOperationNode(
  client = false,
  patch = false,
): ContractNode {
  return {
    type: "object",
    properties: {
      ...(patch ? {} : { id: referenceUuid }),
      ...Object.fromEntries(
        Object.entries(nativeOperationMember.columns)
          .filter(([, c]) => !client || !c.serviceOwned)
          .map(([p, c]) => [p, c.node]),
      ),
    },
    ...(patch ? { required: [] } : {}),
  };
}
export function nativeOperationSchema(): object {
  return contractJsonSchema(nativeOperationNode());
}
export function validateNativeOperation(
  row: unknown,
  qualification = false,
): asserts row is NativeOperationRow {
  validateFoundationNode(nativeOperationNode(), row, "/operation");
  const r = row as NativeOperationRow,
    fail = (path: string): never => {
      throw new FoundationContractError("NATIVE_OPERATION_INVALID", path);
    };
  for (const [key, version] of [
    [r.handlerKey, r.handlerVersion],
    [r.preflightKey, r.preflightVersion],
  ])
    if ((key === null) !== (version === null)) fail("/operation/contracts");
  if (r.operationKind !== "read" && r.handlerKey === null)
    fail("/operation/handlerKey");
  if (
    r.exportMaxRecords !== null &&
    BigInt(r.exportMaxRecords) > 9223372036854775807n
  )
    fail("/operation/exportMaxRecords");
  if (
    r.exportFormats !== null &&
    (!r.exportFormats.length ||
      new Set(r.exportFormats).size !== r.exportFormats.length)
  )
    fail("/operation/exportFormats");
  if (
    r.operationKind !== "export" &&
    (r.exportFormats !== null || r.exportMaxRecords !== null)
  )
    fail("/operation/export");
  if (r.requiresPreflight === false && r.preflightKey !== null)
    fail("/operation/preflight");
  if (
    qualification &&
    (r.requiresPreflight === null ||
      r.handlerKey === null ||
      (r.requiresPreflight && r.preflightKey === null) ||
      (r.operationKind === "export" &&
        (r.exportFormats === null || r.exportMaxRecords === null)))
  )
    fail("/operation/qualification");
}
