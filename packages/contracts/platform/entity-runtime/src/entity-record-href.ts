/** Canonical record route. Workflow-specific routes remain owned by their extension. */
export function parseEntityApplicationPath(pathname: string): {entityCode:string;segments:readonly string[]}|undefined {
  if (!pathname.startsWith("/app/entity/")) return undefined;
  const raw = pathname.slice("/app/entity/".length).replace(/\/$/, "").split("/");
  try {
    const [entityCode, ...segments] = raw.map(value => decodeURIComponent(value));
    if (!entityCode || !/^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(entityCode)) return undefined;
    if (segments.some(value => !value || value === "." || value === ".." || /[\\/?#%\s\u0000-\u001f\u007f]/.test(value))) return undefined;
    return {entityCode,segments};
  } catch { return undefined; }
}

export function entityApplicationHref(entityCode: string): string {
  return `/app/entity/${encodeURIComponent(entityCode)}`;
}

export function entityRecordRouteTemplate(entityCode: string): string {
  return `${entityApplicationHref(entityCode)}/{recordId}`;
}

export function entityRecordHref(entityCode: string, recordId: string, query?: URLSearchParams): string {
  return `${entityApplicationHref(entityCode)}/${encodeURIComponent(recordId)}${query?.size ? `?${query}` : ""}`;
}
