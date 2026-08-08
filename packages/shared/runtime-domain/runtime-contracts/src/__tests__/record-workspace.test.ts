import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileMetaEntityRuntimeDescriptor } from "../compiler";
import {
  clearMetadataCompatibilityFallbacks,
  readMetadataCompatibilityFallbacks,
} from "../compatibility-fallback";
import {
  assertRecordWorkspaceDefinition,
  resolveRecordWorkspaceDefinition,
} from "../record-workspace";
import {
  MetaEntityRuntimeDescriptorSchema,
  RecordWorkspaceDefinitionSchema,
  type MetaEntityRenderer,
} from "../schemas";

const DOCUMENT_PLAN = {
  source: "compiled_v6" as const,
  schemaVersion: "document-edit-runtime/v6.0" as const,
  planVersion: "record-workspace-test-v1",
  planHash: "record-workspace-test-v1",
  archetype: "header_only" as const,
  nodes: [{ key: "header", kind: "core" as const, versionSource: "document" as const }],
  invalidationActions: [],
};

describe("record workspace definition", () => {
  beforeEach(() => {
    clearMetadataCompatibilityFallbacks();
    vi.restoreAllMocks();
  });

  it.each(["master", "document", "ledger", "simple"] satisfies MetaEntityRenderer[])(
    "compiles a valid definition for the %s renderer without replacing capabilities or surfaces",
    (renderer) => {
      const descriptor = compileMetaEntityRuntimeDescriptor(entity(renderer));

      expect(descriptor.recordWorkspace).toBeDefined();
      expect(assertRecordWorkspaceDefinition(descriptor.recordWorkspace)).toEqual(descriptor.recordWorkspace);
      expect(descriptor.recordWorkspace?.renderer).toBe(renderer);
      expect(descriptor.recordWorkspace?.surfaces).toEqual(descriptor.surfaces.map((surface) => ({
        key: surface.key,
        kind: surface.kind,
        placement: surface.placement,
        order: surface.order,
        enabled: surface.enabled,
      })));
      expect(MetaEntityRuntimeDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    },
  );

  it("compiles approvals, lifecycle timeline, and snapshots as separate resources", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      ...entity("document"),
      feature_flags: {
        has_workflow: true,
        has_lifecycle: true,
        version_control: true,
      },
    });

    expect(descriptor.recordWorkspace?.resources).toMatchObject({
      approvals: {
        enabled: true,
        source: "capability_and_surface",
        surfaceKey: "workflow",
      },
      lifecycleTimeline: {
        enabled: true,
        source: "capability_and_surface",
        surfaceKey: "lifecycle",
      },
      snapshots: {
        enabled: true,
        source: "capability_and_surface",
        surfaceKey: "versions",
        compareSurfaceKey: "compare",
      },
    });
  });

  it("preserves the legacy implied lifecycle tab and records the compatibility fallback", () => {
    silenceCompatibilityWarnings();
    const descriptor = compileMetaEntityRuntimeDescriptor({
      ...entity("document"),
      entity_code: "legacy_document",
      feature_flags: {
        has_workflow: true,
        version_control: true,
      },
    });

    expect(descriptor.capabilities.hasLifecycle).toBe(false);
    expect(descriptor.recordWorkspace?.resources.lifecycleTimeline).toEqual({
      enabled: true,
      source: "compatibility_fallback",
      fallbackReason: "approvals_or_snapshots_imply_lifecycle_timeline",
    });
    expect(readMetadataCompatibilityFallbacks()).toEqual([
      expect.objectContaining({
        area: "record-workspace.lifecycle-timeline",
        subjectKind: "descriptor",
        subjectName: "legacy_document",
        count: 1,
      }),
    ]);
  });

  it("reconstructs a missing legacy definition and instruments the descriptor fallback", () => {
    silenceCompatibilityWarnings();
    const descriptor = compileMetaEntityRuntimeDescriptor(entity("master"));
    const legacyDescriptor = { ...descriptor, recordWorkspace: undefined };
    clearMetadataCompatibilityFallbacks();

    const workspace = resolveRecordWorkspaceDefinition(legacyDescriptor);

    expect(RecordWorkspaceDefinitionSchema.parse(workspace)).toEqual(workspace);
    expect(workspace.surfaces.map((surface) => surface.key)).toEqual(
      descriptor.surfaces.map((surface) => surface.key),
    );
    expect(readMetadataCompatibilityFallbacks()).toEqual([
      expect.objectContaining({
        area: "record-workspace",
        subjectKind: "descriptor",
        subjectName: descriptor.entityCode,
        convention: "descriptor capabilities and surfaces",
        count: 1,
      }),
    ]);
  });

  it("rejects workspace definitions that drift from descriptor surfaces", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(entity("master"));
    const result = MetaEntityRuntimeDescriptorSchema.safeParse({
      ...descriptor,
      recordWorkspace: {
        ...descriptor.recordWorkspace,
        surfaces: descriptor.recordWorkspace?.surfaces.map((surface, index) =>
          index === 0 ? { ...surface, placement: "context_panel" } : surface),
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.path.join(".").startsWith("recordWorkspace.surfaces"))).toBe(true);
    }
  });

  it("rejects lifecycle, approval, and snapshot bindings that point at another resource's surface", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor({
      ...entity("document"),
      feature_flags: {
        has_workflow: true,
        has_lifecycle: true,
        version_control: true,
      },
    });
    const workspace = descriptor.recordWorkspace!;
    const result = RecordWorkspaceDefinitionSchema.safeParse({
      ...workspace,
      resources: {
        ...workspace.resources,
        lifecycleTimeline: {
          enabled: true,
          source: "surface",
          surfaceKey: workspace.resources.approvals.surfaceKey,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["resources", "lifecycleTimeline", "surfaceKey"],
        }),
      ]);
    }
  });
});

function entity(renderer: MetaEntityRenderer) {
  return {
    entity_code: `${renderer}_record`,
    entity_name: `${renderer} record`,
    entity_class: renderer === "ledger" ? "LEDGER" : renderer === "document" ? "DOCUMENT" : "MASTER",
    table_schema: renderer === "document" ? "document" : "master",
    table_name: `${renderer}_record`,
    ...(renderer === "document" ? { document_runtime_plan: DOCUMENT_PLAN } : {}),
    fields: [{ name: "name", label: "Name", data_type: "text" }],
    display_config: { detail_renderer: renderer },
    feature_flags: { has_attachments: false },
  };
}

function silenceCompatibilityWarnings(): void {
  const logger = (globalThis as unknown as { console: { warn: (message: string) => void } }).console;
  vi.spyOn(logger, "warn").mockImplementation(() => undefined);
}
