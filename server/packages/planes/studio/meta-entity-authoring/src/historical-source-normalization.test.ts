import { Kysely, PostgresDialect } from "kysely";
import {
  KyselyMetaEntityAuthoringRepository,
  type HistoricalSourceNormalizationPolicy,
} from "./kysely-authoring-repository.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  OwnedLabelGraph,
  ReferenceFieldIdentity,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { sha256, canonicalJson } from "./deterministic.js";
import {
  prepareHistoricalSourceNormalization,
  type HistoricalSourceNormalizationInput,
} from "./historical-source-normalization.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(
  name = "country",
  plane: "studio" | "neon" | "mesh" = "studio",
) {
  const document = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/entities/common/reference/" +
          name +
          "/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const source = compileSharedReferenceProduct(
    parseSharedReferenceProduct(document),
    plane,
  ).graph;
  const refs = new Map<string, string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.labelKey === "string" && typeof o.defaultText === "string") {
      if (refs.has(o.labelKey) && refs.get(o.labelKey) !== o.defaultText)
        throw Error("Conflicting fixture label");
      refs.set(o.labelKey, o.defaultText);
    }
    Object.values(o).forEach(visit);
  };
  visit(source);
  const labels: OwnedLabelGraph = {
    contract: "entity.authoring-owned-labels/1",
    entityId: id(1),
    changeSetId: id(2),
    tenantId: null,
    defaultLocale: "en",
    requiredLocales: ["en"],
    labels: [...refs].map(([labelKey, defaultText], i) => ({
      id: id(100 + i),
      labelKey,
      defaultText,
      sourceKind: "owned",
      sharedLabelKey: null,
      sharedResourceKey: null,
      sharedResourceVersion: null,
      sharedResourceHash: null,
    })),
    translations: [],
  };
  const identities: ReferenceFieldIdentity[] = source.fields.map((f, i) => ({
    id: id(1000 + i),
    entityId: id(1),
    tenantId: null,
    fieldKey: f.fieldKey,
    parentIdentityId: null,
    identityStatus: "reserved",
    introducedChangeSetId: id(2),
    firstReleaseId: null,
    retiredAt: null,
    retiredBy: null,
    retirementReleaseId: null,
    replacementIdentityId: null,
    createdAt: "2026-10-07T00:00:00.000Z",
    createdBy: id(3),
  }));
  const input: HistoricalSourceNormalizationInput = {
    sourceHash: sha256(source),
    revision: 7,
    sourceKind: "product",
    context: {
      entityId: id(1),
      changeSetId: id(2),
      tenantId: null,
      supportedLocales: ["en"],
    },
    labels,
    identities,
    maximumBytes: 1000000,
  };
  return { source, input };
}
describe("legacy source enrollment preparation", () => {
  it.each(["country", "state_region"])(
    "retains the actual whole %s source across all declared planes",
    (name) => {
      for (const plane of ["studio", "neon", "mesh"] as const) {
        const { source, input } = fixture(name, plane);
        const before = canonicalJson(source);
        const proof = prepareHistoricalSourceNormalization(source, input);
        expect(canonicalJson(source)).toBe(before);
        expect(proof.candidate.contractSchema).toBe(
          "athyper.meta-entity-contract/2.3",
        );
        const {
          ownedLabels: _,
          fieldIdentities: __,
          referenceMembers: ___,
          ...retained
        } = proof.candidate;
        expect({ ...retained, contractSchema: source.contractSchema }).toEqual(
          source,
        );
        expect(proof.fieldBindings).toHaveLength(source.fields.length);
        expect(proof.targetHash).toBe(sha256(proof.candidate));
        expect(proof.qualification).toBe("not-established");
      }
    },
  );
  it("preserves previously enrolled labels in 2.2 history", () => {
    const { source, input } = fixture();
    const labelled = {
      ...source,
      ownedLabels: input.labels,
      contractSchema: "athyper.meta-entity-contract/2.2" as const,
    };
    expect(
      prepareHistoricalSourceNormalization(labelled, {
        ...input,
        sourceHash: sha256(labelled),
      }).candidate.ownedLabels,
    ).toEqual(input.labels);
    const changed = structuredClone(input);
    Reflect.set(changed.labels.labels[0]!, "defaultText", "Changed");
    expect(() =>
      prepareHistoricalSourceNormalization(labelled, {
        ...changed,
        sourceHash: sha256(labelled),
      }),
    ).toThrow("LEGACY_ENROLLMENT_LABEL_CHANGED");
  });
  it("rejects missing labels, wrong fallbacks and identity provenance", () => {
    for (const alter of [
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.labels, "labels", []),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.labels.labels[0]!, "defaultText", "Changed"),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.identities[0]!, "entityId", id(9)),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.identities[0]!, "introducedChangeSetId", id(9)),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i, "identities", i.identities.slice(1)),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.identities[0]!, "identityStatus", "retired"),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.identities[0]!, "firstReleaseId", id(10)),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i.identities[0]!, "identityStatus", "active"),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i, "sourceKind", "tenant_entity"),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i, "maximumBytes", 1),
      (i: HistoricalSourceNormalizationInput) =>
        Reflect.set(i, "sourceHash", "a".repeat(64)),
    ]) {
      const f = fixture();
      alter(f.input);
      expect(() =>
        prepareHistoricalSourceNormalization(f.source, f.input),
      ).toThrow();
    }
  });
  it("never adopts existing reference enrollment or an unsupported source version", () => {
    const f = fixture();
    const proof = prepareHistoricalSourceNormalization(f.source, f.input);
    expect(() =>
      prepareHistoricalSourceNormalization(proof.candidate, {
        ...f.input,
        sourceHash: proof.targetHash,
      }),
    ).toThrow("LEGACY_ENROLLMENT_VERSION_UNSUPPORTED");
  });
});

