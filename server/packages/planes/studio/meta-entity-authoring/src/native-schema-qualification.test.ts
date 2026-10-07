import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeRetiredColumns } from "@athyper/server-contract-meta-entity-authoring";

import {
  inspectCanonicalNativeSchema,
  nativeSchemaTables,
  nativeSchemaBlockers,
  nativeSchemaFingerprint,
  qualifyCanonicalNativeSchema,
  withCanonicalNativeSchemaQualification,
  type NativeSchemaInspection,
} from "./native-schema-qualification.js";
import type { NativeConversionApplicationPolicy } from "./native-conversion-application.js";

/** Synthetic inventory tests the comparator, not canonical DDL or human review. */
function fixture() {
  const evidence: NativeSchemaInspection = {
    database: "synthetic_studio",
    executionRole: "synthetic_writer",
    applicationRole: "synthetic_writer",
    role: { superuser: false, bypassRls: false, inheritedAdmin: false },
    tables: nativeSchemaTables.map((name) => ({
      name,
      present: true,
      owner: "synthetic_owner",
      rls: true,
      forced: true,
      privileges: null,
      columns: [],
      constraints: [],
      indexes: [],
      triggers: [],
      policies: [],
    })),
    domains: [],
    guards: [
      "metadata.fn_assert_native_authoring_contract(uuid,text)",
      "metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)",
      "metadata.fn_assert_native_typed_rows(uuid,integer)",
    ].map((signature) => ({
      signature,
      definition: "synthetic reviewed definition",
      privileges: null,
      owner: "synthetic_owner",
    })),
  };
  const installed = {
    database: evidence.database,
    applicationRole: evidence.applicationRole,
    schemaHash: nativeSchemaFingerprint(evidence),
  };
  const queries: string[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async (text: string) => {
            queries.push(text);
            return {
              rows: text.includes("AS evidence")
                ? [{ evidence: structuredClone(evidence) }]
                : [],
              rowCount: 0,
              command: "SELECT",
            };
          },
          release: () => {},
        }),
        end: async () => {},
      } as never,
    }),
  });
  return { evidence, installed, queries, db };
}

it("compares the exact installed inventory in the existing transaction with no DDL or grants", async () => {
  const f = fixture();
  try {
    await f.db.transaction().execute(async (tx) => {
      expect(
        await inspectCanonicalNativeSchema(tx, f.evidence.applicationRole),
      ).toEqual(f.evidence);
      await qualifyCanonicalNativeSchema(tx, f.installed);
    });
    expect(f.queries.filter((q) => q.includes("AS evidence"))).toHaveLength(3);
    expect(
      f.queries.some((q) =>
        /^(ALTER|CREATE|GRANT|UPDATE|INSERT|DELETE)\b/i.test(q.trim()),
      ),
    ).toBe(false);
  } finally {
    await f.db.destroy();
  }
});

it.each([
  [
    "pending cutover",
    (e: NativeSchemaInspection) =>
      e.tables[0]!.constraints.push({
        name: "root_native_pending_ck",
        definition: "CHECK (false)",
        validated: true,
      }),
  ],
  [
    "missing table",
    (e: NativeSchemaInspection) => {
      e.tables[0]!.present = false;
    },
  ],
  [
    "missing inventory entry",
    (e: NativeSchemaInspection) => {
      e.tables.pop();
    },
  ],
  [
    "RLS disabled",
    (e: NativeSchemaInspection) => {
      e.tables[0]!.rls = false;
    },
  ],
  [
    "FORCE RLS disabled",
    (e: NativeSchemaInspection) => {
      e.tables[0]!.forced = false;
    },
  ],
  [
    "unvalidated constraint",
    (e: NativeSchemaInspection) =>
      e.tables[0]!.constraints.push({
        name: "test_fk",
        definition: "FOREIGN KEY",
        validated: false,
      }),
  ],
  [
    "disabled ownership trigger",
    (e: NativeSchemaInspection) =>
      e.tables[0]!.triggers.push({
        name: "test_guard",
        enabled: "D",
        definition: "guard",
        function: "function",
      }),
  ],
  [
    "superuser application role",
    (e: NativeSchemaInspection) => {
      e.role!.superuser = true;
    },
  ],
  [
    "bypass RLS application role",
    (e: NativeSchemaInspection) => {
      e.role!.bypassRls = true;
    },
  ],
  [
    "inherited admin",
    (e: NativeSchemaInspection) => {
      e.role!.inheritedAdmin = true;
    },
  ],
  [
    "missing role",
    (e: NativeSchemaInspection) => {
      e.role = null;
    },
  ],
  [
    "missing native guard",
    (e: NativeSchemaInspection) => {
      e.guards[0]!.definition = null;
    },
  ],
  [
    "missing guard inventory",
    (e: NativeSchemaInspection) => {
      e.guards = [];
    },
  ],
  [
    "legacy NOT NULL coupling",
    (e: NativeSchemaInspection) =>
      e.tables
        .find((t) => t.name === "metadata.entity_field")!
        .columns.push({
          name: "type_config",
          type: "jsonb",
          nullable: false,
          default: null,
        }),
  ],
] as const)(
  "rejects %s even when the captured hash matches",
  async (_name, mutate) => {
    const f = fixture();
    try {
      mutate(f.evidence);
      expect(nativeSchemaBlockers(f.evidence).length).toBeGreaterThan(0);
      await expect(
        f.db.transaction().execute((tx) =>
          qualifyCanonicalNativeSchema(tx, {
            ...f.installed,
            schemaHash: nativeSchemaFingerprint(f.evidence),
          }),
        ),
      ).rejects.toMatchObject({ code: "NATIVE_SCHEMA_NOT_READY" });
    } finally {
      await f.db.destroy();
    }
  },
);

