import type { PartnerRequest } from "./client";
export type RequestAction="edit"|"validate"|"submit"|"return"|"reject"|"approve"|"apply"|"open_partner";
export function statusTone(status:PartnerRequest["status"]):"neutral"|"success"|"warning"|"danger"{if(["applied","approved"].includes(status))return"success";if(["rejected","failed","cancelled"].includes(status))return"danger";if(["validation_failed","returned","pending_approval"].includes(status))return"warning";return"neutral";}
