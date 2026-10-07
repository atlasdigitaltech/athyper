import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
const id = "00000000-0000-4000-8000-000000000001";
const labels = {
  supportedLocales: ["en"],
  maxCommands: 10,
  maxBatchBytes: 10000,
};
const references = {
  maxCommands: 10,
  maxBatchBytes: 10000,
  maxMembers: 10,
  maxPredicateDepth: 4,
};
it.each(["label", "reference"] as const)(
  "requires current product admission before %s writes or replay",
  async (kind) => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (q: unknown) => {
        const text = typeof q === "string" ? q : (q as { text: string }).text;
        statements.push(text);
        return {
          rows: text.includes("to_jsonb(cs)")
            ? [
                {
                  source: {
                    entity_id: id,
                    tenant_id: null,
                    native_core_layout_version: null,
                  },
                },
              ]
            : [],
          rowCount: 0,
        };
      }),
      release: vi.fn(),
    };
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: { connect: async () => client, end: async () => {} } as never,
      }),
    });
    const input = { changeSetId: id, actorId: id, tenantId: null, batch: {} };
    const call = (r: KyselyMetaEntityAuthoringRepository) =>
      kind === "label"
        ? r.executeLabelCommands(input)
        : r.executeReferenceCommands(input);
    try {
      await expect(
        call(
          new KyselyMetaEntityAuthoringRepository(
            db,
            undefined,
            labels,
            references,
          ),
        ),
      ).rejects.toMatchObject({ code: "PRODUCT_AUTHORING_AUTHORITY_REQUIRED" });
      await expect(
        new KyselyMetaEntityAuthoringRepository(
          db,
          undefined,
          labels,
        ).executeLegacyLabelEnrollment({
          changeSetId: id,
          actorId: id,
          tenantId: null,
          proposal: {
            sourceHash: "0".repeat(64),
            revision: 1,
            idempotencyKey: "bootstrap-denied-0001",
            defaultLocale: "en",
            requiredLocales: ["en"],
          },
        }),
      ).rejects.toMatchObject({ code: "PRODUCT_AUTHORING_AUTHORITY_REQUIRED" });
      const admit = vi.fn(async () => {
        throw Error("GOVERNANCE_REVOKED");
      });
      const host = { admit } as unknown as NativeAuthoringPolicy;
      const repo = new KyselyMetaEntityAuthoringRepository(
        db,
        undefined,
        labels,
        references,
        host,
      );
      await expect(call(repo)).rejects.toThrow("GOVERNANCE_REVOKED");
      await expect(call(repo)).rejects.toThrow("GOVERNANCE_REVOKED");
      const missingScope = {
        ...input,
        tenantId: undefined,
      } as unknown as typeof input;
      await expect(
        kind === "label"
          ? repo.executeLabelCommands(missingScope)
          : repo.executeReferenceCommands(missingScope),
      ).rejects.toMatchObject({ code: "AUTHORING_DRAFT_NOT_FOUND" });
      expect(admit).toHaveBeenCalledTimes(2);
      expect(admit).toHaveBeenCalledWith(
        expect.anything(),
        { ...input, entityId: id },
        "write",
      );
      expect(
        statements.some((s) =>
          /INSERT INTO|UPDATE metadata|DELETE FROM|command_receipt/.test(s),
        ),
      ).toBe(false);
    } finally {
      await db.destroy();
    }
  },
);
