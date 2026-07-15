import { describe, expect, it } from "vitest";

import {
  compileEntityCapabilityManifest,
  EntityCapabilityCompilationError,
  type CompileCapabilityManifestInput,
} from "../entity-capability-manifest.js";

function input(overrides: Partial<CompileCapabilityManifestInput> = {}): CompileCapabilityManifestInput {
  return {
    entityCode: "supplier",
    entityVersionId: "version-effective",
    renderer: "master",
    backingType: "table",
    mutability: "mutable",
    featureFlags: { generic_hard_delete_enabled: true },
    displayConfig: {},
    fields: [{
      name: "name",
      column_name: "name",
      data_type: "text",
      origin: "user",
      is_required: true,
      is_read_only: false,
      is_computed: false,
      is_write_once: false,
      editability: { editable_in_status: ["draft"] },
    }],
    relations: [],
    operations: [
      { permissionCode: "supplier.create", enabled: true },
      { permissionCode: "supplier.update", enabled: true },
      { permissionCode: "supplier.delete", enabled: true },
    ],
    hasDocumentRuntime: false,
    handlerManifest: {
      writeFacades: ["PurchaseOrderFacade"],
      mutationHandlers: ["DocumentWorkspaceAggregateHandler"],
      lifecycleHandlers: [],
      attachmentProviders: [],
      collectionHandlers: [],
    },
    ...overrides,
  };
}

describe("entity capability manifest compiler", () => {
  it("compiles create/update field decisions for the effective version", () => {
    const manifest = compileEntityCapabilityManifest(input());
    expect(manifest.write.entityVersionId).toBe("version-effective");
    expect(manifest.write.fields[0]).toMatchObject({
      writable: { create: true, update: true },
      required: { create: true, update: false },
      statusLimited: true,
      editableInStatuses: ["draft"],
    });
  });

  it("compiles write-once, computed, and system-managed decisions", () => {
    const manifest = compileEntityCapabilityManifest(input({
      fields: [
        { ...input().fields[0]!, name: "code", column_name: "code", is_write_once: true },
        { ...input().fields[0]!, name: "total", column_name: "total", is_computed: true },
        { ...input().fields[0]!, name: "updated_at", column_name: "updated_at", origin: "system" },
      ],
    }));
    expect(manifest.write.fields[0]?.writable).toEqual({ create: true, update: false });
    expect(manifest.write.fields[1]?.computed).toBe(true);
    expect(manifest.write.fields[2]?.systemManaged).toBe(true);
  });

  it("rejects a document without its compiled document runtime", () => {
    expect(() => compileEntityCapabilityManifest(input({ renderer: "document" })))
      .toThrow(/compiled document runtime/);
  });

  it("rejects an unregistered write facade", () => {
    expect(() => compileEntityCapabilityManifest(input({
      featureFlags: { write_facade: "MissingFacade" },
    }))).toThrow(/not registered/);
  });

  it("rejects a declared child collection without ownership", () => {
    expect(() => compileEntityCapabilityManifest(input({
      relations: [{
        name: "lines",
        relation_kind: "has_many",
        target_entity: "supplier_line",
        runtime_role: "line_items",
      }],
    }))).toThrow(/ownership\/FK strategy/);
  });

  it("compiles collection ownership, version strategy, and allowed actions", () => {
    const manifest = compileEntityCapabilityManifest(input({
      relations: [{
        name: "lines",
        relation_kind: "has_many",
        target_entity: "supplier_line",
        runtime_role: "line_items",
        fk_field: "supplier_id",
        ui_behavior: {
          mutation_owner: "workspace",
          version_strategy: "row_version",
          mutation_policy: { create: true, update: true, delete: false, replace: true },
        },
      }],
    }));
    expect(manifest.collections[0]).toMatchObject({
      name: "lines",
      targetEntity: "supplier_line",
      ownership: "foreign_key",
      foreignKey: "supplier_id",
      versionStrategy: "row_version",
      allowedActions: { create: true, update: true, delete: false, replace: true },
    });
  });

  it("rejects enabled generic mutations on a ledger", () => {
    expect(() => compileEntityCapabilityManifest(input({
      renderer: "ledger",
      featureFlags: {},
    }))).toThrow(/ledger renderer cannot expose enabled generic mutation/);
  });

  it("rejects an enabled operation whose permission is not registered", () => {
    expect(() => compileEntityCapabilityManifest(input({
      operations: [{ permissionCode: "supplier.unknown", enabled: true, permissionRegistered: false }],
    }))).toThrow(/unknown permission/);
  });

  it("rejects lifecycle-only deletion combined with hard delete", () => {
    expect(() => compileEntityCapabilityManifest(input({
      featureFlags: { deletion_mode: "lifecycle_only", allow_hard_delete: true },
    }))).toThrow(/lifecycle-only entity cannot expose hard delete/);
  });

  it("returns a typed compilation error containing every issue", () => {
    try {
      compileEntityCapabilityManifest(input({ renderer: "document", featureFlags: { write_facade: "Missing" } }));
      throw new Error("expected compilation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(EntityCapabilityCompilationError);
      expect((error as EntityCapabilityCompilationError).issues).toHaveLength(2);
    }
  });

  it("uses conservative renderer deletion defaults", () => {
    const statusField = { ...input().fields[0]!, name: "status", column_name: "status", origin: "system" };
    expect(compileEntityCapabilityManifest(input({
      featureFlags: {},
      fields: [...input().fields, statusField],
    })).deletionMode).toBe("retire");
    expect(compileEntityCapabilityManifest(input({
      renderer: "simple",
      mutability: "transient",
      featureFlags: {},
    })).deletionMode).toBe("hard_delete");
    expect(compileEntityCapabilityManifest(input({
      renderer: "ledger",
      featureFlags: {},
      operations: [],
    })).deletionMode).toBe("prohibited");
  });

  it("compiles canonical lifecycle behavior flags", () => {
    const manifest = compileEntityCapabilityManifest(input({
      renderer: "document",
      hasDocumentRuntime: true,
      featureFlags: { has_lifecycle: true },
      operations: [],
      lifecycleStates: [
        { code: "draft", isInitial: true, isTerminal: false, stateFlags: { is_editable: true, is_deletable: true } },
        { code: "posted", isInitial: false, isTerminal: false, stateFlags: { is_committed: true, is_reversible: true } },
      ],
    }));
    expect(manifest.lifecycle?.states).toEqual({
      draft: { isEditable: true, isCommitted: false, isTerminal: false, isDeletable: true, isReversible: false },
      posted: { isEditable: false, isCommitted: true, isTerminal: false, isDeletable: false, isReversible: true },
    });
    expect(manifest.deletionMode).toBe("lifecycle_only");
  });

  it("rejects contradictory lifecycle flags and physical document deletion", () => {
    expect(() => compileEntityCapabilityManifest(input({
      renderer: "document",
      hasDocumentRuntime: true,
      featureFlags: { has_lifecycle: true },
      operations: [],
      lifecycleStates: [{
        code: "posted", isInitial: false, isTerminal: true,
        stateFlags: { is_editable: true, is_committed: true, is_deletable: true },
      }],
    }))).toThrow(/committed and editable|terminal and editable|cannot be deletable/);
    expect(() => compileEntityCapabilityManifest(input({
      renderer: "document",
      hasDocumentRuntime: true,
      featureFlags: { deletion_mode: "hard_delete" },
      operations: [],
    }))).toThrow(/document renderer cannot expose hard delete/);
  });
});
