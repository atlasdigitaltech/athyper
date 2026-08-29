export type AtlasServiceErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_ARGUMENT"
  | "ADMISSION_DENIED"
  | "PERMISSION_DENIED"
  | "THREAD_NOT_FOUND"
  | "THREAD_NOT_ACTIVE"
  | "VERSION_CONFLICT"
  | "MODEL_NOT_AVAILABLE"
  | "BINDING_POLICY_DENIED"
  | "CREDENTIAL_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_PROTOCOL_ERROR"
  | "QUOTA_EXCEEDED"
  | "IDEMPOTENCY_CONFLICT"
  | "TOOL_DENIED"
  | "TOOL_INVALID"
  | "TOOL_IN_PROGRESS"
  | "TOOL_CANCELLED"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_INVALID"
  | "STALE_PROPOSAL"
  | "RESULT_TOO_LARGE"
  | "DOCUMENT_REJECTED"
  | "ATTACHMENT_NOT_READY"
  | "REVIEW_REQUIRED";

export class AtlasServiceError extends Error {
  override readonly name = "AtlasServiceError";
  constructor(readonly code: AtlasServiceErrorCode, message: string) { super(message); }
}
