import React from "react";
import { createRoot } from "react-dom/client";
import { entityRuntimeClient } from "@athyper/platform-entity-descriptor-client";
import { EntityRecordPage } from "../../../packages/platform/entity/runtime/form-detail/src/record/entity-record-page";
import { writeRecordLocation } from "../../../packages/platform/entity/runtime/form-detail/src/record/write-record-location";
import { AuthorizedAttachment } from "../../../packages/planes/neon/business-partner/src/360/components/commercial-controls";

const sections = ["overview", "identity", "banking", "certificates", "qualifications", "restrictions", "roles-scope"];
const labels = ["Overview", "Identity", "Banking", "Certificates", "Qualifications", "Restrictions", "Roles Scope"];
const requests: unknown[] = [];
(window as any).__requests = requests;
const release = { releaseId: "fixture", releaseHash: "fixture-hash" };
const bootstrap: typeof entityRuntimeClient.bootstrap = async (_, input) => {
  requests.push({ kind: "bootstrap", context: input.resourceContext });
  return { ...release, header: { revision: "1", values: { name: "Cendana Office", code: "ATH-APAC-003" } }, plan: {
    ...release, entityCode: "business_partner", surfaceKey: "detail", headerFieldKeys: ["name"], actions: [],
    sections: sections.map((key, index) => ({ key, presentationRef: key, label: { labelKey: key, defaultText: labels[index]! }, loadPolicy: index === 0 ? "initial" : "visible" })),
    initialSectionKeys: ["overview"], navigation: { tabs: [
      { key: "360", label: { labelKey: "record", defaultText: "360 View" }, provider: "overview", sectionDisplay: "continuous", sectionKeys: sections.slice(0, 4) },
      { key: "qualifications", label: { labelKey: "qualifications", defaultText: "Qualifications" }, provider: "section", sectionDisplay: "continuous", sectionKeys: sections.slice(4, 6) },
      { key: "roles", label: { labelKey: "roles", defaultText: "Roles & scope" }, provider: "section", sectionDisplay: "selected", sectionKeys: ["roles-scope"] },
    ] },
  } };
};
const section: typeof entityRuntimeClient.section = async (_, input) => {
  requests.push({ kind: "section", key: input.sectionKey, context: input.resourceContext });
  return { ...release, sectionKey: input.sectionKey, revision: "1", presentation: {
    rendererKey: "platform.fields.v1", childCollections: [], fields: [{ key: "description", label: { labelKey: "description", defaultText: "Description" } }],
  }, data: { state: "ready", values: { description: input.sectionKey === "banking" ? "Maybank · MYR · •••• 4821" : input.sectionKey === "certificates" ? "ISO 9001:2015" : input.sectionKey + " details" } } };
};

// The test bundler supplies a mutable copy; production's client remains frozen.
Object.assign(entityRuntimeClient, { bootstrap, section });

// Simulates an external working-context URL update, not a BP-specific context picker.
(window as any).selectCompany = (id: string) => {
  writeRecordLocation(url => url.searchParams.set("companyCodeId", id));
  window.dispatchEvent(new PopStateEvent("popstate"));
};
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("document")
    ? <AuthorizedAttachment label="View certificate" attachment={{ attachmentId: "certificate" }} />
    : <EntityRecordPage recordId="33333333-3333-4333-8333-333333333333" adapter={{ entityCode: "business_partner", label: "Business Partner", recordHref: id => "/app/entity/business_partner/" + id }} />,
);
