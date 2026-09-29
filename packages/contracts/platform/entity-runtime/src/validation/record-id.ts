/** URL and API record identity syntax, shared by the browser route and the
 * server so both layers accept exactly the same values. Deliberately not a
 * UUID version/variant policy; storage and admission contracts keep theirs. */
const recordIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isEntityRecordId(value: unknown): value is string {
  return typeof value === "string" && recordIdPattern.test(value);
}
