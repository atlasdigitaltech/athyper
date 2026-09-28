/** Neutral publication coordinates and schema payloads, not workflow evidence. */
export interface ActiveCaseContract {
  id: string;
  tenantId: string;
  entityId: string;
  publicationKey: string;
  contractHash: string;
  releaseNo: number;
  contract: Record<string, unknown>;
}

export interface InitialCaseContract {
  tenantId: string;
  entityId: string;
  publicationKey: string;
  contract: Record<string, unknown>;
}
