/**
 * Phase 3 — Capability resolution + alias-aware operation matching.
 *
 * Validates that resolveCapabilities() now populates canCreateReason,
 * canEditReason, canDeleteReason fields with stable DisabledReason codes,
 * and that the alias map (control.permission_alias) lets entity_operation
 * rows that reference legacy codes resolve to canonical actions.
 */

import { describe, expect, it } from "vitest";

import {
  compileMetaEntityRuntimeDescriptor,
  type CompiledMetaEntityInput,
} from "../index";

function baseEntity(overrides: Partial<CompiledMetaEntityInput> = {}): CompiledMetaEntityInput {
  return {
    entity_id: "entity-1",
    version_id: "version-1",
    version_no: 1,
    version_hash: "hash-1",
    entity_code: "supplier",
    slug: "supplier",
    entity_name: "Supplier",
    entity_class: "MASTER",
    table_schema: "master",
    table_name: "supplier",
    backing_type: "table",
    compiled_hash: "ch-1",
    compiled_at: "2026-06-10T00:00:00Z",
    fields: [{
      id: "f-id",
      name: "id",
      column_name: "id",
      label: "ID",
      data_type: "uuid",
      is_required: true,
      is_filterable: true,
      sort_order: 0,
    }],
    display_config: {},
    feature_flags: {
      generic_hard_delete_enabled: true,
    },
    identity_config: {},
    search_config: {},
    data_policy: {},
    ...overrides,
  };
}

describe("Phase 3 — capability reason fields", () => {
  it("returns canCreateReason=null when the create op is present and entity is writable", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [{
        id: "op-create",
        entity_name: "supplier",
        permission_code: "create",
        surface: "LIST",
        placement: "PRIMARY",
        handler_type: "NAVIGATE",
        handler_target: "/app/supplier/new",
        is_record_required: false,
        sort_order: 10,
        is_enabled: true,
      }],
    });

    expect(descriptor.capabilities.canCreate).toBe(true);
    expect(descriptor.capabilities.canCreateReason).toBeNull();
  });

  it("returns canCreateReason='missing_permission' when no create op is registered", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [{
        id: "op-read",
        entity_name: "supplier",
        permission_code: "read",
        surface: "LIST",
        placement: "TOOLBAR",
        handler_type: "API",
        is_record_required: false,
        sort_order: 10,
        is_enabled: true,
      }],
    });

    expect(descriptor.capabilities.canCreate).toBe(false);
    expect(descriptor.capabilities.canCreateReason).toBe("missing_permission");
  });

  it("returns canEditReason='entity_readonly' when feature_flags.is_readonly is set", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(
      baseEntity({ feature_flags: { is_readonly: true, generic_hard_delete_enabled: true } }),
      {
        operations: [{
          id: "op-update",
          entity_name: "supplier",
          permission_code: "update",
          surface: "DETAIL",
          placement: "PRIMARY",
          handler_type: "NAVIGATE",
          handler_target: "/app/supplier/{id}/edit",
          is_record_required: true,
          sort_order: 20,
          is_enabled: true,
        }],
      },
    );

    expect(descriptor.capabilities.canEdit).toBe(false);
    expect(descriptor.capabilities.canEditReason).toBe("entity_readonly");
  });

  it("returns canDeleteReason='hard_delete_disabled' when delete op exists but hard-delete flag is off", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(
      baseEntity({ feature_flags: {} }), // no generic_hard_delete_enabled
      {
        operations: [{
          id: "op-delete",
          entity_name: "supplier",
          permission_code: "delete",
          surface: "DETAIL",
          placement: "OVERFLOW",
          handler_type: "MODAL",
          handler_target: "delete",
          is_record_required: true,
          sort_order: 30,
          is_enabled: true,
        }],
      },
    );

    expect(descriptor.capabilities.canDelete).toBe(false);
    expect(descriptor.capabilities.canDeleteReason).toBe("hard_delete_disabled");
  });

  it("returns canEditReason='default_deny_policy' when entity_policy.access_mode is default_deny", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [{
        id: "op-update",
        entity_name: "supplier",
        permission_code: "update",
        surface: "DETAIL",
        placement: "PRIMARY",
        handler_type: "NAVIGATE",
        handler_target: "/app/supplier/{id}/edit",
        is_record_required: true,
        sort_order: 20,
        is_enabled: true,
      }],
      entityPolicy: { access_mode: "default_deny" },
    });

    expect(descriptor.capabilities.canEdit).toBe(false);
    expect(descriptor.capabilities.canEditReason).toBe("default_deny_policy");
  });
});

describe("Phase 3 — permission alias map", () => {
  it("resolves legacy 'edit' permission_code to canonical 'update' via the alias map", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [{
        id: "op-edit-alias",
        entity_name: "supplier",
        permission_code: "edit", // legacy code
        surface: "DETAIL",
        placement: "PRIMARY",
        handler_type: "NAVIGATE",
        handler_target: "/app/supplier/{id}/edit",
        is_record_required: true,
        sort_order: 20,
        is_enabled: true,
      }],
      permissionAliasMap: { edit: "update" },
    });

    expect(descriptor.capabilities.canEdit).toBe(true);
    expect(descriptor.capabilities.canEditReason).toBeNull();
  });

  it("matches canonical 'update' directly without needing an alias map entry", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [{
        id: "op-update",
        entity_name: "supplier",
        permission_code: "update",
        surface: "DETAIL",
        placement: "PRIMARY",
        handler_type: "NAVIGATE",
        handler_target: "/app/supplier/{id}/edit",
        is_record_required: true,
        sort_order: 20,
        is_enabled: true,
      }],
      // No alias map provided
    });

    expect(descriptor.capabilities.canEdit).toBe(true);
  });
});

describe("Phase 3 — lifecycle state masks pass-through", () => {
  it("includes lifecycleStateMasks in the descriptor when provided", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [],
      lifecycleStateMasks: [
        { recordStatus: "posted", canEdit: false, canDelete: false, disabledReason: "posted_locked" },
        { recordStatus: "archived", canEdit: false, canDelete: false, disabledReason: "archived_immutable" },
      ],
    });

    expect(descriptor.lifecycleStateMasks).toHaveLength(2);
    expect(descriptor.lifecycleStateMasks?.[0]?.recordStatus).toBe("posted");
    expect(descriptor.lifecycleStateMasks?.[0]?.canEdit).toBe(false);
  });

  it("defaults lifecycleStateMasks to an empty array when none provided", () => {
    const descriptor = compileMetaEntityRuntimeDescriptor(baseEntity(), {
      operations: [],
    });

    expect(descriptor.lifecycleStateMasks).toEqual([]);
  });
});
