import { describe, expect, it, vi } from "vitest";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import { createEntityRuntimeResourceService } from "./entity-section-service.js";

const core = artifact("core", "business_partner/core", { fields: [{ key: "name" }, { key: "code" }, { key: "status" }] });
const surface = artifact("presentation_surface", "business_partner/presentation.detail", { surfaceKey: "detail", header: { titleField: "name", codeField: "code", statusField: "status" }, sections: [{ sectionKey: "overview", presentationRef: "business_partner/presentation.section.overview.json", viewPermission: "bp.read" }, { sectionKey: "contacts", presentationRef: "business_partner/presentation.section.contacts.json", viewPermission: "bp.contacts.read" }], actions: [] });
const operation = artifact("operation", "business_partner/operation", { operations: [] });
const overview = artifact("presentation_section", "business_partner/presentation.section.overview", { sectionKey: "overview", rendererKey: "platform.fields.v1", fieldBindings: [{ fieldKey: "name" }], dataBinding: { kind: "registered_service", handlerKey: "neon.bp.section.overview.v1" } });
const context = { tenantId: "tenant", principalId: "principal", planeKey: "neon", permissions: { allowed: ["bp.read"] } } as any;

describe("entity runtime resource service", () => {
  it("uses one header projection and refuses denied sections before handler invocation", async () => {
    const readHeader = vi.fn(async () => ({ revision: "record-1", values: { name: "Acme" } }));
    const handler = { read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })) };
    const reader = {
      surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface })),
      operation: vi.fn(async () => operation),
      section: vi.fn(async () => overview),
    };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader }, sections: { get: vi.fn((key) => key === "neon.bp.section.overview.v1" ? handler : undefined) } });
    const bootstrap = await service.bootstrap({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail" });
    expect(readHeader).toHaveBeenCalledWith(expect.objectContaining({ fieldKeys: ["name", "code", "status"] }));
    expect(bootstrap?.plan.sections.map((section) => section.key)).toEqual(["overview"]);
    await expect(service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "contacts" })).resolves.toBeNull();
    expect(reader.section).not.toHaveBeenCalled();
    await expect(service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "overview" })).resolves.toMatchObject({
      sectionKey: "overview",
      presentation: { rendererKey: "platform.fields.v1", fields: [{ key: "name" }] },
    });
    expect(handler.read).toHaveBeenCalledOnce();
    expect(handler.read).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it("reads declared summary cards lazily and isolates an unavailable provider", async () => {
    const summarySurface = artifact("presentation_surface", "business_partner/presentation.detail", {
      ...surface.content,
      summaryView: { cards: [
        { key: "primary-contact", provider: "primary-contact", rendererKey: "platform.contact.summary.v1", label: { labelKey: "summary.contact", defaultText: "Primary Contact" } },
        { key: "governance", provider: "governance-state", rendererKey: "platform.summary.status.v1", label: { labelKey: "summary.governance", defaultText: "Governance" } },
      ] },
    });
    const handler = { read: vi.fn(async () => ({ name: "Nurul Aziz" })) };
    const reader = { surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface: summarySurface })), operation: vi.fn(async () => operation), section: vi.fn() };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader: vi.fn(async () => ({ revision: "record-1", values: {} })) }, sections: { get: vi.fn() }, summaries: { get: vi.fn((provider) => provider === "primary-contact" ? handler : undefined) } });
    await expect(service.summary({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail" })).resolves.toMatchObject({ revision: "record-1", cards: [ { key: "primary-contact", state: "ready", data: { name: "Nurul Aziz" } }, { key: "governance", state: "unavailable" } ] });
    expect(handler.read).toHaveBeenCalledOnce();
  });

  it("resolves a published platform service key without an entity-specific handler key", async () => {
    const comments = artifact("presentation_section", "business_partner/presentation.section.comments", { sectionKey: "comments", rendererKey: "platform.comments.v1", dataBinding: { serviceKey: "platform.comments.v1" } });
    const permittedSurface = artifact("presentation_surface", "business_partner/presentation.detail", { surfaceKey: "detail", header: { titleField: "name", codeField: "code", statusField: "status" }, sections: [{ sectionKey: "comments", presentationRef: "business_partner/presentation.section.comments.json", viewPermission: "bp.read" }], actions: [] });
    const handler = { read: vi.fn(async () => ({ revision: "comments-1", data: { items: [] } })) };
    const reader = { surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface: permittedSurface })), operation: vi.fn(async () => operation), section: vi.fn(async () => comments) };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader: vi.fn(async () => ({ revision: "record-1", values: {} })) }, sections: { get: vi.fn(), getService: vi.fn((key) => key === "platform.comments.v1" ? handler : undefined) } });
    await expect(service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "comments" })).resolves.toMatchObject({ sectionKey: "comments", revision: "comments-1" });
    expect(handler.read).toHaveBeenCalledOnce();
  });

  it("passes only bounded cursor pagination to an admitted section handler", async () => {
    const handler = { read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })) };
    const reader = { surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface })), operation: vi.fn(async () => operation), section: vi.fn(async () => overview) };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader: vi.fn() }, sections: { get: vi.fn(() => handler) } });
    await service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "overview", limit: 1000, cursor: "00000000-0000-4000-8000-000000000002" });
    expect(handler.read).toHaveBeenCalledWith(expect.objectContaining({ limit: 100, cursor: "00000000-0000-4000-8000-000000000002" }));
  });
});

function artifact(type: CompiledEntityArtifactV2["artifactType"], key: string, content: Record<string, unknown>): CompiledEntityArtifactV2 {
  return { schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2, contractStatus: "draft_for_review", artifactType: type, artifactKey: key, entityCode: "business_partner", plane: "neon", dependencies: [], artifactHash: `sha256:${"a".repeat(64)}`, content };
}

describe("section context handling", () => {
  it("forwards an explicit resource context only to the admitted section handler", async () => {
    const handler = { read: vi.fn(async () => ({ revision: "section-1", data: { items: [] } })) };
    const reader = { surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface })), operation: vi.fn(async () => operation), section: vi.fn(async () => overview) };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader: vi.fn() }, sections: { get: vi.fn(() => handler) } });
    await service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "overview", resourceContext: { operatingOrganizationId: "00000000-0000-4000-8000-000000000002", companyCodeId: "00000000-0000-4000-8000-000000000003", roleLens: "supplier" } });
    expect(handler.read).toHaveBeenCalledWith(expect.objectContaining({ resourceContext: { operatingOrganizationId: "00000000-0000-4000-8000-000000000002", companyCodeId: "00000000-0000-4000-8000-000000000003", roleLens: "supplier" } }));
  });

  it("turns a registered reader's expected context conflict into a safe runtime response", async () => {
    const handler = { read: vi.fn(async () => { throw Object.assign(new Error("Select context"), { status: 409, code: "BP_360_SCOPE_REQUIRED" }); }) };
    const reader = { surfaceModel: vi.fn(async () => ({ release: { release: { releaseId: "release-1", releaseHash: `sha256:${"a".repeat(64)}` } }, core, surface })), operation: vi.fn(async () => operation), section: vi.fn(async () => overview) };
    const service = createEntityRuntimeResourceService({ reader: reader as any, headers: { readHeader: vi.fn() }, sections: { get: vi.fn(() => handler) } });
    await expect(service.section({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", surfaceKey: "detail", sectionKey: "overview" })).rejects.toMatchObject({ status: 409, code: "ENTITY_RUNTIME_CONTEXT_REQUIRED", message: "Select an authorized organization and company context for this section." });
  });
});
