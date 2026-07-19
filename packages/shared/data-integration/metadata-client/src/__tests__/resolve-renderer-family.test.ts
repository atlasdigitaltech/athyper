import { describe, expect, it } from "vitest";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { resolveRendererFamily } from "../compiled-reader.js";

function makeEntity(overrides: Partial<CompiledEntity> = {}): CompiledEntity {
  return {
    entity_id: "00000000-0000-0000-0000-000000000001",
    entity_code: "test_entity",
    slug: "test-entity",
    entity_name: "Test Entity",
    entity_class: "MASTER",
    table_schema: "master",
    table_name: "test_entity",
    version_no: 1,
    version_hash: "deadbeef",
    fields: [],
    field_groups: [],
    display_config: {},
    feature_flags: {},
    governance_level: "standard",
    security_tier: "standard",
    compiled_at: "2026-04-20T00:00:00.000Z",
    compiled_hash: "deadbeef",
    ...overrides,
  } as unknown as CompiledEntity;
}

describe("resolveRendererFamily", () => {
  it("normalizes explicit detail_renderer values", () => {
    expect(resolveRendererFamily(makeEntity({
      display_config: { detail_renderer: "DOCUMENT" } as unknown as CompiledEntity["display_config"],
    }))).toBe("document");
  });

  it("falls back to document renderer for DOCUMENT entities", () => {
    expect(resolveRendererFamily(makeEntity({
      entity_class: "DOCUMENT",
      display_config: {},
    }))).toBe("document");
  });

  it("falls back to document renderer for legacy document-schema descriptors", () => {
    expect(resolveRendererFamily(makeEntity({
      entity_class: "MASTER",
      table_schema: "document",
      display_config: {},
    }))).toBe("document");
  });

  it("lets explicit master renderer override document-schema fallback", () => {
    expect(resolveRendererFamily(makeEntity({
      entity_class: "DOCUMENT_RELATION",
      table_schema: "document",
      display_config: { detail_renderer: "master" } as unknown as CompiledEntity["display_config"],
    }))).toBe("master");
  });

  it("ignores unknown explicit renderer tokens", () => {
    expect(resolveRendererFamily(makeEntity({
      display_config: { detail_renderer: "document_shell" } as unknown as CompiledEntity["display_config"],
    }))).toBe("master");
  });

  it("uses the canonical v2 catalog before legacy renderer flags", () => {
    expect(resolveRendererFamily(makeEntity({
      entity_class: "MASTER",
      display_config: { detail_renderer: "document" } as unknown as CompiledEntity["display_config"],
      contract_v2: {
        catalog: { entity_class: "LEDGER" },
        surfaces: [],
      } as unknown as CompiledEntity["contract_v2"],
    }))).toBe("ledger");
  });
});