describe("shared repository enrollment proposal", () => {
  const request = (sourceHash: string) => ({
    entityId: id(1),
    changeSetId: id(2),
    tenantId: null,
    actorId: id(3),
    expectedRevision: 7,
    expectedSourceHash: sourceHash,
  });
  it("requires an installed resolver before querying the database", async () => {
    const db = {} as Kysely<Record<string, never>>;
    await expect(
      new KyselyMetaEntityAuthoringRepository(
        db,
      ).prepareHistoricalNormalization(request("a".repeat(64))),
    ).rejects.toMatchObject({ code: "LEGACY_ENROLLMENT_HOST_NOT_CONFIGURED" });
  });
  it("uses current admission and the exact scoped locked source without member DML", async () => {
    const f = fixture();
    const query = vi.fn(async (_text: string, _values: unknown[]) => ({
      rows: [
        {
          source: {
            lock_version: "7",
            native_core_layout_version: null,
            reference_contract_version: null,
          },
        },
      ],
    }));
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({ query, release() {} }),
          end: async () => {},
        } as never,
      }),
    });
    Object.defineProperty(db, "isTransaction", { value: true });
    const admit = vi.fn(async () => {});
    const policy: HistoricalSourceNormalizationPolicy = {
      host: { admit } as unknown as NativeAuthoringPolicy,
      resolve: vi.fn(async () => f.input),
    };
    const spy = vi
      .spyOn(
        KyselyMetaEntityAuthoringRepository.prototype as unknown as {
          loadGraphParts(): Promise<MetaEntityGraph>;
        },
        "loadGraphParts",
      )
      .mockResolvedValue(f.source);
    const repo = new KyselyMetaEntityAuthoringRepository(
      db,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      policy,
    );
    try {
      const proof = await repo.prepareHistoricalNormalization(
        request(f.input.sourceHash),
      );
      expect(proof.candidate.contractSchema).toBe(
        "athyper.meta-entity-contract/2.3",
      );
      expect(admit).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ actorId: id(3), batch: null }),
        "read",
      );
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]![0]).toContain("FOR SHARE");
      expect(query.mock.calls[0]![1]).toEqual([id(2), id(1), null]);
      expect(proof.qualification).toBe("not-established");
      query.mockResolvedValueOnce({
        rows: [
          {
            source: {
              lock_version: "8",
              native_core_layout_version: null,
              reference_contract_version: null,
            },
          },
        ],
      });
      await expect(
        repo.prepareHistoricalNormalization(request(f.input.sourceHash)),
      ).rejects.toThrow("Stale enrollment");
      policy.resolve = vi.fn(async () => ({ ...f.input, revision: 6 }));
      await expect(
        repo.prepareHistoricalNormalization(request(f.input.sourceHash)),
      ).rejects.toMatchObject({ code: "LEGACY_ENROLLMENT_SOURCE_MISMATCH" });
      admit.mockRejectedValueOnce(Error("Admission revoked"));
      await expect(
        repo.prepareHistoricalNormalization(request(f.input.sourceHash)),
      ).rejects.toThrow("Admission revoked");
      expect(query).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
      await db.destroy();
    }
  });
});
