import type {BusinessPartner360Section} from "./business-partner-360.js";

export interface BusinessPartner360NetworkProvenance {
  readonly authority:"neon"|"mesh";
  readonly authorityTenantId?:string;
  readonly sourceObject:string;
  readonly observedAt:string;
  readonly schemaCode:string;
  readonly schemaVersion:number;
  readonly fieldSetCode:string;
  readonly hash:string;
  readonly freshness:"fresh"|"stale";
}

export interface BusinessPartner360NetworkLocalData {
  readonly accountLink:Readonly<{id:string;networkRelationshipId:string;sourceTenantId:string;sourceNetworkAccountId:string;recipientNetworkAccountId:string;proposedRole:"supplier"|"customer";status:string;approvedAt?:string;terminatedAt?:string}>;
  readonly received:Readonly<{snapshotId:string;publicationId:string;publicationVersion:number;lifecycleVersion:number;state:"received"|"withdrawn";receivedAt:string}>;
  readonly match?:Readonly<{id:string;state:"matched";algorithmCode:string;algorithmVersion:number;matchedAt:string;diffHash:string;fieldPaths:readonly string[]}>;
  readonly acceptance?:Readonly<{id:string;state:"prepared"|"request_created";acceptedFields:readonly string[];ignoredFields:readonly string[];acceptanceHash:string;preparedAt:string;businessPartnerRequestId?:string;recordedAt?:string}>;
  readonly bankDisclosure:Readonly<{present:boolean;status?:string;disclosureVersion?:number;lifecycleVersion?:number;observedAt?:string}>;
  readonly provenance:readonly BusinessPartner360NetworkProvenance[];
}

export interface BusinessPartner360MeshNetworkSummary {
  readonly authorization:Readonly<{decision:"granted";permissionCode:string;networkRelationshipId:string}>;
  readonly relationship:Readonly<{id:string;status:string;relationshipType:string;direction:string;effectiveFrom?:string;effectiveUntil?:string}>;
  readonly publication?:Readonly<{id:string;status:"published"|"withdrawn";publicationVersion:number;lifecycleVersion:number;publishedAt:string;withdrawnAt?:string}>;
  readonly provenance:readonly BusinessPartner360NetworkProvenance[];
}

export interface BusinessPartner360NetworkData {
  readonly local?:BusinessPartner360NetworkLocalData;
  readonly live:Readonly<{state:"ready"|"denied"|"stale"|"unavailable"|"not_requested";reasonCode?:string;summary?:BusinessPartner360MeshNetworkSummary}>;
}

export type BusinessPartner360NetworkSection=BusinessPartner360Section<BusinessPartner360NetworkData>;
