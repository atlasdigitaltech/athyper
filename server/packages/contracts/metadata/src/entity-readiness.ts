import { createHash } from "node:crypto";
import type { EntityAiManifestBindingV1 } from "./entity-ai-manifest.js";

/** Release requirements reference approved registrations; they never name executable owners. */
export interface EntityCapabilityRequirement extends EntityAiManifestBindingV1 {
  readonly required: boolean;
}
export interface EntityServingTarget {
  readonly deploymentId: string;
  readonly configurationRevision: string;
  readonly plane: "studio" | "neon" | "mesh";
  readonly releaseArtifactHash: string;
}
export interface EntitySupportReceipt {
  readonly schema: "entity-deployment-support/1";
  readonly target: EntityServingTarget;
  readonly supportRevision: string;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly qualifiedAtMs: number;
  readonly expiresAtMs: number;
  readonly results: readonly (EntityAiManifestBindingV1 & {
    readonly passed: boolean;
  })[];
}
/** This lookup is installed by trusted host composition, never selected by Entity metadata. */
export interface EntityDeploymentSupport {
  readonly current: EntityDeploymentSupportPointer;
  readonly receipt: EntitySupportReceipt;
}
/** Mutable authority pointer supplied by deployment composition, separate from immutable evidence. */
export interface EntityDeploymentSupportPointer {
  readonly target: EntityServingTarget;
  readonly supportRevision: string;
  readonly adapterVersions: Readonly<Record<string, string>>;
  readonly receiptHash: string;
}
export type EntityReadinessReason =
  | "support_unavailable"
  | "support_lookup_failed"
  | "support_invalid"
  | "target_changed"
  | "support_revision_changed"
  | "adapters_changed"
  | "receipt_changed"
  | "receipt_expired"
  | "capability_missing"
  | "manifest_incompatible"
  | "qualification_failed";
export interface EntityReadinessResult {
  readonly ready: boolean;
  readonly available: readonly string[];
  readonly unavailable: readonly {
    readonly id: string;
    readonly required: boolean;
    readonly reason: EntityReadinessReason;
  }[];
  readonly receiptHash?: string;
}

