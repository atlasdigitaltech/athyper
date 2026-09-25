import { parseRecord360Panel } from "@athyper/contract-platform-entity-runtime";
import { assertSectionProvidersRegistered } from "./section-providers";

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
    "credit",
    "network",
  ],
  tabs: [
    { key: "360", label: "360 View", provider: "360" },
    { key: "qualifications", label: "Qualifications", provider: "section", sectionKey: "qualifications-certificates" },
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
assertSectionProvidersRegistered(BUSINESS_PARTNER_360_PANEL);

/** Upgrade older published layouts while preserving other published tabs and sidebar bindings. */
export function realignPartnerPanel(panel: typeof BUSINESS_PARTNER_360_PANEL) {
 // A section-only published panel is valid; preserve it without manufacturing
 // a new tab or passing undefined to the panel parser.
 const overviewTab = panel.tabs.find(tab => tab.provider === "360");
 if (!overviewTab) {
   assertSectionProvidersRegistered(panel);
   return panel;
 }
 const realigned = parseRecord360Panel({...panel,sections:panel.sections.filter(code=>!["roles-scope","supplier-company","customer-company","qualifications-certificates"].includes(code)),tabs:[overviewTab,{key:"qualifications",label:"Qualifications",provider:"section",sectionKey:"qualifications-certificates"},{key:"roles",label:"Roles & scope",provider:"section",sectionKey:"roles-scope"},...panel.tabs.filter(t=>t.provider!=="360"&&t.key!=="roles"&&t.key!=="qualifications"&&!["roles-scope","supplier-company","customer-company","qualifications-certificates"].includes(t.sectionKey??""))]});
 assertSectionProvidersRegistered(realigned);
 return realigned;
}
