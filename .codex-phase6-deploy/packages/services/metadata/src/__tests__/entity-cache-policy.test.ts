import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  auditEntityListCachePolicy,
  resolveEntityListCachePolicy,
} from "@athyper/api-contracts/entity-cache-policy";

const classProfileSeedPath = fileURLToPath(new URL(
  "../../../../../db/seed/platform/003_control/010_control_entity_class_profile_contract.sql",
  import.meta.url,
));

describe("entity list cache-policy resolution", () => {
  it("uses platform defaults when neither metadata layer specifies a policy", () => {
    expect(resolveEntityListCachePolicy({ mutable: true })).toMatchObject({
      source: "platform",
      fresh_for_seconds: 20,
      retain_for_seconds: 300,
      invalidate_on_mutation: true,
    });
  });

  it("applies exact entity-class values over platform defaults", () => {
    expect(resolveEntityListCachePolicy({
      mutable: true,
      entityClassPolicy: {
        fresh_for_seconds: 120,
        retain_for_seconds: 900,
        prefetch: "viewport",
      },
    })).toMatchObject({
      source: "entity_class",
      fresh_for_seconds: 120,
      retain_for_seconds: 900,
      prefetch: "viewport",
    });
  });

  it("applies entity values over entity-class values", () => {
    expect(resolveEntityListCachePolicy({
      mutable: true,
      entityClassPolicy: {
        fresh_for_seconds: 120,
        retain_for_seconds: 900,
        prefetch: "viewport",
      },
      entityPolicy: {
        fresh_for_seconds: 10,
        prefetch: "intent",
      },
    })).toMatchObject({
      source: "entity",
      fresh_for_seconds: 10,
      retain_for_seconds: 900,
      prefetch: "intent",
    });
  });

  it("applies tenant values over the resolved entity policy", () => {
    expect(resolveEntityListCachePolicy({
      mutable: true,
      entityClassPolicy: {
        fresh_for_seconds: 120,
        retain_for_seconds: 900,
      },
      entityPolicy: {
        fresh_for_seconds: 60,
      },
      tenantPolicy: {
        fresh_for_seconds: 15,
        retain_for_seconds: 180,
      },
    })).toMatchObject({
      source: "tenant",
      fresh_for_seconds: 15,
      retain_for_seconds: 180,
    });
  });
});

describe("entity list cache-policy audit", () => {
  it.each([
    {
      name: "negative TTL",
      input: { mutable: false, entityPolicy: { fresh_for_seconds: -1 } },
      code: "CACHE_POLICY_NEGATIVE_TTL",
    },
    {
      name: "retention shorter than freshness",
      input: { mutable: false, entityPolicy: { fresh_for_seconds: 60, retain_for_seconds: 10 } },
      code: "CACHE_POLICY_RETENTION_TOO_SHORT",
    },
    {
      name: "persistent storage for restricted data",
      input: { mutable: false, dataClassification: "restricted", entityPolicy: { storage: "persistent" } },
      code: "CACHE_POLICY_RESTRICTED_PERSISTENCE",
    },
    {
      name: "eager prefetch without class permission",
      input: { mutable: false, entityPolicy: { prefetch: "eager" } },
      code: "CACHE_POLICY_EAGER_PREFETCH_FORBIDDEN",
    },
    {
      name: "missing mutation invalidation",
      input: { mutable: true, entityPolicy: { invalidate_on_mutation: false } },
      code: "CACHE_POLICY_MUTATION_INVALIDATION_REQUIRED",
    },
  ])("rejects $name", ({ input, code }) => {
    expect(auditEntityListCachePolicy(input)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it("allows eager prefetch only when the exact class policy opts in", () => {
    expect(auditEntityListCachePolicy({
      mutable: false,
      entityClassPolicy: { eager_prefetch_allowed: true },
      entityPolicy: { prefetch: "eager" },
    })).toEqual([]);
  });
});

describe("entity-class cache-policy seed", () => {
  it("seeds typed class defaults without entity-name policy inference", () => {
    const source = readFileSync(classProfileSeedPath, "utf8");

    expect(source).toContain("SET cache_policy = CASE class_key");
    expect(source).toContain("WHEN 'DOCUMENT'");
    expect(source).toContain("WHEN 'REFERENCE'");
    expect(source).toContain('"invalidate_on_mutation":true');
    expect(source).toContain('"eager_prefetch_allowed":false');
    expect(source).not.toContain("journal_entry");
    expect(source).not.toContain("purchase_invoice");
  });
});