it.each([
  "columns",
  "constraints",
  "indexes",
  "policies",
  "triggers",
  "privileges",
] as const)("rejects post-review %s drift", async (branch) => {
  const f = fixture();
  try {
    Reflect.set(
      f.evidence.tables[0]!,
      branch,
      branch === "privileges"
        ? ["changed"]
        : [
            {
              changed: true,
              name: "changed",
              validated: true,
              enabled: "O",
              valid: true,
              ready: true,
            },
          ],
    );
    await expect(
      f.db
        .transaction()
        .execute((tx) => qualifyCanonicalNativeSchema(tx, f.installed)),
    ).rejects.toMatchObject({
      code: "NATIVE_SCHEMA_REVIEWED_INVENTORY_MISMATCH",
    });
  } finally {
    await f.db.destroy();
  }
});

it("keeps independent authority admission after schema verification and fails before it on schema drift", async () => {
  const f = fixture(),
    qualify = vi.fn(async () => {
      throw Error("owner evidence missing");
    });
  const original = { qualify } as unknown as NativeConversionApplicationPolicy;
  const policy = withCanonicalNativeSchemaQualification(original, f.installed);
  const input = {
    actorId: "a",
    entityId: "b",
    changeSetId: "c",
    tenantId: null,
    expectedRevision: 1,
    expectedSourceHash: "d",
    idempotencyKey: "e",
  };
  try {
    await expect(
      f.db.transaction().execute((tx) => policy.qualify(tx, input)),
    ).rejects.toThrow("owner evidence missing");
    expect(qualify).toHaveBeenCalledTimes(1);
    f.evidence.guards[0]!.definition = "changed";
    await expect(
      f.db.transaction().execute((tx) => policy.qualify(tx, input)),
    ).rejects.toMatchObject({
      code: "NATIVE_SCHEMA_REVIEWED_INVENTORY_MISMATCH",
    });
    expect(qualify).toHaveBeenCalledTimes(1);
    expect(input.expectedRevision).toBe(1);
  } finally {
    await f.db.destroy();
  }
});

it("rejects a different database, missing installed evidence and untrusted role names", async () => {
  const f = fixture();
  try {
    await expect(
      f.db.transaction().execute((tx) =>
        qualifyCanonicalNativeSchema(tx, {
          ...f.installed,
          database: "another",
        }),
      ),
    ).rejects.toMatchObject({ code: "NATIVE_SCHEMA_DATABASE_MISMATCH" });
    await expect(
      f.db
        .transaction()
        .execute((tx) =>
          qualifyCanonicalNativeSchema(tx, { ...f.installed, schemaHash: "" }),
        ),
    ).rejects.toMatchObject({
      code: "NATIVE_SCHEMA_INSTALLED_EVIDENCE_REQUIRED",
    });
    await expect(
      f.db
        .transaction()
        .execute((tx) =>
          inspectCanonicalNativeSchema(tx, "writer'; DROP SCHEMA metadata;--"),
        ),
    ).rejects.toMatchObject({ code: "NATIVE_SCHEMA_ROLE_INVALID" });
  } finally {
    await f.db.destroy();
  }
});

it("does not qualify a superuser inspection transaction as an application-role writer", async () => {
  const f = fixture();
  try {
    const hash = f.installed.schemaHash;
    f.evidence.executionRole = "postgres";
    expect(nativeSchemaFingerprint(f.evidence)).toBe(hash);
    await expect(
      f.db
        .transaction()
        .execute((tx) => qualifyCanonicalNativeSchema(tx, f.installed)),
    ).rejects.toMatchObject({ code: "NATIVE_SCHEMA_EXECUTION_ROLE_MISMATCH" });
  } finally {
    await f.db.destroy();
  }
});

it.each(
  Object.entries(nativeRetiredColumns).flatMap(([table, columns]) =>
    columns.map((column) => [table, column] as const),
  ),
)(
  "rejects required retired column %s.%s using the conversion writer's inventory",
  async (table, column) => {
    const f = fixture();
    try {
      f.evidence.tables
        .find((t) => t.name === `metadata.${table}`)!
        .columns.push({
          name: column,
          type: "text",
          nullable: false,
          default: null,
        });
      expect(nativeSchemaBlockers(f.evidence)).toContain(
        `NATIVE_SCHEMA_LEGACY_REQUIRED:metadata.${table}.${column}`,
      );
      await expect(
        f.db.transaction().execute((tx) =>
          qualifyCanonicalNativeSchema(tx, {
            ...f.installed,
            schemaHash: nativeSchemaFingerprint(f.evidence),
          }),
        ),
      ).rejects.toMatchObject({ code: "NATIVE_SCHEMA_NOT_READY" });
    } finally {
      await f.db.destroy();
    }
  },
);
