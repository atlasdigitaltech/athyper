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
