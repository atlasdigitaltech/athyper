import { partnerSectionContract } from "../partner-section-contract.js";
import {
  certificateCollection,
  qualificationCollection,
} from "@athyper/server-service-master-data";
import {
  businessPartnerReadScope,
  collectionResource,
} from "../business-partner-read-contract.js";
import { EntityRuntimeResourceError } from "@athyper/server-platform-experience";
import { MasterDataError } from "@athyper/server-service-master-data";
import {
  createPartnerSectionReader,
  type PartnerService,
  type DecisionViews,
  type SectionProviders,
} from "./contracts.js";

export function createPartnerDecisionProviders(
  businessPartner360: PartnerService,
  decisionViews?: DecisionViews,
): SectionProviders {
  const readSection = createPartnerSectionReader(businessPartner360);
  // Isolate the legacy service coordinate; its existing scope and field authorization remain authoritative.
  const readLegacyQualificationEvidence = <T = unknown>(
    input: Omit<Parameters<PartnerService["section"]>[0], "sectionCode">,
  ) => readSection<T>({ ...input, sectionCode: "qualifications-certificates" });
  function checkedContract(
    content: Record<string, unknown>,
    expectedHandler: string,
  ) {
    try {
      const result = partnerSectionContract(content);
      if (
        !result ||
        (content.dataBinding as { handlerKey?: string })?.handlerKey !==
          expectedHandler
      )
        throw Error("MISMATCH");
      return result;
    } catch {
      throw new EntityRuntimeResourceError(
        503,
        "PARTNER_SECTION_CONTRACT_MISMATCH",
      );
    }
  }
  async function readDecision(
    input: Omit<
      Parameters<NonNullable<typeof decisionViews>["read"]>[0],
      "kind"
    >,
    kind: "qualifications" | "restrictions",
  ) {
    if (!decisionViews)
      throw new EntityRuntimeResourceError(
        503,
        "PARTNER_DECISION_VIEWS_UNAVAILABLE",
      );
    try {
      return await decisionViews.read({ ...input, kind });
    } catch (error) {
      if (
        error instanceof MasterDataError &&
        (error.status === 403 || error.status === 404)
      )
        throw new EntityRuntimeResourceError(
          error.status,
          "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
        );
      throw error;
    }
  }

  return {
    get(handlerKey) {
      if (
        handlerKey === "neon.bp.section.certificates.v1" ||
        handlerKey === "neon.bp.section.qualifications-certificates.v1"
      )
        return {
          async read({
            context,
            recordId,
            limit,
            cursor,
            resourceContext,
            section,
          }) {
            const contract = checkedContract(section.content, handlerKey);
            if (contract === "qualifications")
              return readDecision(
                { context, recordId, limit, cursor },
                "qualifications",
              );
            const result = await readLegacyQualificationEvidence<
              Record<string, unknown>
            >({
              context,
              businessPartnerId: recordId,
              limit,
              cursor,
              ...businessPartnerReadScope(resourceContext),
            });
            return collectionResource(
              String(result.businessPartnerVersion),
              {
                state: result.state,
                collections: {
                  ...(contract === "legacy-combined"
                    ? {
                        qualifications: qualificationCollection(
                          result.data.qualifications,
                        ),
                      }
                    : {}),
                  certifications: certificateCollection(
                    result.data.certifications,
                  ),
                },
              },
              result.page?.nextCursor,
            );
          },
        };
      if (
        handlerKey === "neon.bp.section.qualifications.v2" ||
        handlerKey === "neon.bp.section.restrictions.v1"
      ) {
        return {
          async read({ context, recordId, limit, cursor, section }) {
            const contract = checkedContract(section.content, handlerKey);
            return readDecision(
              { context, recordId, limit, cursor },
              contract === "restrictions" ? "restrictions" : "qualifications",
            );
          },
        };
      }

      return undefined;
    },
  };
}
