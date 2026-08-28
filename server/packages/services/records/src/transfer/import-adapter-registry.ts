import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { GovernedImportAdapter, RecordImportOperation } from "@athyper/server-contract-records";

/** Immutable registry. A session persists the selected key so worker rollout cannot change write semantics. */
export class GovernedImportAdapterRegistry<Transaction> {
  readonly #byKey: ReadonlyMap<string, GovernedImportAdapter<Transaction>>;

  constructor(adapters: readonly GovernedImportAdapter<Transaction>[]) {
    const byKey = new Map<string, GovernedImportAdapter<Transaction>>();
    for (const adapter of adapters) {
      if (!/^[a-z][a-z0-9_.-]{2,126}$/.test(adapter.key)) throw new Error(`Invalid governed import adapter key: ${adapter.key}`);
      if (byKey.has(adapter.key)) throw new Error(`Duplicate governed import adapter key: ${adapter.key}`);
      byKey.set(adapter.key, adapter);
    }
    this.#byKey = byKey;
  }

  select(descriptor: EntityRuntimeDescriptor, operation: RecordImportOperation): GovernedImportAdapter<Transaction> {
    const declaredKey=descriptor.listPresentation?.dataOperations?.importAdapterKey;
    if(!declaredKey)throw new Error(`No governed import adapter capability is published for ${descriptor.planeKey}.${descriptor.entityCode}`);
    const matches = [...this.#byKey.values()].filter((candidate) => candidate.key===declaredKey&&candidate.supports(descriptor) && candidate.operations(descriptor).includes(operation));
    if (matches.length === 0) throw new Error(`No governed import adapter supports ${descriptor.planeKey}.${descriptor.entityCode}:${operation}`);
    if (matches.length > 1) throw new Error(`Multiple governed import adapters support ${descriptor.planeKey}.${descriptor.entityCode}:${operation}`);
    return matches[0]!;
  }

  resolve(key: string, descriptor: EntityRuntimeDescriptor, operation: RecordImportOperation): GovernedImportAdapter<Transaction> {
    const adapter = this.#byKey.get(key);
    if (descriptor.listPresentation?.dataOperations?.importAdapterKey!==key || !adapter || !adapter.supports(descriptor) || !adapter.operations(descriptor).includes(operation)) {
      throw new Error(`Governed import adapter ${key} is unavailable for ${descriptor.planeKey}.${descriptor.entityCode}:${operation}`);
    }
    return adapter;
  }
}
