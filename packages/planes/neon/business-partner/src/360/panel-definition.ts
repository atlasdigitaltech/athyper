import { parseRecord360Panel } from "@athyper/contract-platform-entity-runtime";

/** Used by the BP adapter until an older presentation is republished. */
export const BUSINESS_PARTNER_360_PANEL = parseRecord360Panel({
  schemaVersion: 1,
  kind: "360",
  sections: [
    "overview",
    "identity",
    "contacts",
    "addresses",
    "identifiers-tax",
    "governance",
    "banking",
    "qualifications-certificates",
    "roles-scope",
    "supplier-company",
    "customer-company",
    "credit",
    "network",
  ],
  tabs: [
    { key: "360", label: "360 View", provider: "360" },
    {
      key: "requests",
      label: "Requests",
      provider: "section",
      sectionKey: "requests",
    },
    {
      key: "transactions",
      label: "Business Transactions",
      provider: "section",
      sectionKey: "business-activity",
    },
    {
      key: "activity",
      label: "Activity",
      provider: "section",
      sectionKey: "activity",
    },
    {
      key: "comments",
      label: "Comments",
      provider: "section",
      sectionKey: "comments",
    },
    {
      key: "attachments",
      label: "Attachments",
      provider: "section",
      sectionKey: "attachments",
    },
  ],
  sidebar: [
    { key: "contact", label: "Primary Contact", provider: "primary-contact" },
    { key: "address", label: "Primary Address", provider: "primary-address" },
  ],
});
