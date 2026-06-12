import "server-only";

export {
  TRACE_ID_HEADER,
  buildRuntimeHeaders,
  buildServiceUrl,
  copySetCookieHeaders,
  copyTraceResponseHeaders,
  safePathFromSegments,
  sanitizeContentDisposition,
  withTraceResponseHeaders,
} from "@athyper/bff-relay";

export const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

export function buildRuntimeUrl(pathname: string): string {
  return `${RUNTIME_API_URL.replace(/\/+$/, "")}${pathname}`;
}
