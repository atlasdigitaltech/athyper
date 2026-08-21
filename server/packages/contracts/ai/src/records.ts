import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordFilter, RecordSort } from "@athyper/server-contract-records";

export interface AtlasRecordSourceCoordinate {
  readonly entityCode: string;
  readonly recordId: string;
  readonly revision: string;
  readonly descriptorHash: string;
}
export interface AtlasRecordQuery {
  readonly entityCode: string;
  readonly fields: readonly string[];
  readonly filters?: readonly RecordFilter[];
  readonly sort?: readonly RecordSort[];
  readonly limit: number;
}
export interface AtlasRecordResult {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly sources: readonly AtlasRecordSourceCoordinate[];
  readonly responseBytes: number;
  readonly authorizationProfileHash: string;
}
export interface AtlasRecordDataGateway {
  query(input: { readonly context: VerifiedRequestContext; readonly request: AtlasRecordQuery }): Promise<AtlasRecordResult>;
}
export interface AtlasFieldSecurityProjector {
  project(input: { readonly context: VerifiedRequestContext; readonly entityCode: string; readonly descriptorHash: string; readonly requestedFields: readonly string[]; readonly rows: readonly Readonly<Record<string, unknown>>[] }): Promise<readonly Readonly<Record<string, unknown>>[]>;
}
