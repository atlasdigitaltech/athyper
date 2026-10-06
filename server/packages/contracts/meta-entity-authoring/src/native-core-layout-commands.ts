import {
  FoundationContractError,
  validateFoundationNode,
  contractJsonSchema,
  type ContractNode,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
import {
  normalizedCoreMembers,
  type NormalizedCoreKind,
  type NormalizedCoreRow,
} from "./normalized-core-contract.js";
import {
  normalizedLayoutMembers,
  type NormalizedLayoutKind,
  type NormalizedLayoutRow,
} from "./normalized-layout-contract.js";
export const nativeCoreLayoutMembers = {
  ...normalizedCoreMembers,
  ...normalizedLayoutMembers,
};
export type NativeCoreLayoutKind = NormalizedCoreKind | NormalizedLayoutKind;
export type NativeCoreLayoutRow<K extends NativeCoreLayoutKind> =
  K extends NormalizedCoreKind
    ? NormalizedCoreRow<K>
    : K extends NormalizedLayoutKind
      ? NormalizedLayoutRow<K>
      : never;
export type NativeMemberReference = string | { readonly $tempRef: string };
export const nativeOrderScopes = {
  section: ["entitySurfaceId", "navigationGroupId", "parentSectionId"],
  binding: [
    "entitySurfaceId",
    "overlayId",
    "entitySurfaceSectionId",
    "bindingKind",
  ],
} as const;
type Columns<K extends NativeCoreLayoutKind> =
  (typeof nativeCoreLayoutMembers)[K]["columns"];
type Values<K extends NativeCoreLayoutKind> = {
  readonly [
    P in keyof Columns<K> as Columns<K>[P] extends { serviceOwned: true }
      ? never
      : P
  ]: Columns<K>[P] extends { reference: string }
    ? | NativeMemberReference
      | (null extends NativeCoreLayoutRow<K>[P & keyof NativeCoreLayoutRow<K>]
          ? null
          : never)
    : NativeCoreLayoutRow<K>[P & keyof NativeCoreLayoutRow<K>];
};
export type NativeCoreLayoutCommand =
  | {
      [K in NativeCoreLayoutKind]:
        | {
            readonly kind: "addMember";
            readonly memberKind: K;
            readonly tempRef: string;
            readonly value: Readonly<Values<K>>;
          }
        | {
            readonly kind: "updateMember";
            readonly memberKind: K;
            readonly id: NativeMemberReference;
            readonly set: Readonly<Partial<Values<K>>>;
            readonly clear: readonly (keyof Values<K> & string)[];
          }
        | {
            readonly kind: "removeMember";
            readonly memberKind: K;
            readonly id: NativeMemberReference;
          };
    }[NativeCoreLayoutKind]
  | {
      readonly kind: "reorderMembers";
      readonly memberKind: keyof typeof nativeOrderScopes;
      readonly scope: Readonly<Record<string, unknown>>;
      readonly ids: readonly NativeMemberReference[];
    };
export interface NativeCoreLayoutCommandBatch {
  readonly contract: "entity.authoring-native-core-layout-commands/1";
  readonly expectedRevision: number;
  readonly idempotencyKey: string;
  readonly commands: readonly NativeCoreLayoutCommand[];
}
export interface NativeCoreLayoutCommandPolicy {
  readonly maxBatchBytes: number;
  readonly maxCommands: number;
  readonly maxMembers: number;
  readonly authoringSchemaHash: string;
}
const token = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" } as const;
const ref: ContractNode = {
  anyOf: [referenceUuid, { type: "object", properties: { $tempRef: token } }],
};
const nil = { type: "null" } as const;
const nullable = (node: ContractNode) =>
  "anyOf" in node && node.anyOf.some((n) => "type" in n && n.type === "null");
const choice = (values: readonly string[]): ContractNode => ({
  anyOf: values.map((value) => ({ const: value })),
});
const object = (
  properties: Record<string, ContractNode>,
  required?: readonly string[],
): ContractNode => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
});
export function nativeCoreLayoutCommandNode(): ContractNode {
  const commands: ContractNode[] = [];
  for (const [kind, d] of Object.entries(nativeCoreLayoutMembers)) {
    const columns = Object.entries(d.columns).filter(
      ([, c]) => !c.serviceOwned,
    );
    const properties = Object.fromEntries(
      columns.map(([p, c]) => [
        p,
        c.reference
          ? ({
              anyOf: [ref, ...(nullable(c.node) ? [nil] : [])],
            } as ContractNode)
          : c.node,
      ]),
    );
    commands.push(
      object({
        kind: { const: "addMember" },
        memberKind: { const: kind },
        tempRef: token,
        value: object(properties),
      }),
    );
    commands.push(
      object({
        kind: { const: "updateMember" },
        memberKind: { const: kind },
        id: ref,
        set: object(properties, []),
        clear: {
          type: "array",
          items: choice(
            columns.filter(([, c]) => nullable(c.node)).map(([p]) => p),
          ),
        },
      }),
    );
    commands.push(
      object({
        kind: { const: "removeMember" },
        memberKind: { const: kind },
        id: ref,
      }),
    );
    if (kind === "section" || kind === "binding") {
      const columnsByName = d.columns as Readonly<
        Record<string, { node: ContractNode; reference?: string }>
      >;
      commands.push(
        object({
          kind: { const: "reorderMembers" },
          memberKind: { const: kind },
          scope: object(
            Object.fromEntries(
              nativeOrderScopes[kind].map((p) => {
                const c = columnsByName[p]!;
                return [
                  p,
                  c.reference
                    ? ({
                        anyOf: [ref, ...(nullable(c.node) ? [nil] : [])],
                      } as ContractNode)
                    : c.node,
                ];
              }),
            ),
          ),
          ids: { type: "array", items: ref, minItems: 1 },
        }),
      );
    }
  }
  return object({
    contract: { const: "entity.authoring-native-core-layout-commands/1" },
    expectedRevision: {
      type: "integer",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    idempotencyKey: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._~:/+-]{15,127}$",
    },
    commands: { type: "array", minItems: 1, items: { anyOf: commands } },
  });
}
export const nativeCoreLayoutCommandSchema = () =>
  contractJsonSchema(nativeCoreLayoutCommandNode());
export function parseNativeCoreLayoutCommands(
  value: unknown,
  policy: NativeCoreLayoutCommandPolicy,
): NativeCoreLayoutCommandBatch {
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/commands");
  };
  if (
    ![policy.maxBatchBytes, policy.maxCommands, policy.maxMembers].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    !/^[a-f0-9]{64}$/.test(policy.authoringSchemaHash)
  )
    fail("NATIVE_AUTHORING_POLICY_REQUIRED");
  // Closed node validation rejects getters, sparse arrays and non-JSON data before serialization.
  validateFoundationNode(nativeCoreLayoutCommandNode(), value, "/commands");
  const b = value as NativeCoreLayoutCommandBatch;
  if (
    new TextEncoder().encode(JSON.stringify(b)).length > policy.maxBatchBytes ||
    b.commands.length > policy.maxCommands
  )
    fail("AUTHORING_BATCH_LIMIT");
  for (const c of b.commands)
    if (c.kind === "updateMember") {
      if (
        new Set(c.clear).size !== c.clear.length ||
        c.clear.some((p) => Object.hasOwn(c.set, p))
      )
        fail("NATIVE_PATCH_OVERLAP");
    }
  return structuredClone(b);
}
