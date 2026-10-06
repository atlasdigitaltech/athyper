import {
  FoundationContractError,
  contractJsonSchema,
  type ContractNode,
} from "./foundation-contract.js";
import {
  referenceMembers,
  memberSchema,
  referenceUuid,
  type ReferenceMemberKind,
  type ReferenceMember,
} from "./reference-member-contract.js";
export type MemberReference = string | { readonly $tempRef: string };
export type ReferenceCommandValue<K extends ReferenceMemberKind> = {
  readonly [
    P in keyof (typeof referenceMembers)[K]["columns"]
  ]: (typeof referenceMembers)[K]["columns"][P] extends { reference: string }
    ? | MemberReference
      | (null extends ReferenceMember<K>[P & keyof ReferenceMember<K>]
          ? null
          : never)
    : ReferenceMember<K>[P & keyof ReferenceMember<K>];
};
type AddReferenceCommand = {
  [K in ReferenceMemberKind]: {
    readonly kind: "addMember";
    readonly memberKind: K;
    readonly tempRef: string;
    readonly value: ReferenceCommandValue<K>;
  };
}[ReferenceMemberKind];
type UpdateReferenceCommand = {
  [K in ReferenceMemberKind]: {
    readonly kind: "updateMember";
    readonly memberKind: K;
    readonly id: MemberReference;
    readonly set: Partial<ReferenceCommandValue<K>>;
    readonly clear: readonly (keyof ReferenceCommandValue<K>)[];
  };
}[ReferenceMemberKind];
export type ReferenceCommand =
  | AddReferenceCommand
  | UpdateReferenceCommand
  | {
      readonly kind: "removeMember";
      readonly memberKind: ReferenceMemberKind;
      readonly id: MemberReference;
    }
  | {
      readonly kind: "reorderMembers";
      readonly memberKind: ReferenceMemberKind;
      readonly scope: Readonly<Record<string, unknown>>;
      readonly ids: readonly MemberReference[];
    }
  | {
      readonly kind: "reserveFieldIdentity";
      readonly fieldId: string;
      readonly tempRef: string;
    };
