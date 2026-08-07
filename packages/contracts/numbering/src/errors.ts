export class NumberingAllocationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NumberingAllocationError";
  }
}

export class NumberingExhaustedError extends Error {
  constructor(
    public readonly policyCode: string,
    public readonly scopeKey: string,
  ) {
    super(`Numbering policy ${policyCode} has no remaining values for scope "${scopeKey}".`);
    this.name = "NumberingExhaustedError";
  }
}

/**
 * Thrown when an optimistic-lock conflict occurs on the counter row.
 * retryable = true — callers should retry with exponential backoff up to a
 * reasonable limit before escalating.
 */
export class NumberingConflictError extends Error {
  readonly retryable = true;
  readonly retryAfterMs: number;

  constructor(
    public readonly policyCode: string,
    public readonly attempt: number,
  ) {
    super(`Counter conflict on "${policyCode}" at attempt ${attempt}.`);
    this.name = "NumberingConflictError";
    this.retryAfterMs = Math.min(50 * 2 ** attempt, 500);
  }
}
