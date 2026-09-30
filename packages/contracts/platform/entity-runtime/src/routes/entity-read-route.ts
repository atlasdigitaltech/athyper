import { isCanonicalEntityCode } from "../validation/entity-code";
import { isEntityRecordId } from "../validation/record-id";

export interface EntityReadRoute {
  readonly entityCode: string;
  readonly recordId?: string;
}
export function resolveEntityReadRoute(
  entityCode: unknown,
  segments: readonly string[] = [],
): EntityReadRoute | undefined {
  if (!isCanonicalEntityCode(entityCode) || segments.length > 1)
    return undefined;
  const recordId = segments[0] === "manage" ? undefined : segments[0];
  if (recordId !== undefined && !isEntityRecordId(recordId))
    return undefined;
  return { entityCode, ...(recordId === undefined ? {} : { recordId }) };
}
