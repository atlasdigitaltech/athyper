import { FinanceContractError, type FinanceActor } from "@athyper/server-contract-finance";
import { decimalUnits } from "../shared/decimal.js";

export type ExternalClaimSource =
  | { readonly kind: "external_time_sheet"; readonly id: string }
  | { readonly kind: "external_expense_sheet"; readonly id: string }
  | { readonly kind: "statement_of_work_item"; readonly id: string };

export interface ServiceSheetSourceAllocationCommand {
  readonly actor: FinanceActor;
  readonly serviceSheetLineId: string;
  readonly source: ExternalClaimSource;
  readonly acceptedQuantity?: string;
  readonly acceptedAmount: string;
  readonly currencyCode: string;
  readonly sourceSnapshot: Readonly<Record<string, unknown>>;
  readonly sourceSnapshotHash: string;
  readonly idempotencyKey: string;
  readonly reversesAllocationId?: string;
}

export interface ServiceSheetSourceAllocation {
  readonly id: string;
  readonly serviceSheetLineId: string;
  readonly source: ExternalClaimSource;
  readonly acceptedQuantity?: string;
  readonly acceptedAmount: string;
  readonly currencyCode: string;
  readonly reversesAllocationId?: string;
  readonly idempotencyKey: string;
}

export interface ServiceSheetSourceAllocationRepository<Transaction> {
  append(command: ServiceSheetSourceAllocationCommand, transaction: Transaction): Promise<ServiceSheetSourceAllocation>;
}

interface TransactionRunner<Transaction> {
  run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>;
}

/** Canonical NEON acceptance bridge. It never writes the deprecated external_service_entry tables. */
export class ExternalWorkforceServiceSheetService<Transaction> {
  constructor(private readonly options: {
    readonly transactions: TransactionRunner<Transaction>;
    readonly allocations: ServiceSheetSourceAllocationRepository<Transaction>;
  }) {}

  async allocate(command: ServiceSheetSourceAllocationCommand): Promise<ServiceSheetSourceAllocation> {
    validate(command);
    return await this.options.transactions.run(command.actor, transaction =>
      this.options.allocations.append(command, transaction));
  }
}

function validate(command: ServiceSheetSourceAllocationCommand): void {
  if (command.actor.planeKey !== "neon") {
    throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Service acceptance executes only in NEON");
  }
  if (!command.serviceSheetLineId || !command.source.id || !/^[A-Z]{3}$/.test(command.currencyCode)) {
    throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Service-sheet allocation coordinates are incomplete");
  }
  if (decimalUnits(command.acceptedAmount, 4, "acceptedAmount") <= 0n
      || (command.acceptedQuantity !== undefined && decimalUnits(command.acceptedQuantity, 4, "acceptedQuantity") <= 0n)) {
    throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Accepted quantity and amount must be positive");
  }
  if (!/^[a-f0-9]{64}$/.test(command.sourceSnapshotHash)
      || command.idempotencyKey.trim() !== command.idempotencyKey
      || command.idempotencyKey.length < 8 || command.idempotencyKey.length > 200) {
    throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Allocation evidence or idempotency key is invalid");
  }
}
