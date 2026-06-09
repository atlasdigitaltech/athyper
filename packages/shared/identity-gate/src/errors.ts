const ERROR_MESSAGES: Record<string, string> = {
  AUTH_CALLBACK_ERROR: "We could not complete sign in. Please try again.",
  AUTH_PROVIDER_DENIED: "The identity provider did not complete sign in. Please try again.",
  CONTEXT_RESOLUTION_FAILED: "We could not resolve your access context. Please try again shortly.",
  CONTEXT_NOT_ALLOWED: "This account is not allowed to enter the selected context.",
  CONTEXT_UPDATE_FAILED: "We could not activate the selected context. Please try again.",
  CSRF_VALIDATION_FAILED: "Security validation failed. Refresh the page and try again.",
  INVALID_AUTH_CALLBACK: "The sign-in callback was incomplete. Please start again.",
  INVALID_CODE: "The verification code is invalid or expired.",
  INVALID_REALM: "The sign-in realm is not valid for this app.",
  LOGIN_EXPIRED: "The sign-in session expired. Please start again.",
  MFA_REQUIRED: "Step-up verification is required before continuing.",
  MFA_VERIFIER_UNAVAILABLE: "Verification is temporarily unavailable. Please try again shortly.",
  MISSING_CONTEXT: "Choose a valid access context before continuing.",
  NO_ACCESS_CONTEXT: "No active access context was found for this app.",
  NO_PLATFORM_ACCESS: "Your account is not authorized for this app.",
  SESSION_BINDING_MISMATCH: "For your security, this session was closed because the browser context changed.",
  SESSION_EXPIRED: "Your session expired. Please sign in again.",
  SESSION_IDLE_EXPIRED: "Your session was closed after being idle. Please sign in again.",
  SESSION_NOT_FOUND: "No active session was found. Please sign in again.",
  SESSION_REFRESH_FAILED: "We could not refresh your session. Please try again shortly.",
  SESSION_REFRESH_EXPIRED: "Your sign-in expired. Please sign in again.",
  SESSION_STORE_UNAVAILABLE: "Session services are temporarily unavailable.",
};

export function authErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  return ERROR_MESSAGES[error] ?? decodeError(error);
}

export function authErrorMessageFromSearch(params: URLSearchParams): string | null {
  const message = authErrorMessage(params.get("error"));
  if (!message) return null;
  const ref = params.get("ref") ?? params.get("requestId");
  return ref ? `${message} Reference: ${ref}` : message;
}

export function authErrorFromResponse(body: {
  error?: string;
  message?: string;
  requestId?: string;
}): string {
  const message = authErrorMessage(body.error) ?? body.message ?? "Authentication failed. Please try again.";
  return body.requestId ? `${message} Reference: ${body.requestId}` : message;
}

function decodeError(error: string): string {
  try {
    const decoded = decodeURIComponent(error).trim();
    if (!decoded) return "Authentication failed. Please try again.";
    if (decoded.length > 180) return `${decoded.slice(0, 177)}...`;
    return decoded;
  } catch {
    return "Authentication failed. Please try again.";
  }
}
