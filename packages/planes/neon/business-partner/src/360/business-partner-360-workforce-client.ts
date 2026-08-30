import {createOperation,encodePathSegment,type HttpClient} from "@athyper/platform-api-client";
import type {SummaryQuery} from "./business-partner-360-client";

export interface WorkforceSection {readonly schemaVersion:1;readonly sectionCode:"workforce";readonly state:"ready"|"empty"|"partial"|"unavailable";readonly data:Readonly<Record<string,unknown>>;}
export interface WorkforceQuery extends SummaryQuery {readonly sectionCode:"workforce";}
export interface PersonEvidenceReveal {readonly personId:string;readonly purpose:string;readonly expiresAt:string;readonly fields:Readonly<Record<string,unknown>>;readonly redactedFields:readonly string[];}
export type EvidencePurpose="employment"|"payroll"|"benefits"|"compliance";

const read=createOperation<WorkforceSection>({method:"GET",path:({businessPartnerId})=>`/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/360/workforce`,parse:parseWorkforce});
const reveal=createOperation<PersonEvidenceReveal,Readonly<{purpose:EvidencePurpose;fields:readonly string[]}>>({method:"POST",path:({personId})=>`/api/neon/people/${encodePathSegment(personId)}/restricted-evidence/read`,parse:parseReveal});

export function createBusinessPartner360WorkforceClient(http:HttpClient){return{
  read:(query:WorkforceQuery,signal?:AbortSignal)=>http.request(read,{params:{businessPartnerId:query.businessPartnerId},query:{roleLens:query.roleLens,...(query.operatingOrganizationId?{operatingOrganizationId:query.operatingOrganizationId}:{}),...(query.companyCodeId?{companyCodeId:query.companyCodeId}:{}),...(query.legalEntityId?{legalEntityId:query.legalEntityId}:{}),...(query.asOf?{asOf:query.asOf}:{}),permissionEpoch:query.authEpoch},signal}),
  reveal:(personId:string,purpose:EvidencePurpose,fields:readonly string[],signal?:AbortSignal)=>http.request(reveal,{params:{personId},body:{purpose,fields},signal}),
};}
export function workforceQueryKey(query:WorkforceQuery){return["business-partner-360",query.tenantId,query.principalId,query.businessPartnerId,"workforce",query.roleLens,query.operatingOrganizationId??"global",query.companyCodeId??"no-company",query.legalEntityId??"no-legal-entity",query.asOf??"current",query.authEpoch]as const;}
export function isWorkforcePayloadSafe(value:unknown){return !/(?:dateOfBirth|nationalId|taxIdentifier|passportNumber|compensation|salary|regularRate|billRate|notToExceed|sensitiveEvidence|protectedAttributes)/i.test(JSON.stringify(value));}
function parseWorkforce(value:unknown){const body=record(value);if(!isWorkforcePayloadSafe(body))throw new TypeError("Workforce section contains a restricted field");if(body["schemaVersion"]!==1||body["sectionCode"]!=="workforce"||!record(body["data"]))throw new TypeError("Workforce section contract is invalid");return body as unknown as WorkforceSection;}
function parseReveal(value:unknown){const body=record(value);if(typeof body["personId"]!=="string"||typeof body["purpose"]!=="string"||typeof body["expiresAt"]!=="string"||!record(body["fields"])||!Array.isArray(body["redactedFields"]))throw new TypeError("Restricted evidence response is invalid");return body as unknown as PersonEvidenceReveal;}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Expected an object response");return value as Record<string,unknown>;}
