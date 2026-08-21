/**
 * descriptorHash regression — confirms `reference_config` changes
 * invalidate the list cache.
 *
 * Phase 4 contract: when an entity_field's `reference_config.label_field`
 * (or `target_entity`, `code_field`, picker.code_field) changes, the
 * runtime label enricher will emit different companion values. Cached
 * pages keyed against the old descriptor must NOT be reused — the cache
 * key must roll. We don't depend on `entity_version.version_hash` for
 * this because the seed-side hash backfill is partial and the fallback
 * in entity-compiler.service.ts is `entity_id:vN`, which doesn't reflect
 * field-level changes at all.
 */

import { describe, expect, it } from "vitest";
import { stableEntityListCacheHash } from "../cache/list-cache.js";

interface FieldHashInput {
  name: string;
  column: string;
  searchable: boolean;
  type: string;
  referenceConfig: Record<string, unknown> | null;
}

const BASE_FIELD: FieldHashInput = {
  name:            "gl_account_id",
  column:          "gl_account_id",
  searchable:      false,
  type:            "reference",
  referenceConfig: { target_entity: "gl_account", target_field: "id", display_field: "name" },
};

function hashWithFields(fields: FieldHashInput[]): string {
  return stableEntityListCacheHash({
    versionHash:   null,
    versionNo:     1,
    entityId:      "ent-1",
    displayConfig: {},
    searchConfig:  {},
    fields,
  });
}

describe("descriptorHash — reference_config inclusion", () => {
  it("differs when label_field changes (display_field → label_field rename)", () => {
    const before = hashWithFields([BASE_FIELD]);
    const after  = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { target_entity: "gl_account", target_field: "id", display_field: "long_name" },
    }]);
    expect(before).not.toBe(after);
  });

  it("differs when target_entity changes", () => {
    const before = hashWithFields([BASE_FIELD]);
    const after  = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { target_entity: "gl_account_v2", target_field: "id", display_field: "name" },
    }]);
    expect(before).not.toBe(after);
  });

  it("differs when picker.code_field changes", () => {
    const before = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { target_entity: "asset", display_field: "name", picker: { code_field: "code" } },
    }]);
    const after  = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { target_entity: "asset", display_field: "name", picker: { code_field: "asset_number" } },
    }]);
    expect(before).not.toBe(after);
  });

  it("differs between { referenceConfig: null } and a populated config", () => {
    const before = hashWithFields([{ ...BASE_FIELD, referenceConfig: null }]);
    const after  = hashWithFields([BASE_FIELD]);
    expect(before).not.toBe(after);
  });

  it("is stable across object-key ordering inside reference_config", () => {
    const orderingA = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { target_entity: "gl_account", display_field: "name", target_field: "id" },
    }]);
    const orderingB = hashWithFields([{
      ...BASE_FIELD,
      referenceConfig: { display_field: "name", target_field: "id", target_entity: "gl_account" },
    }]);
    expect(orderingA).toBe(orderingB);
  });
});
