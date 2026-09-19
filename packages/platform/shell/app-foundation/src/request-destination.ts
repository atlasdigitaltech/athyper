import { sanitizeReturnTo } from "@athyper/platform-iam-session";

export { sanitizeReturnTo };
export const REQUEST_DESTINATION_HEADER = "x-athyper-request-destination";

/** Called by the app proxy on every page request, including RSC navigation. */
export function destinationRequestHeaders(request: { readonly url: string; readonly headers: Headers }): Headers {
  const url = new URL(request.url);
  // Next's transport cache key is not part of the user's destination.
  const query = url.search.slice(1).split("&").filter((part) => !new URLSearchParams(part).has("_rsc")).join("&");
  const search = query ? `?${query}` : "";
  const headers = new Headers(request.headers);
  headers.set(REQUEST_DESTINATION_HEADER, sanitizeReturnTo(`${url.pathname}${search}`));
  return headers;
}

export function readRequestDestination(headers: Headers): string {
  return sanitizeReturnTo(headers.get(REQUEST_DESTINATION_HEADER));
}
