export const financeErrorCodes = [
  "FINANCE_INVALID_COMMAND",
  "FINANCE_IDEMPOTENCY_CONFLICT",
  "FINANCE_EXPECTED_VERSION_CONFLICT",
  "FINANCE_PERIOD_CLOSED",
  "FINANCE_UNBALANCED_POSTING",
  "FINANCE_PERMISSION_DENIED",
  "FINANCE_NOT_FOUND",
  "FINANCE_BUDGET_OVESPEND",
  "FINANCE_INSUFFICIENT_STOCK",
  "FINANCE_INVENTORY_REBUILD_MISMATCH",
  "FINANCE_INVALID_STATE_TRANSITION",
  "FINANCE_IMMUTABLE_EVIDENCE",
] as const;

export type FinanceErrorCode = (typeof financeErrorCodes)[number];

export class FinanceContractError extends Error {
  constructor(readonly code: FinanceErrorCode, message: string = code, readonly details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "FinanceContractError";
  }
}
