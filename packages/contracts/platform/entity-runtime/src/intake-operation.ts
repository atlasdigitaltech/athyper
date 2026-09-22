/** Transport contract between the generic intake workspace and a registered domain provider. */
export type EntityIntakeOperationKind =
  | "selection"
  | "preview"
  | "save_draft"
  | "submit"
  | "undo"
  | "discard";

export interface EntityIntakeOperationRequestV1 {
  readonly schemaVersion: 1;
  readonly descriptorHash: string;
  readonly flowKey: string;
  readonly operation: EntityIntakeOperationKind;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
  readonly expectedVersion?: number;
}

export interface EntityIntakeReceiptV1 {
  readonly code?: string;
  readonly recordId?: string;
  readonly version?: number;
  readonly savedAt?: string;
  readonly statusLabel?: string;
}

export interface EntityIntakePolicyPreviewV1 {
  readonly outcome: "unchanged" | "metadata-only" | "reapproval-required" | "denied";
  readonly message?: string;
}

export interface EntityIntakeCapabilityV1 {
  readonly operation: EntityIntakeOperationKind | "back" | "continue" | "exit";
  readonly operationKey: string;
  readonly label?: string;
  readonly href?: string;
}

export interface EntityIntakeOperationResponseV1 {
  readonly schemaVersion: 1;
  readonly receipt?: EntityIntakeReceiptV1;
  readonly policyPreview?: EntityIntakePolicyPreviewV1;
  readonly capabilities: readonly EntityIntakeCapabilityV1[];
  /** Domain providers may return a validated next-flow decision, but never UI markup. */
  readonly nextStepKey?: string;
}

const operationKinds = new Set<EntityIntakeOperationKind>([
  "selection", "preview", "save_draft", "submit", "undo", "discard",
]);
const capabilityOperations = new Set<string>([...operationKinds, "back", "continue", "exit"]);
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} is invalid`);
  return value as Record<string, unknown>;
};
const code = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
};
const text = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) throw new TypeError(`${label} is invalid`);
  return value;
};
const optionalText = (value: unknown, label: string) => value === undefined ? undefined : text(value, label);

export function parseEntityIntakeOperationResponse(value: unknown): EntityIntakeOperationResponseV1 {
  const root = object(value, "intake operation response");
  if (root.schemaVersion !== 1 || !Array.isArray(root.capabilities)) throw new TypeError("intake operation response is invalid");
  const receipt = root.receipt === undefined ? undefined : (() => {
    const item = object(root.receipt, "intake receipt");
    const version = item.version;
    if (version !== undefined && (!Number.isInteger(version) || Number(version) < 0)) throw new TypeError("intake receipt version is invalid");
    return Object.freeze({
      ...(item.code === undefined ? {} : { code: text(item.code, "intake receipt code") }),
      ...(item.recordId === undefined ? {} : { recordId: text(item.recordId, "intake receipt record id") }),
      ...(version === undefined ? {} : { version: Number(version) }),
      ...(item.savedAt === undefined ? {} : { savedAt: text(item.savedAt, "intake receipt saved at") }),
      ...(item.statusLabel === undefined ? {} : { statusLabel: text(item.statusLabel, "intake receipt status") }),
    });
  })();
  const policyPreview = root.policyPreview === undefined ? undefined : (() => {
    const item = object(root.policyPreview, "intake policy preview");
    if (!["unchanged", "metadata-only", "reapproval-required", "denied"].includes(String(item.outcome))) throw new TypeError("intake policy preview outcome is invalid");
    return Object.freeze({ outcome: item.outcome as EntityIntakePolicyPreviewV1["outcome"], ...(item.message === undefined ? {} : { message: text(item.message, "intake policy preview message") }) });
  })();
  const capabilities = root.capabilities.map((value, index) => {
    const item = object(value, `intake capability ${index}`);
    if (!capabilityOperations.has(String(item.operation))) throw new TypeError("intake capability operation is invalid");
    return Object.freeze({ operation: item.operation as EntityIntakeCapabilityV1["operation"], operationKey: code(item.operationKey, "intake capability key"), ...(item.label === undefined ? {} : { label: text(item.label, "intake capability label") }), ...(item.href === undefined ? {} : { href: text(item.href, "intake capability href") }) });
  });
  return Object.freeze({ schemaVersion: 1, ...(receipt ? { receipt } : {}), ...(policyPreview ? { policyPreview } : {}), capabilities: Object.freeze(capabilities), ...(root.nextStepKey === undefined ? {} : { nextStepKey: code(root.nextStepKey, "intake next step") }) });
}
