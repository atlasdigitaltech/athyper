import {
  businessPartnerReadScope,
  collectionResource,
  rethrowBusinessPartnerReadError,
} from "../business-partner-read-contract.js";
import { EntityRuntimeResourceError } from "@athyper/server-platform-experience";
import { MasterDataError } from "@athyper/server-service-master-data";
import {
  createPartnerSectionReader,
  type PartnerService,
  type RecordProviders,
} from "./contracts.js";

export function createPartnerRecordProviders(
  businessPartner360: PartnerService,
): RecordProviders {
  const readSection = createPartnerSectionReader(businessPartner360);
  return {
    summaries: {
      get(provider) {
        if (
          !new Set([
            "primary-contact",
            "primary-address",
            "relationship-summary",
            "governance-state",
          ]).has(provider)
        )
          return undefined;
        return {
          async read({
            context,
            core,
            recordId,
            resourceContext,
            requestCache,
          }) {
            if (core.entityCode !== "business_partner")
              throw new EntityRuntimeResourceError(
                503,
                "ENTITY_RUNTIME_SUMMARY_HANDLER_UNAVAILABLE",
              );
            const cacheKey = "business_partner:summary";
            const source =
              requestCache.get(cacheKey) ??
              Promise.resolve(
                businessPartner360
                  .summary({
                    context,
                    businessPartnerId: recordId,
                    ...businessPartnerReadScope(resourceContext),
                  })
                  .catch(rethrowBusinessPartnerReadError),
              );
            requestCache.set(cacheKey, source);
            const summary = (await source) as Awaited<
              ReturnType<typeof businessPartner360.summary>
            >;
            if (provider === "primary-contact")
              return Object.freeze({
                state: summary.primaryContact ? "ready" : "empty",
                value: summary.primaryContact ?? null,
              });
            if (provider === "primary-address")
              return Object.freeze({
                state: summary.primaryAddress ? "ready" : "empty",
                value: summary.primaryAddress ?? null,
              });
            if (provider === "relationship-summary")
              return Object.freeze({
                state: "ready",
                value: Object.freeze({
                  roles: summary.roles.map((role) => role.code),
                  openWork: summary.openWork,
                  sectionCounts: Object.fromEntries(
                    summary.sections.flatMap((section) =>
                      section.count === undefined
                        ? []
                        : [[section.code, section.count]],
                    ),
                  ),
                }),
              });
            return Object.freeze({
              state: "ready",
              value: Object.freeze({
                completeness: summary.completeness.status,
                percent: summary.completeness.percent,
                openWork: summary.openWork,
              }),
            });
          },
        };
      },
    },
    headers: {
      async readHeader({ context, core, recordId, fieldKeys }) {
        if (core.entityCode !== "business_partner") return null;
        const header = await businessPartner360
          .header({
            context,
            businessPartnerId: recordId,
          })
          .catch(rethrowBusinessPartnerReadError);
        const source: Record<string, unknown> = {
          id: header.identity.id,
          code: header.identity.code,
          name: header.identity.name,
          status: header.identity.lifecycleStatus,
          partner_category: header.identity.category,
        };
        return Object.freeze({
          revision: String(header.businessPartnerVersion),
          values: Object.freeze(
            Object.fromEntries(
              fieldKeys.flatMap((key) =>
                key in source ? [[key, source[key]]] : [],
              ),
            ),
          ),
        });
      },
    },
    sections: {
      get(handlerKey) {
        // This is a domain registration map, not a BP-specific runtime reader. The
        // generic service admits the section artifact and owns caching/transport.
        // Each registered handler remains an independently authorized BP read.
        const sectionCodes = {
          "neon.bp.section.overview.v1": "overview",
          "neon.bp.section.identity.v1": "identity",
          "neon.bp.section.contacts.v1": "contacts",
          "neon.bp.section.addresses.v1": "addresses",
          "neon.bp.section.identifiers-tax.v1": "identifiers-tax",
          "neon.bp.section.roles-scope.v1": "roles-scope",
          "neon.bp.section.banking.v1": "banking",
          "neon.bp.section.credit.v1": "credit",
          "neon.bp.section.requests.v1": "requests",
          "neon.bp.section.activity.v1": "activity",
          "neon.bp.section.business-activity.v1": "business-activity",
          "neon.bp.section.network.v1": "network",
        } as const;
        if (!Object.hasOwn(sectionCodes, handlerKey)) return undefined;
        const sectionCode =
          sectionCodes[handlerKey as keyof typeof sectionCodes];
        if (!sectionCode) return undefined;
        return {
          async read({ context, recordId, limit, cursor, resourceContext }) {
            const scope = businessPartnerReadScope(resourceContext);
            if (sectionCode === "overview" || sectionCode === "identity") {
              const result = await businessPartner360
                .overview(
                  {
                    context,
                    businessPartnerId: recordId,
                    ...scope,
                  },
                  { requireIdentity: sectionCode === "identity" },
                )
                .catch(rethrowBusinessPartnerReadError);
              return Object.freeze({
                revision: String(result.businessPartnerVersion),
                data: Object.freeze({ state: "ready", values: result.values }),
              });
            }
            const result = await readSection({
              context,
              businessPartnerId: recordId,
              sectionCode,
              limit,
              cursor,
              ...scope,
            }).catch((error) => {
              if (
                error instanceof MasterDataError &&
                (error.status === 403 || error.status === 404)
              )
                throw new EntityRuntimeResourceError(
                  error.status,
                  "ENTITY_RUNTIME_RECORD_UNAVAILABLE",
                  "Record or section unavailable",
                );
              throw error;
            });
            if (sectionCode === "identifiers-tax") {
              const data = result.data as { items?: Record<string, unknown>[] };
              return {
                revision: String(result.businessPartnerVersion),
                data: {
                  ...result,
                  ...(result.page?.nextCursor
                    ? { nextCursor: result.page.nextCursor }
                    : {}),
                  data: {
                    ...data,
                    items: [],
                    collections: {
                      identifiers: (data.items ?? []).filter(
                        (item) => item.kind === "identifier",
                      ),
                      tax_registrations: (data.items ?? []).filter(
                        (item) => item.kind === "tax",
                      ),
                    },
                  },
                },
              };
            }
            return Object.freeze(
              collectionResource(
                String(result.businessPartnerVersion),
                { ...result },
                result.page?.nextCursor ??
                  (result.data &&
                  typeof result.data === "object" &&
                  "nextCursor" in result.data &&
                  typeof result.data.nextCursor === "string"
                    ? result.data.nextCursor
                    : undefined),
              ),
            );
          },
        };
      },
    },
  };
}
