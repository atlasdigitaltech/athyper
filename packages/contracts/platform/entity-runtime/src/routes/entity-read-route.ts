import { isCanonicalEntityCode } from "../validation/entity-code";
import { isEntityRecordId } from "../validation/record-id";

export interface EntityReadRoute {
  readonly entityCode: string;
  readonly recordId?: string;
  /** `/app/entity/{code}/me`: the caller's own record, resolved by the server. */
  readonly own?: true;
}
export function resolveEntityReadRoute(
  entityCode: unknown,
  segments: readonly string[] = [],
): EntityReadRoute | undefined {
  if (!isCanonicalEntityCode(entityCode) || segments.length > 1)
    return undefined;
  if (segments[0] === "me") return { entityCode, own: true };
  const recordId = segments[0] === "manage" ? undefined : segments[0];
  if (recordId !== undefined && !isEntityRecordId(recordId))
    return undefined;
  return { entityCode, ...(recordId === undefined ? {} : { recordId }) };
}
