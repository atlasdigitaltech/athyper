import type {
  ActivityCollectionBinding,
  ActivityBinding,
} from "@athyper/server-contract-publication";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type {
  ActivitySubject,
  ActivityAdmission,
} from "@athyper/server-platform-experience";
import type { CollectionComparisonAuthorization } from "@athyper/server-service-records";

/** Installed owning implementation. Both qualification functions must verify the
 * pinned source contract, projection, scope and writer limits; registration is not
 * permission to interpret arbitrary metadata or query arbitrary foreign tables. */
export interface ActivityCollectionProviderRegistration {
  /** Reads authorized root and declared sections using ONLY the supplied transaction.
   * No remote/network reads or nested transactions qualify as a consistent capture. */
  captureConsistent?(input: {
    subject: ActivitySubject;
    admission: ActivityAdmission;
    descriptor: EntityRuntimeDescriptor;
    rootFields: readonly string[];
    transaction: import("kysely").Transaction<Record<string, never>>;
  }): Promise<{
    record: Readonly<Record<string, unknown>>;
    owned: Readonly<Record<string, unknown>>;
    sourceRecordVersion?: number;
  }>;
  /** Separately observed reference data, never claimed as the root transaction's state.
   * Must return a bounded versioned envelope with its actual source observation time. */
  captureIndependent?(input:{subject:ActivitySubject;admission:ActivityAdmission;binding:ActivityCollectionBinding}):Promise<unknown>;
  qualifyGraph(graph: MetaEntityGraph, binding: ActivityBinding): Promise<void>;
  qualifyRuntime(input: {
    subject: ActivitySubject;
    admission: ActivityAdmission;
    descriptor: EntityRuntimeDescriptor;
    binding: ActivityCollectionBinding;
  }): Promise<void>;
  /** Must authorize section discovery, retained/deleted rows, fields and targets
   * using CURRENT access. Returning a capture-time policy is invalid. */
  authorize(input: {
    subject: ActivitySubject;
    admission: ActivityAdmission;
    descriptor: EntityRuntimeDescriptor;
    binding: ActivityCollectionBinding;
  }): Promise<CollectionComparisonAuthorization>;
}
export function assertCollectionProvider(
  value: ActivityCollectionProviderRegistration | undefined,
): asserts value is ActivityCollectionProviderRegistration {
  if (
    !value ||
    typeof value.qualifyGraph !== "function" ||
    typeof value.qualifyRuntime !== "function" ||
    typeof value.authorize !== "function"
  )
    throw Error("ACTIVITY_COLLECTION_PROVIDER_UNAVAILABLE");
}
