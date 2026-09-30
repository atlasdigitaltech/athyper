export type ContentExtractionErrorCode =
  | "EXTRACTION_CANCELLED"
  | "EXTRACTION_UNAVAILABLE"
  | "EXTRACTION_TIMEOUT"
  | "EXTRACTION_SIZE_LIMIT"
  | "EXTRACTION_FAILED";
export class ContentExtractionError extends Error {
  override readonly name = "ContentExtractionError";
  constructor(
    readonly code: ContentExtractionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
