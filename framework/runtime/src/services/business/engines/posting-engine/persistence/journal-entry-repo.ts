// framework/runtime/src/services/business/engines/posting-engine/persistence/journal-entry-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  JournalEntry,
  JournalLine,
  CreateJournalEntryInput,
  JEStatus,
} from "../domain/types.js";
import type { TransactionContext } from "../services/posting-service.js";

export interface JournalEntryRepo {
  create(
    input: CreateJournalEntryInput & {
      jeNumber: string;
      fiscalYear: number;
      periodNumber: number;
      totalDebit: string;
      totalCredit: string;
    },
    tx?: TransactionContext,
  ): Promise<JournalEntry>;

  getById(tenantId: string, id: string): Promise<JournalEntry | null>;
  getByJeNumber(
    tenantId: string,
    entityCode: string,
    jeNumber: string,
  ): Promise<JournalEntry | null>;

  /** Find non-reversed JE for a document (no-post-twice check) */
  findByDocIdAndType(
    tenantId: string,
    docId: string,
    docType: string,
  ): Promise<JournalEntry | null>;

  updateStatus(
    tenantId: string,
    id: string,
    status: JEStatus,
    tx?: TransactionContext,
  ): Promise<JournalEntry>;
  setReversalLink(
    tenantId: string,
    id: string,
    reversedById: string,
  ): Promise<void>;

  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      fiscalYear?: number;
      periodNumber?: number;
      status?: JEStatus;
      txnId?: string;
      docId?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<JournalEntry>>;

  getLinesByJeId(tenantId: string, jeId: string): Promise<JournalLine[]>;
}
