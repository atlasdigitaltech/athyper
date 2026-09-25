import type { PartnerRequest } from "./client";
import type { GovernedCaseStatusV1 } from "@athyper/contract-platform-entity-runtime";
export type RequestAction="edit"|"validate"|"submit"|"return"|"reject"|"approve"|"apply"|"open_partner";
export function statusTone(status:PartnerRequest["status"]|GovernedCaseStatusV1):"neutral"|"success"|"warning"|"danger"{if(["applied","approved","materialized"].includes(status))return"success";if(["rejected","failed","cancelled"].includes(status))return"danger";if(["validation_failed","returned","pending_approval","in_review","conflicted"].includes(status))return"warning";return"neutral";}
