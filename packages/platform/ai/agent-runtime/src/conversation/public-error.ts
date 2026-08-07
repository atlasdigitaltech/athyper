/**
 * Converts normalized server error codes into customer-safe copy. Provider
 * error bodies and diagnostic messages must never be rendered directly.
 */
export function atlasRunFailureMessage(code: string): string {
  switch (code) {
    case "permission_denied":
    case "forbidden":
      return "You do not have permission to use Atlas for this request.";
    case "model_unavailable":
    case "provider_unavailable":
    case "overloaded":
      return "This Atlas mode is temporarily unavailable. Please try again shortly.";
    case "stale_model_catalog":
      return "Your available Atlas modes changed. Please try the request again.";
    case "rate_limited":
    case "quota_exhausted":
      return "Atlas is receiving too many requests. Please try again shortly.";
    case "content_filtered":
    case "refusal":
      return "Atlas could not answer that request. Try rephrasing it.";
    case "timeout":
    case "stream_incomplete":
      return "The Atlas response ended early. Please try again.";
    case "cancelled":
      return "The Atlas response was stopped.";
    default:
      return "Atlas could not complete this response. Please try again.";
  }
}
