import { expect, it } from "vitest";
import { isEntityRecordId } from "@athyper/contract-platform-entity-runtime";
import { parseRecordListParameters } from "./records-routes.js";
import { scopeRecordOwnerRead } from "./record-owner-access.js";
it("uses route identity syntax for bounded record selections without a separate UUID version policy", () => {
 const recordId="00000000-0000-0000-0000-000000000000";
 expect(isEntityRecordId(recordId)).toBe(true);
 expect(parseRecordListParameters({recordIds:[recordId,recordId]}).recordIds).toEqual([recordId]);
 for(const recordIds of [[],["invalid"],Array(101).fill(recordId)]) expect(()=>parseRecordListParameters({recordIds})).toThrow();
});
it("reports an invalid internal owner scope as a typed server error", () => {
 expect(()=>scopeRecordOwnerRead({ownerAccess:{ownerField:"owner_id"}} as never,{owner_id:42})).toThrowError(expect.objectContaining({statusCode:500,code:"ENTITY_OWNER_SCOPE_INVALID"}));
});
