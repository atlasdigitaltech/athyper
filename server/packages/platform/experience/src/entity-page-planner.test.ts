import { describe, expect, it } from "vitest";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { planEntityPage } from "./entity-page-planner.js";

const core = artifact("core", {
  fields: [{ key: "name" }, { key: "code" }, { key: "status" }, { key: "secret" }],
});
const surface = artifact("presentation_surface", {
  surfaceKey: "detail_360",
  header: { titleField: "name", codeField: "code", statusField: "status" },
  sections: [
    { sectionKey: "overview", presentationRef: "business_partner/presentation.section.overview.json", viewPermission: "bp.read" },
    { sectionKey: "contacts", presentationRef: "business_partner/presentation.section.contacts.json", viewPermission: "bp.contacts.read" },
    { sectionKey: "banking", presentationRef: "business_partner/presentation.section.banking.json", viewPermission: "bp.bank.read" },
  ],
  actions: [{ operationKey: "request_change", placement: "toolbar", interaction: "start_flow", label: { labelKey: "entity.business_partner.action.request_change", defaultText: "Request change" } }],
});
const operation = artifact("operation", { operations: [{ key: "request_change", permissionCode: "bp.amend" }] });

describe("entity page planner", () => {
  it("uses explicit display modes independently of tab names and providers", () => {
    const tabs = [
      {key: "alpha", provider: "section", sectionDisplay: "continuous", sectionKeys: ["overview", "contacts"]},
      {key: "beta", provider: "overview", sectionDisplay: "selected", sectionKeys: ["banking"]},
    ].map(t => ({...t, label: {labelKey: "tab." + t.key, defaultText: t.key}}));
    const plan = planEntityPage({release: {releaseId: "r", releaseHash: "sha256:a"}, core,
      surface: artifact("presentation_surface", {...surface.content, navigation: {tabs}}),
      grantedPermissions: new Set(["bp.read", "bp.contacts.read", "bp.bank.read"])});
    expect(plan.navigation?.tabs.map(t => t.sectionDisplay)).toEqual(["continuous", "selected"]);
    expect(() => planEntityPage({release: {releaseId: "r", releaseHash: "sha256:a"}, core,
      surface: artifact("presentation_surface", {...surface.content, navigation: {tabs: [{...tabs[0], sectionDisplay: "invalid"}]}}),
      grantedPermissions: new Set(["bp.read"])})).toThrow("ENTITY_SECTION_DISPLAY_INVALID");
  });
  it("hides Restrictions independently without orphaning Qualifications", () => {
    const configured = artifact("presentation_surface", { ...surface.content,
      sections: [
        {sectionKey: "qualifications-certificates", presentationRef: "business_partner/presentation.section.qualifications-certificates.json", viewPermission: "qualification.read"},
        {sectionKey: "restrictions", presentationRef: "business_partner/presentation.section.restrictions.json", viewPermission: "restriction.read"},
      ], navigation: {tabs: [{key: "qualifications", provider: "section", label: {labelKey: "tabs.qualifications", defaultText: "Qualifications"}, sectionKeys: ["qualifications-certificates", "restrictions"]}]} });
    for (const allowed of [false, true]) {
      const plan = planEntityPage({release: {releaseId: "r", releaseHash: "sha256:a"}, core, surface: configured,
        grantedPermissions: new Set(["qualification.read", ...(allowed ? ["restriction.read"] : [])])});
      expect(plan.navigation?.tabs[0]?.sectionKeys).toEqual(allowed ? ["qualifications-certificates", "restrictions"] : ["qualifications-certificates"]);
      expect(plan.sections.map(s => s.key)).toEqual(plan.navigation?.tabs[0]?.sectionKeys);
    }
  });
  it.each(["360", "overview"])("normalizes %s providers without changing published keys or labels", (provider) => {
    const plan = planEntityPage({ release: {releaseId: "r", releaseHash: "sha256:a"}, core,
      surface: artifact("presentation_surface", {...surface.content, navigation: {tabs: [
        {key: "360", provider, label: {labelKey: "tabs.record", defaultText: "360 View"}, sectionKeys: ["overview"]}
      ]}}), grantedPermissions: new Set(["bp.read"]) });
    expect(plan.navigation?.tabs[0]).toMatchObject({key: "360", provider: "overview", label: {defaultText: "360 View"}, sectionKeys: ["overview"]});
  });
  it("rejects duplicate overview providers including mixed legacy metadata", () => {
    expect(() => planEntityPage({release: {releaseId: "r", releaseHash: "sha256:a"}, core,
      surface: artifact("presentation_surface", {...surface.content, navigation: {tabs: ["360", "overview"].map(provider => ({
        key: provider, provider, label: {labelKey: "tabs.record", defaultText: "Record"}, sectionKeys: ["overview"]
      }))}}), grantedPermissions: new Set(["bp.read"])})).toThrow("NAVIGATION_INVALID");
  });
  it("filters each destination independently in a multi-section tab", () => {
    const plan = planEntityPage({release:{releaseId:"release-1",releaseHash:`sha256:${"a".repeat(64)}`},core,
      surface:artifact("presentation_surface",{...surface.content,navigation:{tabs:[{key:"decisions",provider:"section",label:{labelKey:"tabs.decisions",defaultText:"Decisions"},sectionKeys:["contacts","banking"]}]}}),
      grantedPermissions:new Set(["bp.contacts.read"])});
    expect(plan.navigation?.tabs).toEqual([expect.objectContaining({key:"decisions",sectionKeys:["contacts"]})]);
    expect(plan.sections.map(section=>section.key)).toEqual(["contacts"]);
  });
  it("omits navigation when every published destination is denied", () => {
    const plan = planEntityPage({release:{releaseId:"release-1",releaseHash:`sha256:${"a".repeat(64)}`},core,
      surface:artifact("presentation_surface",{...surface.content,navigation:{tabs:[{key:"overview",provider:"section",label:{labelKey:"tabs.overview",defaultText:"Overview"},sectionKey:"overview"}]}}),grantedPermissions:new Set()});
    expect(plan.sections).toEqual([]);
    expect(plan.navigation).toBeUndefined();
  });
  it("still rejects an empty published navigation definition", () => {
    expect(()=>planEntityPage({release:{releaseId:"release-1",releaseHash:`sha256:${"a".repeat(64)}`},core,surface:artifact("presentation_surface",{...surface.content,navigation:{tabs:[]}}),grantedPermissions:new Set()})).toThrow("ENTITY_PAGE_PLAN_NAVIGATION_INVALID");
  });
  it("returns one shared header projection and only authorized sections", () => {
    const plan = planEntityPage({
      release: { releaseId: "release-1", releaseHash: "sha256:a".padEnd(71, "a") },
      core,
      surface,
      operation,
      grantedPermissions: new Set(["bp.read", "bp.contacts.read", "bp.amend"]),
      activeSectionKey: "contacts",
    });
    expect(plan.headerFieldKeys).toEqual(["name", "code", "status"]);
    expect(plan.sections).toEqual([
      expect.objectContaining({ key: "overview", loadPolicy: "initial" }),
      expect.objectContaining({ key: "contacts", loadPolicy: "active" }),
    ]);
    expect(plan.initialSectionKeys).toEqual(["overview", "contacts"]);
    expect(plan.actions).toEqual([expect.objectContaining({ operationKey: "request_change", interaction: "start_flow" })]);
  });

  it("keeps direct navigation usable when every 360 child is denied", () => {
    const plan = planEntityPage({
      release: { releaseId: "release-1", releaseHash: "sha256:a".padEnd(71, "a") },
      core,
      surface: artifact("presentation_surface", {
        ...surface.content,
        navigation: { tabs: [
          { key: "360", provider: "360", label: { labelKey: "tabs.360", defaultText: "360 View" }, sectionKeys: ["banking"] },
          { key: "contacts", provider: "section", label: { labelKey: "tabs.contacts", defaultText: "Contacts" }, sectionKey: "contacts" },
        ] },
      }),
      grantedPermissions: new Set(["bp.contacts.read"]),
    });
    expect(plan.navigation?.tabs).toEqual([
      expect.objectContaining({ key: "contacts", sectionKeys: ["contacts"] }),
    ]);
  });

  it("projects only authorized navigation children and declarative summary cards", () => {
    const plan = planEntityPage({
      release: { releaseId: "release-1", releaseHash: "sha256:a".padEnd(71, "a") },
      core,
      surface: artifact("presentation_surface", {
        ...surface.content,
        navigation: { tabs: [
          { key: "360", provider: "360", label: { labelKey: "tabs.360", defaultText: "360 View" }, sectionKeys: ["overview", "contacts", "banking"] },
          { key: "contacts", provider: "section", label: { labelKey: "tabs.contacts", defaultText: "Contacts" }, sectionKey: "contacts" },
        ] },
        summaryView: { cards: [{ key: "primary-contact", provider: "primary-contact", rendererKey: "platform.contact.summary.v1", label: { labelKey: "summary.contact", defaultText: "Primary Contact" } }] },
      }),
      grantedPermissions: new Set(["bp.read", "bp.contacts.read"]),
    });
    expect(plan.navigation?.tabs).toEqual([
      expect.objectContaining({ key: "360", sectionKeys: ["overview", "contacts"] }),
      expect.objectContaining({ key: "contacts", sectionKeys: ["contacts"] }),
    ]);
    expect(plan.summaryView?.cards).toEqual([
      expect.objectContaining({ key: "primary-contact", provider: "primary-contact" }),
    ]);
  });
});

function artifact(type: "core" | "presentation_surface" | "operation", content: Record<string, unknown>): CompiledEntityArtifactV2 {
  return {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "draft_for_review",
    artifactType: type,
    artifactKey: type === "core" ? "business_partner/core" : type === "operation" ? "business_partner/operation" : "business_partner/presentation.detail",
    entityCode: "business_partner",
    plane: "neon",
    dependencies: [],
    artifactHash: `sha256:${"a".repeat(64)}`,
    content: { ...content },
  };
}
