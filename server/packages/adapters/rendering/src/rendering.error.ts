export type RenderingErrorCategory =
  | "invalid_input"
  | "transient"
  | "timeout"
  | "unavailable"
  | "invalid_output";

export class RenderingError extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | undefined;

  constructor(
    readonly category: RenderingErrorCategory,
    message: string,
    options: { readonly retryable: boolean; readonly statusCode?: number; readonly cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "RenderingError";
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }
}
