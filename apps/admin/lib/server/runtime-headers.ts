import "server-only";

export {
  TRACE_ID_HEADER,
  buildRuntimeHeaders,
  buildServiceUrl,
  copyTraceResponseHeaders,
  safePathFromSegments,
  sanitizeContentDisposition,
  withTraceResponseHeaders,
} from "@athyper/platform-bff-relay";

import {
  buildRuntimeApiUrl,
  normalizeRuntimeApiUrl,
} from "@athyper/platform-bff-relay";

export const RUNTIME_API_URL = normalizeRuntimeApiUrl(
  process.env.RUNTIME_API_URL ?? "http://localhost:4000",
);

export function buildRuntimeUrl(pathname: string): string {
  return buildRuntimeApiUrl(RUNTIME_API_URL, pathname);
}
