import type { Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { createEntityRuntimeResourceService } from "@athyper/server-platform-experience";

type Sections = Parameters<
  typeof createEntityRuntimeResourceService
>[0]["sections"];
export type CollaborationServiceLookup = NonNullable<Sections["getService"]>;
export type CollaborationSectionProvider = NonNullable<
  ReturnType<CollaborationServiceLookup>
>;
export type CollaborationTransactions = PlaneTransactionCoordinator<
  Transaction<Record<string, never>>
>;
