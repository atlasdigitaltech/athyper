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
    "credit",
    "network",
  ],
  tabs: [
    { key: "360", label: "360 View", provider: "360" },
    { key: "roles", label: "Roles & scope", provider: "section", sectionKey: "roles-scope" },
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

/** Upgrade older published layouts while preserving other published tabs and sidebar bindings. */
export function realignPartnerPanel(panel: typeof BUSINESS_PARTNER_360_PANEL) {
 return parseRecord360Panel({...panel,sections:panel.sections.filter(code=>!["roles-scope","supplier-company","customer-company"].includes(code)),tabs:[panel.tabs.find(t=>t.provider==="360")!,{key:"roles",label:"Roles & scope",provider:"section",sectionKey:"roles-scope"},...panel.tabs.filter(t=>t.provider!=="360"&&t.key!=="roles"&&!["roles-scope","supplier-company","customer-company"].includes(t.sectionKey??""))]});
}
