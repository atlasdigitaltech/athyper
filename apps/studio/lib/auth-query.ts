type QueryValue = string | readonly string[] | undefined;

/** Next.js represents repeated query parameters as arrays. */
export function readSignInQuery(params: Readonly<Record<string, QueryValue>>) {
  const first = (value: QueryValue) =>
    typeof value === "string" ? value : value?.[0];
  return {
    reason: first(params.reason),
    returnTo: first(params.returnTo),
    requestId: first(params.requestId),
  };
}
