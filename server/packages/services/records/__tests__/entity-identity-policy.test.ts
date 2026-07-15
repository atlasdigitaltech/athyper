import { describe, expect, it } from "vitest";
import { mergeFieldProvenance, resolveEntityIdentity, validateIdentityTemplate } from "../entity-identity-policy.js";

const identityConfig = {
  naming: {
    field: "name",
    max_length: 255,
    initiate: { kind: "template", template: "New Purchase Order" },
    copy: {
      kind: "template",
      template: "Copy of {source.name}",
      fallback_template: "Copy of {source.code}",
      normalize_copy_prefix: true,
    },
    promote: { kind: "template", template: "Purchase Order {code}", apply_when: "system_managed" },
  },
};

describe("entity identity policy", () => {
  it("names a newly initiated entity", () => {
    expect(resolveEntityIdentity({ identityConfig, context: "initiate", entityLabel: "Purchase Order" }).values)
      .toEqual({ name: "New Purchase Order" });
  });

  it("names a copy and normalizes repeated copy prefixes", () => {
    const result = resolveEntityIdentity({
      identityConfig,
      context: "copy",
      entityLabel: "Purchase Order",
      sourceRecord: { code: "PO-1", name: "Copy of Copy of Office Furniture" },
    });
    expect(result.values).toEqual({ name: "Copy of Office Furniture" });
    expect(result.provenance.name?.system_managed).toBe(false);
  });

  it("falls back to source code when the source name is blank", () => {
    expect(resolveEntityIdentity({
      identityConfig,
      context: "copy",
      entityLabel: "Purchase Order",
      sourceRecord: { code: "PO-1", name: "" },
    }).values).toEqual({ name: "Copy of PO-1" });
  });

  it("promotes only a system-managed name", () => {
    const metadata = mergeFieldProvenance({}, {
      name: { source: "identity_config.naming", context: "initiate", system_managed: true },
    });
    expect(resolveEntityIdentity({
      identityConfig,
      context: "promote",
      entityLabel: "Purchase Order",
      targetRecord: { name: "New Purchase Order", metadata },
      generatedCode: "PO-2026-1",
    }).values).toEqual({ name: "Purchase Order PO-2026-1" });

    expect(resolveEntityIdentity({
      identityConfig,
      context: "promote",
      entityLabel: "Purchase Order",
      targetRecord: { name: "User name", metadata: {} },
      generatedCode: "PO-2026-2",
    }).values).toEqual({});
  });

  it("rejects unknown placeholders", () => {
    expect(validateIdentityTemplate("{source.secret} {code}")).toEqual(["source.secret"]);
  });
});
