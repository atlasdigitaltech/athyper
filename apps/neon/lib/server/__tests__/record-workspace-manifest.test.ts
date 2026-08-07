import { describe, expect, it } from "vitest";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { compileMetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  buildRecordWorkspaceCacheScope,
  isRecordWorkspaceDiagnosticsAdministrator,
  resolveEffectiveRecordWorkspaceManifestFromLoaded,
  resolveRecordWorkspacePermissions,
} from "../record-workspace-manifest";

const DOCUMENT_PLAN = {
  source: "compiled_v6" as const,
  schemaVersion: "document-edit-runtime/v6.0" as const,
  planVersion: "server-manifest-test-v1",
  planHash: "server-manifest-test-v1",
  archetype: "header_only" as const,
  nodes: [{ key: "header", kind: "core" as const, versionSource: "document" as const }],
  invalidationActions: [],
};

describe("server record workspace manifest resolver", () => {
  it("derives allowed and denied permission sets only from server-resolved operation decisions", () => {
    const descriptor = documentDescriptor();
    const permissions = resolveRecordWorkspacePermissions(descriptor);

    expect([...permissions.allowed]).toContain("journal_entry.post");
    expect([...permissions.denied!]).toContain("journal_entry.reverse");
    expect([...permissions.known!]).toEqual(expect.arrayContaining([
      "journal_entry.post",
      "journal_entry.reverse",
    ]));
  });

  it("varies cache scope and effective operations by principal and record lifecycle state", () => {
    const descriptor = documentDescriptor();
    const draft = resolveEffectiveRecordWorkspaceManifestFromLoaded({
      descriptor,
      recordId: "record-draft",
      record: { id: "record-draft", status: "draft", row_version: 3 } as never,
      processState: state("record-draft", "draft", false, ["posted"]),
      session: session("principal-1"),
    });
    const posted = resolveEffectiveRecordWorkspaceManifestFromLoaded({
      descriptor,
      recordId: "record-posted",
      record: { id: "record-posted", status: "posted", row_version: 4 } as never,
      processState: state("record-posted", "posted", true, []),
      session: session("principal-1"),
    });
    const anotherUserScope = buildRecordWorkspaceCacheScope({
      descriptor,
      recordId: "record-draft",
      record: { id: "record-draft", status: "draft", row_version: 3 } as never,
      processState: state("record-draft", "draft", false, ["posted"]),
      session: session("principal-2"),
      permissions: resolveRecordWorkspacePermissions(descriptor),
    });

    expect(draft.manifest.operations.map((operation) => operation.permissionCode)).toContain("journal_entry.post");
    expect(posted.manifest.operations.map((operation) => operation.permissionCode)).not.toContain("journal_entry.post");
    expect(draft.manifest.cacheScope.key).not.toBe(posted.manifest.cacheScope.key);
    expect(draft.manifest.cacheScope.key).not.toBe(anotherUserScope.key);
  });

  it("requires an explicit administrative workbench, context, or role for diagnostics", () => {
    expect(isRecordWorkspaceDiagnosticsAdministrator(session("user-1"))).toBe(false);
    expect(isRecordWorkspaceDiagnosticsAdministrator(session("admin-1", {
      activeWorkbench: "admin",
    }))).toBe(true);
    expect(isRecordWorkspaceDiagnosticsAdministrator(session("tenant-admin", {
      contextType: "tenant_admin",
    }))).toBe(true);
    expect(isRecordWorkspaceDiagnosticsAdministrator(session("role-admin", {
      roles: ["administrator"],
    }))).toBe(true);
  });
});

function documentDescriptor() {
  return compileMetaEntityRuntimeDescriptor({
    entity_code: "journal_entry",
    entity_name: "Journal Entry",
    entity_class: "DOCUMENT",
    table_schema: "document",
    table_name: "journal_entry",
    document_runtime_plan: DOCUMENT_PLAN,
    fields: [{ name: "name", label: "Name", data_type: "text" }],
    display_config: { detail_renderer: "document" },
    feature_flags: { has_attachments: false, has_lifecycle: true },
  }, {
    operations: [
      {
        id: "post",
        permission_code: "journal_entry.post",
        surface: "DETAIL",
        permission_decision: "allow",
        action_group: "lifecycle",
        source: "lifecycle_transition",
        lifecycle_transitions: [{ from_state: "draft", to_state: "posted" }],
      },
      {
        id: "reverse",
        permission_code: "journal_entry.reverse",
        surface: "DETAIL",
        permission_decision: "deny",
      },
    ],
    concurrencyPolicy: { strategy: "version_only", version_column: "row_version" },
  });
}

function state(recordId: string, currentState: string, terminal: boolean, allowedTransitions: string[]) {
  return {
    entityCode: "journal_entry",
    recordId,
    lifecycle: {
      currentState,
      source: "record_status" as const,
      allowedTransitions,
      terminal,
    },
  };
}

function session(
  userId: string,
  overrides: { activeWorkbench?: string; contextType?: string; roles?: string[] } = {},
): V4Session {
  return {
    userId,
    activeOrg: "athyper",
    activeWorkbench: overrides.activeWorkbench ?? "user",
    organizations: {
      athyper: {
        id: "org-1",
        name: "Athyper",
        alias: "athyper",
        tenantId: "tenant-1",
        roles: overrides.roles ?? ["user"],
        contextType: overrides.contextType ?? "legal_entity",
      },
    },
    planeKey: "neon",
    realmKey: "tenant-control",
  } as V4Session;
}
