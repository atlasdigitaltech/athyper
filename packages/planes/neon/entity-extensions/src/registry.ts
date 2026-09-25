import type { EntityRecordAdapter } from "@athyper/platform-entity-form-detail/record";
import { businessPartnerRecordAdapter } from "./business-partner/adapter";
import { isRecordEntityCode, type RecordEntityCode } from "./record-entities";
const adapters: Readonly<Record<RecordEntityCode, EntityRecordAdapter>> = Object.freeze({
  business_partner: businessPartnerRecordAdapter,
});
/** Registration is not authorization; runtime APIs enforce access. */
export function resolveEntityRecordAdapter(entityCode: string): EntityRecordAdapter | undefined {
  return isRecordEntityCode(entityCode) ? adapters[entityCode] : undefined;
}
