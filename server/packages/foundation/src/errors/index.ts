export interface ErrorOptions {
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
}

/** Base error for capability-neutral infrastructure and invariant failures. */
export class FoundationError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, options: ErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "FoundationError";
    this.code = code;
    this.details = options.details;
  }
}

export class InvariantError extends FoundationError {
  constructor(message: string, options?: ErrorOptions) {
    super("INVARIANT_VIOLATION", message, options);
    this.name = "InvariantError";
  }
}
