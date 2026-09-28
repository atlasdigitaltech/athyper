import { isCanonicalEntityCode } from "../validation/entity-code";

export interface EntityReadRoute {
  readonly entityCode: string;
  readonly recordId?: string;
}
/** URL record syntax only, deliberately not a UUID version/variant policy.
 * Storage/admission contracts retain their stricter UUID requirements. */
const recordIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function resolveEntityReadRoute(
  entityCode: unknown,
  segments: readonly string[] = [],
): EntityReadRoute | undefined {
  if (!isCanonicalEntityCode(entityCode) || segments.length > 1)
    return undefined;
  const recordId = segments[0] === "manage" ? undefined : segments[0];
  if (recordId !== undefined && !recordIdPattern.test(recordId))
    return undefined;
  return { entityCode, ...(recordId === undefined ? {} : { recordId }) };
}
