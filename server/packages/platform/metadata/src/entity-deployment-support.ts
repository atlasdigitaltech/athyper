import { createHash } from "node:crypto";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import {
  entitySupportReceiptJson,
  parseEntityDeploymentSupportPointer,
  parseEntitySupportReceipt,
  type EntityDeploymentSupport,
  type EntityDeploymentSupportPointer,
  type EntityServingTarget,
  type EntitySupportReceipt,
} from "@athyper/server-contract-metadata";

/** Bucket and credentials belong to host composition. No update/delete receipt API. */
export class ImmutableEntitySupportReceiptStore {
  private readonly storage: Pick<ObjectStorage, "get"> & {
    putIfAbsent: NonNullable<ObjectStorage["putIfAbsent"]>;
  };

  constructor(storage: Pick<ObjectStorage, "get" | "putIfAbsent">) {
    if (!storage.putIfAbsent)
      throw new TypeError("ENTITY_SUPPORT_ATOMIC_STORAGE_REQUIRED");
    this.storage = {
      get: storage.get.bind(storage),
      putIfAbsent: storage.putIfAbsent.bind(storage),
    };
  }

  async put(receipt: EntitySupportReceipt): Promise<string> {
    // Snapshot before I/O; key and bytes must describe the same qualification.
    const bytes = new TextEncoder().encode(entitySupportReceiptJson(receipt));
    const receiptHash = digest(bytes);
    const key = receiptKey(receiptHash);
    const created = await this.storage.putIfAbsent(key, bytes, {
      contentType: "application/json",
      metadata: { sha256: receiptHash, schema: "entity-deployment-support/1" },
    });
    if (!created && digest(await this.storage.get(key)) !== receiptHash)
      throw new TypeError("ENTITY_SUPPORT_IMMUTABILITY_CONFLICT");
    return receiptHash;
  }

  async get(receiptHash: string): Promise<EntitySupportReceipt> {
    const bytes = await this.storage.get(receiptKey(receiptHash));
    if (digest(bytes) !== receiptHash)
      throw new TypeError("ENTITY_SUPPORT_RECEIPT_CHANGED");
    return parseEntitySupportReceipt(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  }
}

/** Current support is an authority read on every evaluation, never a receipt cache.
 * The host supplies a deployment/configuration lookup; metadata cannot select it.
 * Missing evidence and I/O failures are left to the shared readiness evaluator.
 */
export function createEntityDeploymentSupportLookup(options: {
  readonly receipts: Pick<ImmutableEntitySupportReceiptStore, "get">;
  readonly current: (
    target: EntityServingTarget,
  ) => Promise<EntityDeploymentSupportPointer | null>;
}): (target: EntityServingTarget) => Promise<EntityDeploymentSupport | null> {
  return async (target) => {
    const requested = Object.freeze({ ...target });
    const raw = await options.current(requested);
    if (!raw) return null;
    // Detach the pointer before the asynchronous immutable read.
    const current = parseEntityDeploymentSupportPointer(raw);
    const receipt = await options.receipts.get(current.receiptHash);
    // A receipt read may cross a configuration change or support revocation.
    // Never return evidence for authority that changed while storage was read.
    // This brackets I/O; callers still own configuration/admission coordination.
    const latest = await options.current(requested);
    if (
      !latest ||
      pointerIdentity(current) !==
        pointerIdentity(parseEntityDeploymentSupportPointer(latest))
    )
      throw new TypeError("ENTITY_SUPPORT_AUTHORITY_CHANGED");
    return Object.freeze({ current, receipt });
  };
}

function pointerIdentity(pointer: EntityDeploymentSupportPointer): string {
  return JSON.stringify([
    pointer.target.deploymentId,
    pointer.target.configurationRevision,
    pointer.target.plane,
    pointer.target.releaseArtifactHash,
    pointer.supportRevision,
    pointer.receiptHash,
    Object.entries(pointer.adapterVersions).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  ]);
}

function receiptKey(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new TypeError("ENTITY_SUPPORT_RECEIPT_HASH_INVALID");
  return `entity-framework/deployment-support/v1/receipts/${hash}.json`;
}
function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
