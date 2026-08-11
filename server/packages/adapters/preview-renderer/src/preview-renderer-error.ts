export type PreviewRendererErrorCode =
  | "invalid_input"
  | "unsupported_media_type"
  | "transient"
  | "timeout"
  | "unavailable"
  | "invalid_output";

export class PreviewRendererError extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | undefined;

  constructor(
    readonly code: PreviewRendererErrorCode,
    message: string,
    options: { readonly retryable: boolean; readonly statusCode?: number; readonly cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "PreviewRendererError";
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }
}
