import { describe, expect, it, vi } from "vitest";
import { compileMetaEntityRuntimeDescriptor } from "../compiler";
import {
  resolveEffectiveRecordWorkspaceManifest,
  validateRecordWorkspaceSurfacePermissions,
  type RecordWorkspacePermissionContext,
} from "../record-workspace";
import {
  EffectiveRecordWorkspaceManifestSchema,
  MetaEntityRuntimeDescriptorSchema,
  type MetaEntityRenderer,
  type ProcessRuntimeState,
  type RecordWorkspaceCacheScope,
} from "../schemas";

const DOCUMENT_PLAN = {
  source: "compiled_v6" as const,
  schemaVersion: "document-edit-runtime/v6.0" as const,
  planVersion: "effective-workspace-test-v1",
  planHash: "effective-workspace-test-v1",
  archetype: "header_only" as const,
  nodes: [{ key: "header", kind: "core" as const, versionSource: "document" as const }],
  invalidationActions: [],
};

describe("effective record workspace manifest", () => {
  it("produces different resource matrices for document and master entities", () => {
    const document = compileMetaEntityRuntimeDescriptor({
      ...entity("document", "invoice"),
      feature_flags: {
        has_workflow: true,
        has_lifecycle: true,
        version_control: true,
        comments_enabled: true,
        has_attachments: true,
        event_history: true,
      },
    });
    const master = compileMetaEntityRuntimeDescriptor(entity("master", "site"));

    const documentManifest = resolve(document, allowDescriptorOperations(document), "doc").manifest;
    const masterManifest = resolve(master, allowDescriptorOperations(master), "master").manifest;

    expect(documentManifest.resources.map((resource) => resource.key)).toEqual([
      "approvals",
      "lifecycleTimeline",
      "snapshots",
      "comments",
      "attachments",
      "activity",
    ]);
    expect(masterManifest.resources).toEqual([]);
    expect(documentManifest.cacheScope.key).not.toBe(masterManifest.cacheScope.key);
    expect(EffectiveRecordWorkspaceManifestSchema.parse(documentManifest)).toEqual(documentManifest);
  });

  it("excludes a protected surface and its resource for a user without its permission", () => {
    const base = compileMetaEntityRuntimeDescriptor({
      ...entity("document", "invoice"),
      feature_flags: { has_attachments: false, comments_enabled: true },
    }, {
      operations: [{
        id: "comments-read",
        permission_code: "invoice.comments.read",
        surface: "DETAIL",
        permission_decision: "allow",
      }],
    });
    const descriptor = MetaEntityRuntimeDescriptorSchema.parse({
      ...base,
      surfaces: base.surfaces.map((surface) => surface.kind === "comments"
        ? { ...surface, permissionCode: "invoice.comments.read" }
        : surface),
    });
    const allowed = permission("authoritative", ["invoice.comments.read"]);
    const denied = permission("authoritative", [], ["invoice.comments.read"]);

    const visible = resolve(descriptor, allowed, "allowed");
    const hidden = resolve(descriptor, denied, "denied");

    expect(visible.manifest.surfaces.some((surface) => surface.kind === "comments")).toBe(true);
    expect(visible.manifest.resources.some((resource) => resource.key === "comments")).toBe(true);
    expect(hidden.manifest.surfaces.some((surface) => surface.kind === "comments")).toBe(false);
    expect(hidden.manifest.resources.some((resource) => resource.key === "comments")).toBe(false);
    expect(hidden.diagnostics.surfaceDecisions).toContainEqual(expect.objectContaining({
      surfaceKey: "comments",
      included: false,
      reason: "permission_denied",
    }));
  });

  it("fails closed and reports a protected surface permission not found in metadata", () => {
    const base = compileMetaEntityRuntimeDescriptor({
      ...entity("document", "invoice"),
      feature_flags: { has_attachments: true },
    });
    const descriptor = MetaEntityRuntimeDescriptorSchema.parse({
      ...base,
      surfaces: base.surfaces.map((surface) => surface.kind === "attachments"
        ? { ...surface, permissionCode: "invoice.attachments.read" }
        : surface),
    });
    const permissions = permission("authoritative", []);

    const result = resolve(descriptor, permissions, "unknown");

    expect(result.manifest.resources.some((resource) => resource.key === "attachments")).toBe(false);
    expect(result.diagnostics.invalidPermissionCodes).toEqual([{
      surfaceKey: "attachments",
      permissionCode: "invoice.attachments.read",
      message: "Surface permission \"invoice.attachments.read\" is not present in the effective permission catalog.",
    }]);
    expect(validateRecordWorkspaceSurfacePermissions(descriptor, permissions)).toEqual(
      result.diagnostics.invalidPermissionCodes,
    );
  });

  it("changes effective operations and record state across lifecycle records", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      ...entity("document", "journal_entry"),
      feature_flags: { has_lifecycle: true },
    }, {
      operations: [{
        id: "post",
        permission_code: "journal_entry.post",
        surface: "DETAIL",
        action_group: "lifecycle",
        source: "lifecycle_transition",
        permission_decision: "allow",
        lifecycle_transitions: [{ from_state: "draft", to_state: "posted" }],
      }],
    });
    const permissions = allowDescriptorOperations(descriptor);
    const draftState = processState("journal_entry", "draft-record", "draft", false, ["posted"]);
    const postedState = processState("journal_entry", "posted-record", "posted", true, []);

    const draft = resolve(descriptor, permissions, "draft", draftState, { id: "draft-record", status: "draft" });
    const posted = resolve(descriptor, permissions, "posted", postedState, { id: "posted-record", status: "posted" });

    expect(draft.manifest.operations.map((operation) => operation.permissionCode)).toContain("journal_entry.post");
    expect(posted.manifest.operations.map((operation) => operation.permissionCode)).not.toContain("journal_entry.post");
    expect(draft.manifest.recordState).toMatchObject({ lifecycleState: "draft", terminal: false });
    expect(posted.manifest.recordState).toMatchObject({ lifecycleState: "posted", terminal: true });
    expect(draft.manifest.cacheScope.key).not.toBe(posted.manifest.cacheScope.key);
  });

  it("keeps record-workspace compatibility fallbacks observable while resolving a manifest", () => {
    const logger = (globalThis as unknown as { console: { warn: (message: string) => void } }).console;
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const descriptor = compileMetaEntityRuntimeDescriptor(entity("master", "legacy"));
    const result = resolve({ ...descriptor, recordWorkspace: undefined }, permission("descriptor_operations", []), "legacy");

    expect(result.manifest.entityCode).toBe("legacy");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

function resolve(
  descriptor: ReturnType<typeof compileMetaEntityRuntimeDescriptor>,
  permissions: RecordWorkspacePermissionContext,
  scopeKey: string,
  processState?: ProcessRuntimeState,
  record: Record<string, unknown> = { id: "record-1" },
) {
  return resolveEffectiveRecordWorkspaceManifest({
    descriptor,
    recordId: String(record["id"] ?? "record-1"),
    record,
    processState,
    permissions,
    cacheScope: cacheScope(scopeKey),
  });
}

function allowDescriptorOperations(
  descriptor: ReturnType<typeof compileMetaEntityRuntimeDescriptor>,
): RecordWorkspacePermissionContext {
  const codes = descriptor.operations.map((operation) => operation.permissionCode);
  return permission("descriptor_operations", codes);
}

function permission(
  source: RecordWorkspacePermissionContext["source"],
  allowed: string[],
  denied: string[] = [],
): RecordWorkspacePermissionContext {
  return { source, allowed, denied, known: [...allowed, ...denied] };
}

function cacheScope(key: string): RecordWorkspaceCacheScope {
  return {
    kind: "principal_record",
    key: `record-workspace:v1:${key}`,
    variesBy: ["tenant", "principal", "permission_stamp", "descriptor", "entity", "record", "record_state"],
  };
}

function processState(
  entityCode: string,
  recordId: string,
  currentState: string,
  terminal: boolean,
  allowedTransitions: string[],
): ProcessRuntimeState {
  return {
    entityCode,
    recordId,
    lifecycle: {
      currentState,
      source: "record_status",
      allowedTransitions,
      terminal,
    },
  };
}

function entity(renderer: MetaEntityRenderer, entityCode: string) {
  return {
    entity_code: entityCode,
    entity_name: entityCode,
    entity_class: renderer === "ledger" ? "LEDGER" : renderer === "document" ? "DOCUMENT" : "MASTER",
    table_schema: renderer === "document" ? "document" : "master",
    table_name: entityCode,
    ...(renderer === "document" ? { document_runtime_plan: DOCUMENT_PLAN } : {}),
    fields: [{ name: "name", label: "Name", data_type: "text" }],
    display_config: { detail_renderer: renderer },
    feature_flags: { has_attachments: false },
  };
}
