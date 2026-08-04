import { describe, expect, it } from "vitest";
import { EMPTY_META_ENTITY_STUDIO_SNAPSHOT } from "@athyper/meta-entity-authoring-contracts";
import {
  copyClassProfileDefaults,
  createMetaEntityStudioState,
  isEditableChangeSet,
  reduceMetaEntityStudioState,
  selectPreferredChangeSet,
  selectDiagnosticsBySeverity,
} from "./index";

describe("Meta Entity Studio state", () => {
  it("starts from the canonical empty snapshot", () => {
    const state = createMetaEntityStudioState(EMPTY_META_ENTITY_STUDIO_SNAPSHOT);
    expect(state.section).toBe("overview");
    expect(state.problemsOpen).toBe(true);
  });

  it("changes sections without mutating the prior state", () => {
    const state = createMetaEntityStudioState(EMPTY_META_ENTITY_STUDIO_SNAPSHOT);
    const next = reduceMetaEntityStudioState(state, { type: "select_section", section: "fields" });
    expect(next.section).toBe("fields");
    expect(state.section).toBe("overview");
  });

  it("counts diagnostics by severity", () => {
    expect(selectDiagnosticsBySeverity([
      { id: "1", code: "a", severity: "error", message: "A", section: "fields" },
      { id: "2", code: "b", severity: "warning", message: "B", section: "keys" },
    ])).toEqual({ error: 1, warning: 1, info: 0 });
  });

  it("prefers an editable draft over a published baseline", () => {
    const base = { entityId: "entity", branchCode: "main", title: "Example", lockVersion: 0, baseReleaseNo: null, updatedAt: null } as const;
    const selected = selectPreferredChangeSet([
      { ...base, id: "published", code: "baseline", status: "published" },
      { ...base, id: "draft", code: "studio", status: "draft" },
    ]);
    expect(selected?.id).toBe("draft");
    expect(isEditableChangeSet(selected)).toBe(true);
  });

  it("copies class defaults without replacing entity-specific storage coordinates", () => {
    const result = copyClassProfileDefaults({
      id: "profile", profileKey: "default", backingKind: "table", storagePlane: "neon",
      storageSchema: "master", storageObject: "business_partner", apiExposure: "api",
      readMode: "facade", writeMode: "facade", readHandlerKey: "read.bp", writeHandlerKey: "write.bp",
      createMode: "form_only", concurrencyMode: "optimistic", recordVersionFieldKey: "row_version",
      tenantFieldKey: "tenant_id", softDeleteFieldKey: null, draftTtlHours: null,
    }, {
      entityClass: "business", profileVersion: 1, fallbackName: "Business Entity", description: "Business",
      defaultBackingKind: "table", defaultApiExposure: "api", defaultReadMode: "generic",
      defaultWriteMode: "generic", defaultConcurrencyMode: "none", defaultChangePolicy: "controlled",
    });
    expect(result.storageObject).toBe("business_partner");
    expect(result.readMode).toBe("generic");
    expect(result.readHandlerKey).toBeNull();
    expect(result.recordVersionFieldKey).toBeNull();
  });
});
