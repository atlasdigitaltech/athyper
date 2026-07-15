export function entityCodeFromRouteSegment(segment: string): string {
  return safeDecode(segment).trim().replace(/-/g, "_");
}

export function entitySlugFromCode(entityCode: string): string {
  return safeDecode(entityCode).trim().replace(/_/g, "-");
}

export function appEntityListHref(entityCode: string, query?: string | URLSearchParams): string {
  return withQuery(`/app/${encodeURIComponent(entitySlugFromCode(entityCode))}`, query);
}

export function appEntityNewHref(entityCode: string, query?: string | URLSearchParams): string {
  return withQuery(`${appEntityListHref(entityCode)}/new`, query);
}

export function appEntityDetailHref(
  entityCode: string,
  recordId: string,
  subroute?: string,
  query?: string | URLSearchParams,
): string {
  const base = `${appEntityListHref(entityCode)}/${encodeURIComponent(recordId)}`;
  const suffix = subroute
    ? `/${subroute.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`
    : "";
  return withQuery(`${base}${suffix}`, query);
}

export function normalizeAppEntityHref(href: string): string {
  const match = /^\/app\/([^/?#]+)(.*)$/.exec(href);
  if (!match) return href;
  const [, rawEntity, rest = ""] = match;
  if (!rawEntity) return href;
  return `/app/${encodeURIComponent(entitySlugFromCode(entityCodeFromRouteSegment(rawEntity)))}${rest}`;
}

function withQuery(path: string, query?: string | URLSearchParams): string {
  if (!query) return path;
  const text = typeof query === "string" ? query.replace(/^\?/, "") : query.toString();
  return text ? `${path}?${text}` : path;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
