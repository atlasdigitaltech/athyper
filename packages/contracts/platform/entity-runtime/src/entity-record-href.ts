import { isCanonicalEntityCode } from "./validation/entity-code";
import { isEntityRecordId } from "./validation/record-id";

/** Parses a safe application path shape. It deliberately permits extension
 * segments; use resolveEntityReadRoute for the canonical Entity read grammar. */
export function parseEntityApplicationPath(pathname: string): {entityCode:string;segments:readonly string[]}|undefined {
  if (!pathname.startsWith("/app/entity/")) return undefined;
  const raw = pathname.slice("/app/entity/".length).replace(/\/$/, "").split("/");
  try {
    const [entityCode, ...segments] = raw.map(value => decodeURIComponent(value));
    if (!isCanonicalEntityCode(entityCode)) return undefined;
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
  if (!isCanonicalEntityCode(entityCode) || !isEntityRecordId(recordId))
    throw new TypeError("Entity record route is invalid");
  return `${entityApplicationHref(entityCode)}/${encodeURIComponent(recordId)}${query?.size ? `?${query}` : ""}`;
}
