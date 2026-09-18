import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";
import type { SummaryQuery } from "./business-partner-360-client";
export type ExplainabilitySectionCode =
  | "requests"
  | "activity"
  | "business-activity";
export interface ExplainabilitySection {
  readonly schemaVersion: 1;
  readonly sectionCode: ExplainabilitySectionCode;
  readonly state: "ready" | "empty" | "partial" | "unavailable";
  readonly data: Readonly<Record<string, unknown>>;
  readonly page?: Readonly<{ nextCursor?: string; limit: number }>;
  readonly provenance: readonly Readonly<{
    plane: string;
    service: string;
    sourceObject: string;
    observedAt: string;
  }>[];
}
export interface ExplainabilityQuery extends SummaryQuery {
  readonly sectionCode: ExplainabilitySectionCode;
  readonly cursor?: string;
  readonly limit?: number;
}
const operation = createOperation<ExplainabilitySection>({
  method: "GET",
  path: ({ businessPartnerId, section }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/360/${encodePathSegment(section)}`,
  parse,
});
export function createBusinessPartner360ExplainabilityClient(http: HttpClient) {
  return {
    read: (query: ExplainabilityQuery, signal?: AbortSignal) =>
      http.request(operation, {
        params: {
          businessPartnerId: query.businessPartnerId,
          section: query.sectionCode,
        },
        query: {
          roleLens: query.roleLens,
          ...(query.operatingOrganizationId
            ? { operatingOrganizationId: query.operatingOrganizationId }
            : {}),
          ...(query.companyCodeId
            ? { companyCodeId: query.companyCodeId }
            : {}),
          ...(query.legalEntityId
            ? { legalEntityId: query.legalEntityId }
            : {}),
          ...(query.asOf ? { asOf: query.asOf } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          limit: query.limit ?? 25,
          permissionEpoch: query.authEpoch,
        },
        signal,
      }),
  };
}
export function explainabilityQueryKey(query: ExplainabilityQuery) {
  return [
    "business-partner-360",
    query.tenantId,
    query.principalId,
    query.businessPartnerId,
    query.sectionCode,
    query.roleLens,
    query.operatingOrganizationId ?? "global",
    query.companyCodeId ?? "no-company",
    query.legalEntityId ?? "no-legal-entity",
    query.asOf ?? "current",
    query.authEpoch,
    query.cursor ?? "first",
  ] as const;
}
function parse(value: unknown) {
  const body = record(value),
    serialized = JSON.stringify(body);
  if (
    /"(?:old_values|oldValues|new_values|newValues|proposed_payload|proposedPayload|contentHash|payload|evidenceContent)"\s*:/i.test(
      serialized,
    )
  )
    throw new TypeError(
      "Explainability response contains a raw evidence field",
    );
  if (body["schemaVersion"] !== 1 || !record(body["data"]))
    throw new TypeError("Explainability section contract is invalid");
  return body as unknown as ExplainabilitySection;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Explainability response must be an object");
  return value as Record<string, unknown>;
}
