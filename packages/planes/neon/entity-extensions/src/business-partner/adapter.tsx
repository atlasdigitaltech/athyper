import { ContactRoundIcon } from "@athyper/platform-icons";
import { entityRecordHref } from "@athyper/contract-platform-entity-runtime";
import { entityRuntimeClient } from "@athyper/platform-entity-descriptor-client";
import {
  invalidateEntityRuntimeSectionCache,
  type EntityRecordAdapter,
  type RecordRevealHandler,
  type RecordActionHandler,
} from "@athyper/platform-entity-form-detail/record";
import { createBusinessPartner360SectionClient } from "./clients/business-partner-360-section-client";
import { createBusinessPartner360CommercialClient } from "./clients/business-partner-360-commercial-client";
import { BUSINESS_PARTNER_360_PANEL } from "./clients/panel-definition";

const partnerWorkflowHref = (id: string) =>
  `/mdg/business-partner/${encodeURIComponent(id)}`;
/** Domain operations only. Presentation and authorization come from the admitted metadata/server. */
export const businessPartnerRecordAdapter: EntityRecordAdapter =
  Object.freeze<EntityRecordAdapter>({
    entityCode: "business_partner",
    label: "Business Partner",
    icon: <ContactRoundIcon />,
    recordHref: (id: string) => entityRecordHref("business_partner", id),
    preferenceKey: "athyper.record-view.business-partner.v1",
    sectionForTab(tab) {
      const configured = BUSINESS_PARTNER_360_PANEL.tabs.find(
        (item) => item.key === tab,
      );
      return configured?.provider === "section"
        ? configured.sectionKey
        : tab === "360"
          ? BUSINESS_PARTNER_360_PANEL.sections[0]
          : undefined;
    },
    reveals: Object.freeze<Record<string, RecordRevealHandler>>({
      "business_partner_identifier.reveal": (
        { http, recordId, resourceContext },
        id,
        purpose,
        signal,
      ) =>
        createBusinessPartner360SectionClient(http).revealIdentifier(
          recordId,
          id,
          purpose,
          signal,
          resourceContext,
        ),
      "business_partner_tax_registration.reveal": (
        { http, recordId, resourceContext },
        id,
        purpose,
        signal,
      ) =>
        createBusinessPartner360SectionClient(http).revealTax(
          recordId,
          id,
          purpose,
          signal,
          resourceContext,
        ),
      "business_partner_banking.reveal": (
        { http, recordId, resourceContext },
        id,
        purpose,
        signal,
      ) =>
        createBusinessPartner360CommercialClient(http).revealBank(
          recordId,
          id,
          purpose,
          signal,
          resourceContext,
        ),
    }),
    actions: Object.freeze<Record<string, RecordActionHandler>>({
      request_role_extension: ({ recordId }) =>
        window.location.assign(`${partnerWorkflowHref(recordId)}/roles/new`),
      assign_organization_scope: ({ recordId }) =>
        window.location.assign(
          `${partnerWorkflowHref(recordId)}/scope/new?kind=assign_organization`,
        ),
      configure_company_scope: ({ recordId }) =>
        window.location.assign(
          `${partnerWorkflowHref(recordId)}/scope/new?kind=configure_company`,
        ),
      async request_change({ http, entityCode, recordId, revision }) {
        const receipt = await entityRuntimeClient.operation(http, {
          entityCode,
          recordId,
          operationKey: "request_change",
          expectedVersion: Number(revision),
          idempotencyKey: crypto.randomUUID(),
          input: {},
        });
        if (typeof receipt.requestId !== "string")
          throw new Error(
            "The governed request did not return a draft identity.",
          );
        invalidateEntityRuntimeSectionCache({
          cacheScope: "default",
          entityCode,
          recordId,
          surfaceKey: "detail",
        });
        window.location.assign(
          `/mdg/business-partner/requests/${encodeURIComponent(receipt.requestId)}/edit`,
        );
      },
    }),
  });