function canonical(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, child]) => [key, normalize(child)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}
/** Content hash for an immutable receipt. A hash is not an authenticity or authorization grant. */
export function entitySupportReceiptHash(
  receipt: EntitySupportReceipt,
): string {
  return createHash("sha256").update(canonical(receipt)).digest("hex");
}
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function targetValid(target: EntityServingTarget): boolean {
  return Boolean(
    target &&
    text(target.deploymentId) &&
    text(target.configurationRevision) &&
    ["studio", "neon", "mesh"].includes(target.plane) &&
    hash(target.releaseArtifactHash),
  );
}
function bindingValid(binding: EntityAiManifestBindingV1): boolean {
  return Boolean(
    binding &&
    text(binding.id) &&
    text(binding.version) &&
    hash(binding.manifestHash) &&
    hash(binding.inputSchemaHash) &&
    hash(binding.resultSchemaHash),
  );
}
function adaptersValid(value: Readonly<Record<string, string>>): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, version]) => text(key) && text(version)),
  );
}
function objectKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join() === [...keys].sort().join(),
  );
}
function parsedTarget(value: unknown): EntityServingTarget {
  if (
    !objectKeys(value, [
      "deploymentId",
      "configurationRevision",
      "plane",
      "releaseArtifactHash",
    ]) ||
    !targetValid(value as unknown as EntityServingTarget)
  )
    throw new TypeError("ENTITY_SUPPORT_TARGET_INVALID");
  return Object.freeze({ ...value }) as unknown as EntityServingTarget;
}
/** Strict persistence boundary: reject unsupported fields and detach nested mutable inputs. */
export function parseEntityDeploymentSupportPointer(
  value: unknown,
): EntityDeploymentSupportPointer {
  if (
    !objectKeys(value, [
      "target",
      "supportRevision",
      "adapterVersions",
      "receiptHash",
    ]) ||
    !text(value.supportRevision) ||
    !hash(value.receiptHash) ||
    !adaptersValid(value.adapterVersions as Readonly<Record<string, string>>)
  )
    throw new TypeError("ENTITY_SUPPORT_POINTER_INVALID");
  return Object.freeze({
    target: parsedTarget(value.target),
    supportRevision: value.supportRevision,
    adapterVersions: Object.freeze({
      ...(value.adapterVersions as Record<string, string>),
    }),
    receiptHash: value.receiptHash,
  });
}
export function parseEntitySupportReceipt(
  value: unknown,
): EntitySupportReceipt {
  if (
    !objectKeys(value, [
      "schema",
      "target",
      "supportRevision",
      "adapterVersions",
      "qualifiedAtMs",
      "expiresAtMs",
      "results",
    ]) ||
    value.schema !== "entity-deployment-support/1" ||
    !text(value.supportRevision) ||
    !adaptersValid(value.adapterVersions as Readonly<Record<string, string>>) ||
    !Number.isSafeInteger(value.qualifiedAtMs) ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    (value.qualifiedAtMs as number) < 0 ||
    (value.expiresAtMs as number) <= (value.qualifiedAtMs as number) ||
    !Array.isArray(value.results)
  )
    throw new TypeError("ENTITY_SUPPORT_RECEIPT_INVALID");
  const results = value.results.map((item) => {
    if (
      !objectKeys(item, [
        "id",
        "version",
        "manifestHash",
        "inputSchemaHash",
        "resultSchemaHash",
        "passed",
      ]) ||
      !bindingValid(item as unknown as EntityAiManifestBindingV1) ||
      typeof item.passed !== "boolean"
    )
      throw new TypeError("ENTITY_SUPPORT_RECEIPT_INVALID");
    return Object.freeze({
      ...item,
    }) as unknown as EntitySupportReceipt["results"][number];
  });
  if (new Set(results.map((item) => item.id)).size !== results.length)
    throw new TypeError("ENTITY_SUPPORT_RECEIPT_INVALID");
  return Object.freeze({
    schema: value.schema,
    target: parsedTarget(value.target),
    supportRevision: value.supportRevision,
    adapterVersions: Object.freeze({
      ...(value.adapterVersions as Record<string, string>),
    }),
    qualifiedAtMs: value.qualifiedAtMs as number,
    expiresAtMs: value.expiresAtMs as number,
    results: Object.freeze(results),
  });
}
/** Canonical persisted bytes and receipt content identity use the same representation. */
export function entitySupportReceiptJson(
  receipt: EntitySupportReceipt,
): string {
  return canonical(parseEntitySupportReceipt(receipt));
}

function sameTarget(a: EntityServingTarget, b: EntityServingTarget): boolean {
  return (
    a.deploymentId === b.deploymentId &&
    a.configurationRevision === b.configurationRevision &&
    a.plane === b.plane &&
    a.releaseArtifactHash === b.releaseArtifactHash
  );
}
function sameBinding(
  a: EntityAiManifestBindingV1,
  b: EntityAiManifestBindingV1,
): boolean {
  return (
    a.id === b.id &&
    a.version === b.version &&
    a.manifestHash === b.manifestHash &&
    a.inputSchemaHash === b.inputSchemaHash &&
    a.resultSchemaHash === b.resultSchemaHash
  );
}

/** One evaluator for startup, activation, configuration change and admission.
 * Availability is independent of the request's mandatory authorization decision. */
