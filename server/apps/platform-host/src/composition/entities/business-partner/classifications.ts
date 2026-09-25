import {
  businessPartnerReadScope,
  collectionResource,
} from "../business-partner-read-contract.js";
import { EntityRuntimeResourceError } from "@athyper/server-platform-experience";
import { MasterDataError } from "@athyper/server-service-master-data";
import {
  createPartnerSectionReader,
  type PartnerService,
  type ClassificationService,
  type SectionProviders,
} from "./contracts.js";

export function createPartnerClassificationProviders(
  businessPartner360: PartnerService,
  partnerClassifications: ClassificationService,
): SectionProviders {
  const readSection = createPartnerSectionReader(businessPartner360);
  return {
    get(handlerKey) {
      if (handlerKey === "neon.bp.section.industries.v1")
        return {
          async read({ context, recordId, limit, cursor, resourceContext }) {
            const result = await readSection({
              context,
              businessPartnerId: recordId,
              sectionCode: "identity",
              limit,
              cursor,
              ...businessPartnerReadScope(resourceContext),
            }).catch((error) => {
              if (
                error instanceof MasterDataError &&
                (error.status === 403 || error.status === 404)
              )
                throw new EntityRuntimeResourceError(
                  error.status,
                  "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
                  "Record unavailable",
                );
              throw error;
            });
            const data = result.data as {
              items?: readonly Record<string, unknown>[];
              collections?: Record<string, unknown>;
            };
            const facts = (data.items ?? [])
              .filter((row) => row.kind === "classification")
              .map((row) => ({
                id: row.id,
                industry_domain_code: row.industryDomainCode,
                industry_code: row.industryCode,
                industry_name: row.industryName,
                assignment_kind: row.assignmentKind,
                is_primary: row.primary,
                effective_from: row.effectiveFrom,
                effective_until: row.effectiveUntil,
                source_system: row.sourceSystem,
                source_reference: row.sourceReference,
                status: row.status,
                verification_status: row.verified ? "verified" : "unverified",
              }));
            return collectionResource(
              String(result.businessPartnerVersion),
              {
                state: result.state,
                collections: {
                  industries: facts,
                  industry_crosswalk_reference_evidence:
                    data.collections?.industry_crosswalk_reference_evidence ??
                    [],
                },
              },
              result.page?.nextCursor,
            );
          },
        };
      if (handlerKey === "neon.bp.section.commodities.v1")
        return {
          async read({ context, recordId, limit, cursor, resourceContext }) {
            const result = await partnerClassifications
              .read({
                context,
                businessPartnerId: recordId,
                limit,
                cursor,
                ...businessPartnerReadScope(resourceContext),
              })
              .catch((error) => {
                if (
                  error instanceof MasterDataError &&
                  (error.status === 403 || error.status === 404)
                )
                  throw new EntityRuntimeResourceError(
                    error.status,
                    "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
                    "Record unavailable",
                  );
                throw error;
              });
            const classifications = result.items.map((row) => ({
              id: row.id,
              business_partner_id: recordId,
              commodity_category_id: row.categoryId,
              category_code: row.categoryCode,
              category_name: row.categoryName,
              commodity_code: row.commodityCode,
              commodity_name: row.commodityName,
              commodity_level: row.levelNo,
              classification_basis: row.classificationBasis,
              verification_status: row.verifiedAt ? "verified" : "unverified",
              category_matches:
                row.categoryMappings
                  .map(
                    (mapping) =>
                      `${mapping.categoryCode} — ${mapping.categoryName}`,
                  )
                  .join("; ") ||
                (row.classificationBasis === "direct_unspsc"
                  ? "Not mapped (optional)"
                  : "Legacy category assignment"),
              assignment_kind: row.assignmentKind,
              effective_from: row.effectiveFrom,
              effective_until: row.effectiveUntil,
              source_system: row.sourceSystem,
              source_reference: row.sourceReference,
              status: row.status,
              record_version: row.recordVersion,
            }));
            const crosswalks = [
              ...new Map(
                result.items
                  .flatMap((row) =>
                    row.commodityCodes.flatMap((code) => code.crosswalks),
                  )
                  .map((row) => [JSON.stringify(row), row]),
              ).values(),
            ];
            return {
              revision:
                classifications
                  .map((row) => `${row.id}:${row.record_version}`)
                  .join("|") || "empty",
              data: {
                state: "ready",
                collections: {
                  commodity_classifications: classifications,
                  commodity_crosswalk_reference_evidence: crosswalks,
                },
                ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
              },
            };
          },
        };

      return undefined;
    },
  };
}
