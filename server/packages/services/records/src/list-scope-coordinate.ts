import { RecordServiceError } from "./errors.js";
export function parseEntityListScopeCoordinate(queryValue: Readonly<Record<string, unknown>>) {
  const parentRecordId = optionalUuid(queryValue["parentRecordId"], "parentRecordId");
  const parentEntityCode = queryValue["parentEntityCode"], relationshipKey = queryValue["relationshipKey"];
  const parentDescriptorHash = queryValue["parentDescriptorHash"];
  if (parentDescriptorHash !== undefined && (typeof parentDescriptorHash !== "string" || !/^[a-f0-9]{64}$/.test(parentDescriptorHash)))
    throw new RecordServiceError(400, "INVALID_PARENT_CONTEXT", "Invalid parent publication hash");
  const hasParent = [parentRecordId, parentEntityCode, relationshipKey, parentDescriptorHash].some(value => value !== undefined);
  if (hasParent && (!parentRecordId || typeof parentEntityCode !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(parentEntityCode) || typeof relationshipKey !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(relationshipKey)))
    throw new RecordServiceError(400,"INVALID_PARENT_CONTEXT","Parent entity, record and relationship must be supplied together");

  const companyCodeIds = optionalUuidList(queryValue["companyCodeIds"], "companyCodeIds");
  const operatingOrganizationIds = optionalUuidList(queryValue["operatingOrganizationIds"], "operatingOrganizationIds");
  const partnerRole = queryValue["partnerRole"] as "supplier"|"customer"|undefined;
  const eligibleOperation = queryValue["eligibleOperation"] as "order"|"invoice"|"payment"|undefined;
  if(partnerRole!==undefined && !["supplier","customer"].includes(partnerRole)) throw new RecordServiceError(400,"INVALID_ROLE","Invalid partner role");
  if(eligibleOperation!==undefined && !["order","invoice","payment"].includes(eligibleOperation)) throw new RecordServiceError(400,"INVALID_OPERATION","Invalid eligibility operation");
  const companyCodeId = optionalUuid(queryValue["companyCodeId"], "companyCodeId");
  const legalEntityId = optionalUuid(queryValue["legalEntityId"], "legalEntityId");
  const operatingOrganizationId = optionalUuid(queryValue["operatingOrganizationId"], "operatingOrganizationId");
  const networkAccountId = optionalUuid(queryValue["networkAccountId"], "networkAccountId");
  if ((companyCodeIds && (companyCodeId || legalEntityId)) || (operatingOrganizationIds && operatingOrganizationId)) throw new RecordServiceError(400,"INVALID_WORK_CONTEXT","Use either single or multiple coordinates, not both");
  if (Boolean(companyCodeId) !== Boolean(legalEntityId)) throw new RecordServiceError(400, "INVALID_WORK_CONTEXT", "companyCodeId and legalEntityId must be supplied together");
  if (!hasParent && !companyCodeIds && !operatingOrganizationIds && !companyCodeId && !operatingOrganizationId && !networkAccountId && !partnerRole && !eligibleOperation) return undefined;
  return Object.freeze({ ...(hasParent ? {parentEntityCode: parentEntityCode as string, parentRecordId: parentRecordId!, relationshipKey: relationshipKey as string, ...(parentDescriptorHash ? {parentDescriptorHash: parentDescriptorHash as string} : {})} : {}), ...(companyCodeIds ? {companyCodeIds} : {}), ...(operatingOrganizationIds ? {operatingOrganizationIds} : {}), ...(partnerRole?{partnerRole}:{}),...(eligibleOperation?{eligibleOperation}:{}), ...(companyCodeId ? { companyCodeId, legalEntityId: legalEntityId as string } : {}), ...(operatingOrganizationId ? { operatingOrganizationId } : {}), ...(networkAccountId ? { networkAccountId } : {}) });
}

function optionalUuid(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new RecordServiceError(400, "INVALID_WORK_CONTEXT", `${name} must be a UUID`);
  return value.toLowerCase();
}

function optionalUuidList(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value || value.split(",").length > 100) throw new RecordServiceError(400,"INVALID_WORK_CONTEXT",`${name} requires 1–100 UUIDs`);
  return Object.freeze([...new Set(value.split(",").map(id => optionalUuid(id, name)!))].sort());
}