export interface ReferenceCommandBatch {
  readonly contract: "entity.authoring-reference-commands/1";
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly commands: readonly ReferenceCommand[];
}
export interface ReferenceCommandPolicy {
  readonly maxBatchBytes: number;
  readonly maxCommands: number;
  readonly maxMembers: number;
  readonly maxPredicateDepth: number;
}
const temporaryReference = {
  type: "object",
  additionalProperties: false,
  required: ["$tempRef"],
  properties: {
    $tempRef: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" },
  },
};
const identityReference = { anyOf: [referenceUuid, temporaryReference] };
const temporaryKey = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" };
export const referenceCommandSchema = () => ({
  type: "object",
  additionalProperties: false,
  required: ["contract", "expectedRevision", "idempotencyKey", "commands"],
  properties: {
    contract: { const: "entity.authoring-reference-commands/1" },
    expectedRevision: {
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    idempotencyKey: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._~:/+-]{15,127}$",
    },
    commands: {
      type: "array",
      minItems: 1,
      items: {
        oneOf: [
          ...Object.entries(referenceMembers).flatMap(([kind, d]) => {
            const properties = Object.fromEntries(
              Object.entries(d.columns).map(([p, c]) => [
                p,
                c.reference
                  ? {
                      anyOf: [
                        identityReference,
                        ...(c.nullable ? [{ type: "null" }] : []),
                      ],
                    }
                  : contractJsonSchema(c.node),
              ]),
            );
            const value = {
              type: "object",
              additionalProperties: false,
              required: Object.keys(properties),
              properties,
            };
            const variants: object[] = [
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "memberKind", "tempRef", "value"],
                properties: {
                  kind: { const: "addMember" },
                  memberKind: { const: kind },
                  tempRef: temporaryKey,
                  value,
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "memberKind", "id", "set", "clear"],
                properties: {
                  kind: { const: "updateMember" },
                  memberKind: { const: kind },
                  id: identityReference,
                  set: { ...value, required: [] },
                  clear: {
                    type: "array",
                    uniqueItems: true,
                    items: {
                      enum: Object.entries(d.columns)
                        .filter(([, c]) => c.nullable && !c.immutable)
                        .map(([p]) => p),
                    },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["kind", "memberKind", "id"],
                properties: {
                  kind: { const: "removeMember" },
                  memberKind: { const: kind },
                  id: identityReference,
                },
              },
            ];
            if ("ordered" in d) {
              const columns = d.ordered!.scope.map((name) =>
                Object.entries(d.columns).find(([, c]) => c.column === name)!,
              );
              variants.push({
                type: "object",
                additionalProperties: false,
                required: ["kind", "memberKind", "scope", "ids"],
                properties: {
                  kind: { const: "reorderMembers" },
                  memberKind: { const: kind },
                  scope: {
                    type: "object",
                    additionalProperties: false,
                    required: columns.map(([p]) => p),
                    properties: Object.fromEntries(
                      columns.map(([p, c]) => [p, contractJsonSchema(c.node)]),
                    ),
                  },
                  ids: {
                    type: "array",
                    minItems: 1,
                    uniqueItems: true,
                    items: identityReference,
                  },
                },
              });
            }
            return variants;
          }),
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "fieldId", "tempRef"],
            properties: {
              kind: { const: "reserveFieldIdentity" },
              fieldId: referenceUuid,
              tempRef: temporaryKey,
            },
          },
        ],
      },
    },
  },
});
export function parseReferenceCommands(
  value: unknown,
  policy: ReferenceCommandPolicy,
): ReferenceCommandBatch {
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/commands");
  };
  if (
    !Number.isSafeInteger(policy.maxBatchBytes) ||
    policy.maxBatchBytes < 1 ||
    !Number.isSafeInteger(policy.maxCommands) ||
    policy.maxCommands < 1
  )
    return fail("REFERENCE_BUDGET_REQUIRED");
  const encoded = JSON.stringify(value);
  if (
    !encoded ||
    new TextEncoder().encode(encoded).length > policy.maxBatchBytes
  )
    return fail("AUTHORING_BATCH_LIMIT");
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("REFERENCE_BATCH_INVALID");
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).sort().join(",") !==
      "commands,contract,expectedRevision,idempotencyKey" ||
    b.contract !== "entity.authoring-reference-commands/1" ||
    !Number.isSafeInteger(b.expectedRevision) ||
    Number(b.expectedRevision) < 0 ||
    Number(b.expectedRevision) > Number.MAX_SAFE_INTEGER ||
    typeof b.idempotencyKey !== "string" ||
    !Array.isArray(b.commands) ||
    !b.commands.length ||
    b.commands.length > policy.maxCommands
  )
    return fail("REFERENCE_BATCH_INVALID");
  for (const raw of b.commands) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return fail("REFERENCE_COMMAND_INVALID");
    const c = raw as Record<string, unknown>;
    const fields =
      c.kind === "addMember"
        ? ["kind", "memberKind", "tempRef", "value"]
        : c.kind === "updateMember"
          ? ["kind", "memberKind", "id", "set", "clear"]
          : c.kind === "removeMember"
            ? ["kind", "memberKind", "id"]
            : c.kind === "reorderMembers"
              ? ["kind", "memberKind", "scope", "ids"]
              : c.kind === "reserveFieldIdentity"
                ? ["kind", "fieldId", "tempRef"]
                : [];
    if (
      !fields.length ||
      Object.keys(c).sort().join(",") !== fields.sort().join(",")
    )
      return fail("REFERENCE_COMMAND_INVALID");
    if (
      c.kind !== "reserveFieldIdentity" &&
      (typeof c.memberKind !== "string" ||
        !Object.hasOwn(referenceMembers, c.memberKind))
    )
      return fail("REFERENCE_MEMBER_UNSUPPORTED");
    if (c.kind === "addMember" || c.kind === "reserveFieldIdentity")
      if (
        typeof c.tempRef !== "string" ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(c.tempRef)
      )
        return fail("REFERENCE_TEMP_REF_INVALID");
    if (
      c.kind === "addMember" &&
      (!c.value || typeof c.value !== "object" || Array.isArray(c.value))
    )
      return fail("REFERENCE_MEMBER_INVALID");
    if (
      c.kind === "reserveFieldIdentity" &&
      (typeof c.fieldId !== "string" ||
        !new RegExp(referenceUuid.pattern).test(c.fieldId))
    )
      return fail("AUTHORING_MEMBER_IDENTITY_INVALID");
    if (
      c.kind === "updateMember" &&
      (!Array.isArray(c.clear) ||
        !c.set ||
        typeof c.set !== "object" ||
        Array.isArray(c.set))
    )
      return fail("REFERENCE_PATCH_INVALID");
    if (
      c.kind === "reorderMembers" &&
      (!Array.isArray(c.ids) ||
        !c.ids.length ||
        !c.scope ||
        typeof c.scope !== "object" ||
        Array.isArray(c.scope))
    )
      return fail("REFERENCE_REORDER_INVALID");
  }
  return value as ReferenceCommandBatch;
}

export type ReferenceCommandResult =
  import("./label-commands.js").LabelCommandResult;
