/** Only entities with an implemented record extension are routed to this surface. */
export const recordEntityCodes = ["business_partner"] as const;
export type RecordEntityCode = (typeof recordEntityCodes)[number];
/** Existing catalog authorization paths remain authoritative during URL migration. */
export const recordAuthorizationPaths: Readonly<Record<RecordEntityCode, string>> = Object.freeze({
  business_partner: "/mdg/business-partner",
});
export function isRecordEntityCode(value: string): value is RecordEntityCode {
  return recordEntityCodes.some(code => code === value);
}