export function createEntityReadinessEvaluator(options: {
  readonly lookup: (
    target: EntityServingTarget,
  ) => Promise<EntityDeploymentSupport | null>;
  readonly now?: () => number;
}) {
  return async (input: {
    readonly target: EntityServingTarget;
    readonly requirements: readonly EntityCapabilityRequirement[];
  }): Promise<EntityReadinessResult> => {
    // Snapshot inputs before crossing the asynchronous support boundary.
    const target = Object.freeze({ ...input.target });
    const requirements = input.requirements.map((item) =>
      Object.freeze({ ...item }),
    );
    if (
      !targetValid(target) ||
      requirements.some(
        (item) => !bindingValid(item) || typeof item.required !== "boolean",
      ) ||
      new Set(requirements.map((item) => item.id)).size !== requirements.length
    )
      throw new TypeError("ENTITY_READINESS_REQUIREMENTS_INVALID");
    const unavailable = (
      reason: EntityReadinessReason,
    ): EntityReadinessResult =>
      Object.freeze({
        ready: !requirements.some((item) => item.required),
        available: Object.freeze([]),
        unavailable: Object.freeze(
          requirements.map((item) =>
            Object.freeze({ id: item.id, required: item.required, reason }),
          ),
        ),
      });
    if (!requirements.length)
      return Object.freeze({
        ready: true,
        available: Object.freeze([]),
        unavailable: Object.freeze([]),
      });
    let support: EntityDeploymentSupport | null;
    try {
      support = await options.lookup(target);
    } catch {
      return unavailable("support_lookup_failed");
    }
    if (!support) return unavailable("support_unavailable");
    let current: EntityDeploymentSupportPointer;
    let receipt: EntitySupportReceipt;
    try {
      current = parseEntityDeploymentSupportPointer(support.current);
      receipt = parseEntitySupportReceipt(support.receipt);
    } catch {
      return unavailable("support_invalid");
    }
    if (
      !sameTarget(target, current.target) ||
      !sameTarget(target, receipt.target)
    )
      return unavailable("target_changed");
    if (current.supportRevision !== receipt.supportRevision)
      return unavailable("support_revision_changed");
    if (
      canonical(current.adapterVersions) !== canonical(receipt.adapterVersions)
    )
      return unavailable("adapters_changed");
    if (entitySupportReceiptHash(receipt) !== current.receiptHash)
      return unavailable("receipt_changed");
    const now = (options.now ?? Date.now)();
    if (
      !Number.isSafeInteger(now) ||
      now < receipt.qualifiedAtMs ||
      now >= receipt.expiresAtMs
    )
      return unavailable("receipt_expired");
    const available: string[] = [],
      missing: EntityReadinessResult["unavailable"][number][] = [];
    for (const requirement of requirements) {
      const qualified = receipt.results.find(
        (item) => item.id === requirement.id,
      );
      const reason = !qualified
        ? "capability_missing"
        : !sameBinding(requirement, qualified)
          ? "manifest_incompatible"
          : !qualified.passed
            ? "qualification_failed"
            : undefined;
      if (reason)
        missing.push(
          Object.freeze({
            id: requirement.id,
            required: requirement.required,
            reason,
          }),
        );
      else available.push(requirement.id);
    }
    return Object.freeze({
      ready: !missing.some((item) => item.required),
      available: Object.freeze(available),
      unavailable: Object.freeze(missing),
      receiptHash: current.receiptHash,
    });
  };
}

/** Immutable release requirements. Omitted legacy flags are optional, never proof of support. */
export function entityCapabilityRequirements(
  descriptor: Pick<
    import("./descriptors.js").EntityRuntimeDescriptor,
    "aiManifestBindings" | "ai"
  >,
): readonly EntityCapabilityRequirement[] {
  if (
    !descriptor.aiManifestBindings &&
    descriptor.ai?.insightProviders.some(
      (provider) => provider.required !== undefined,
    )
  )
    throw new TypeError("ENTITY_AI_MANIFEST_BINDINGS_REQUIRED");
  return Object.freeze(
    (descriptor.aiManifestBindings?.tools ?? []).map((binding) =>
      Object.freeze({ ...binding, required: binding.required ?? false }),
    ),
  );
}
