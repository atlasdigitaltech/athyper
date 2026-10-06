import {
  type ContractNode,
  type ContractValue,
  validateFoundationNode,
  FoundationContractError,
} from "./foundation-contract.js";

const uuid = {
  type: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
} as const;
const token = { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" } as const;
const text = {
  type: "string",
  minLength: 1,
  maxLength: 500,
  pattern: "\\S",
} as const;
const key = { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" } as const;
const locale = { type: "string", minLength: 1, maxLength: 64 } as const;
const reference = {
  anyOf: [
    { type: "object", properties: { id: uuid } },
    { type: "object", properties: { $tempRef: token } },
  ],
} as const;
const object = <const P extends Readonly<Record<string, ContractNode>>>(
  properties: P,
) => ({ type: "object", properties }) as const;

/** Closed first normalized command family. Other member kinds and reorder/rebind
 * reject explicitly until their descriptors and persisted semantics qualify. */
export const labelCommandContract = object({
  contract: { const: "entity.authoring-label-commands/1" },
  expectedRevision: {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  },
  idempotencyKey: {
    type: "string",
    minLength: 16,
    maxLength: 128,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._~:/+-]{15,127}$",
  },
  commands: {
    type: "array",
    minItems: 1,
    items: {
      anyOf: [
        object({
          kind: { const: "updateMember" },
          memberKind: { const: "labelSettings" },
          set: object({
            defaultLocale: locale,
            requiredLocales: { type: "array", items: locale, minItems: 1 },
          }),
        }),
        object({
          kind: { const: "addMember" },
          memberKind: { const: "label" },
          tempRef: token,
          value: object({ labelKey: key, defaultText: text }),
        }),
        object({
          kind: { const: "addMember" },
          memberKind: { const: "labelTranslation" },
          tempRef: token,
          value: object({ label: reference, localeCode: locale, text }),
        }),
        object({
          kind: { const: "updateMember" },
          memberKind: { const: "label" },
          member: reference,
          set: object({ defaultText: text }),
        }),
        object({
          kind: { const: "updateMember" },
          memberKind: { const: "labelTranslation" },
          member: reference,
          set: object({ text }),
        }),
        object({
          kind: { const: "removeMember" },
          memberKind: { const: "label" },
          member: reference,
        }),
        object({
          kind: { const: "removeMember" },
          memberKind: { const: "labelTranslation" },
          member: reference,
        }),
        object({
          kind: { const: "renameDraftMember" },
          memberKind: { const: "label" },
          member: reference,
          labelKey: key,
        }),
      ],
    },
  },
});
export type LabelCommandBatch = ContractValue<typeof labelCommandContract>;
export interface NormalizedAuthoringPolicy {
  readonly supportedLocales: readonly string[];
  readonly maxCommands: number;
  readonly maxBatchBytes: number;
}
export interface LabelCommandResult {
  readonly changeSetId: string;
  readonly revision: number;
  readonly changed: boolean;
  readonly identities: Readonly<Record<string, string>>;
}
export function parseLabelCommands(
  value: unknown,
  policy: NormalizedAuthoringPolicy,
): LabelCommandBatch {
  if (
    !policy.supportedLocales.length ||
    !Number.isSafeInteger(policy.maxCommands) ||
    policy.maxCommands < 1 ||
    !Number.isSafeInteger(policy.maxBatchBytes) ||
    policy.maxBatchBytes < 1
  )
    throw new FoundationContractError("AUTHORING_BUDGET_REQUIRED", "");
  const encoded = JSON.stringify(value);
  if (
    !encoded ||
    new TextEncoder().encode(encoded).length > policy.maxBatchBytes
  )
    throw new FoundationContractError("AUTHORING_BATCH_LIMIT", "");
  validateFoundationNode(labelCommandContract, value, "");
  const batch = value as LabelCommandBatch;
  if (batch.commands.length > policy.maxCommands)
    throw new FoundationContractError("AUTHORING_COMMAND_LIMIT", "/commands");
  return batch;
}
