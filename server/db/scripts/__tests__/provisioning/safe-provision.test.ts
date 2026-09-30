import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertDestructiveResetAllowed,
  assertPlaneFileBoundary,
  canonicalSourceText,
  registerSeedPack,
  resolveDestructiveResetCliApproval,
  seedPackVersion,
  sha256Source,
  type QueryClient,
} from "../../provisioning/safe-provision.js";

class FakeClient implements QueryClient {
  constructor(private readonly rows: Record<string, unknown>[] = []) {}
  readonly statements: string[] = [];
  async query<Row extends object = Record<string, unknown>>(
    text: string,
  ): Promise<{ rows: Row[]; rowCount: number }> {
    this.statements.push(text);
    if (text.includes("SELECT source_path")) {
      return { rows: this.rows as Row[], rowCount: this.rows.length };
    }
    if (text.includes("current_database()")) {
      return { rows: this.rows as Row[], rowCount: this.rows.length };
    }
    if (text.includes("UPDATE public.database_reset_guard_v2")) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

describe("Wave 6 safe provision contract", () => {
  it("expands the local confirmation shorthand for every plane", () => {
    assert.deepEqual(
      resolveDestructiveResetCliApproval(
        ["--reset", "--confirm", "LOCAL-AUTH-V2-RESET"],
        "neon",
        undefined,
      ),
      {
        plane: "neon",
        expectedDatabase: "athyper_neon",
        acknowledgement: "RESET_NEON",
        disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
        executionProfile: "development_clean_reset",
        approvalLabel: "LOCAL-AUTH-V2-RESET",
        confirmationShorthandUsed: true,
      },
    );
    assert.equal(
      resolveDestructiveResetCliApproval(
        ["--drop-only", "--confirm=LOCAL-AUTH-V2-RESET"],
        "mesh",
        undefined,
      ).expectedDatabase,
      "athyper_mesh",
    );
    assert.equal(
      resolveDestructiveResetCliApproval(
        ["--reset", "--confirm=LOCAL-AUTH-V2-RESET"],
        "studio",
        undefined,
      ).acknowledgement,
      "RESET_STUDIO",
    );
  });

  it("rejects misplaced, invalid, or conflicting confirmation shorthand", () => {
    assert.throws(
      () =>
        resolveDestructiveResetCliApproval(
          ["--status", "--confirm", "LOCAL-AUTH-V2-RESET"],
          "neon",
          undefined,
        ),
      /only with --reset or --drop-only/,
    );
    assert.throws(
      () =>
        resolveDestructiveResetCliApproval(
          ["--reset", "--confirm", "WRONG"],
          "neon",
          undefined,
        ),
      /must equal LOCAL-AUTH-V2-RESET/,
    );
    assert.throws(
      () =>
        resolveDestructiveResetCliApproval(
          [
            "--reset",
            "--confirm",
            "LOCAL-AUTH-V2-RESET",
            "--expected-database=another_database",
          ],
          "neon",
          undefined,
        ),
      /conflicts/,
    );
  });

  it("normalizes line endings and hashes source deterministically", () => {
    assert.equal(canonicalSourceText("\uFEFFa\r\nb\r"), "a\nb\n");
    assert.equal(sha256Source("a\r\nb"), sha256Source("a\nb"));
    assert.match(sha256Source("a\nb"), /^[0-9a-f]{64}$/);
    assert.equal(
      seedPackVersion("-- seed-pack-version: 2.1.0\nSELECT 1"),
      "2.1.0",
    );
  });

  it("rejects opposite-plane discovery", () => {
    assert.throws(
      () =>
        assertPlaneFileBoundary("neon", [
          "ddl/planes/neon/master/03_tables.sql",
          "seed/tenants/mesh/001.sql",
        ]),
      /opposite-plane/,
    );
    assert.throws(
      () =>
        assertPlaneFileBoundary("mesh", [
          "ddl/planes/mesh/mesh/03_tables.sql",
          "ddl/planes/neon/control/03_tables.sql",
        ]),
      /opposite-plane/,
    );
  });

  it("fails destructive reset without every marker and exact DB identity", async () => {
    const client = new FakeClient([
      {
        database_name: "athyper_neon",
        guard_database_name: "athyper_neon",
        environment_class: "disposable_local",
        approval_label: "LOCAL-AUTH-V2-RESET",
        destructive_reset_allowed: true,
        schema_fingerprint_sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        opposite_schema_count: 0,
      },
    ]);
    await assert.rejects(
      assertDestructiveResetAllowed(client, {
        plane: "neon",
        expectedDatabase: "athyper_neon",
        acknowledgement: "wrong",
        disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
        executionProfile: "development_clean_reset",
        approvalLabel: "LOCAL-AUTH-V2-RESET",
      }),
      /destructive reset requires/,
    );
    await assert.doesNotReject(
      assertDestructiveResetAllowed(client, {
        plane: "neon",
        expectedDatabase: "athyper_neon",
        acknowledgement: "RESET_NEON",
        disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
        executionProfile: "development_clean_reset",
        approvalLabel: "LOCAL-AUTH-V2-RESET",
      }),
    );
  });

  it("does not let the local profile claim another environment or approval", async () => {
    const client = new FakeClient([
      {
        database_name: "athyper_neon",
        guard_database_name: "athyper_neon",
        environment_class: "disposable_ci",
        approval_label: "LOCAL-AUTH-V2-RESET",
        destructive_reset_allowed: true,
        schema_fingerprint_sha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        opposite_schema_count: 0,
      },
    ]);
    await assert.rejects(
      assertDestructiveResetAllowed(client, {
        plane: "neon",
        expectedDatabase: "athyper_neon",
        acknowledgement: "RESET_NEON",
        disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
        executionProfile: "development_clean_reset",
        approvalLabel: "LOCAL-AUTH-V2-RESET",
      }),
      /identity\/marker mismatch/,
    );
    await assert.rejects(
      assertDestructiveResetAllowed(client, {
        plane: "neon",
        expectedDatabase: "athyper_neon",
        acknowledgement: "RESET_NEON",
        disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
        executionProfile: "development_clean_reset",
        approvalLabel: "WRONG",
      }),
      /destructive reset requires/,
    );
  });

  it("refreshes a stale fingerprint only for confirmed disposable-local reset", async () => {
    const client = new FakeClient([
      {
        database_name: "athyper_neon",
        guard_database_name: "athyper_neon",
        environment_class: "disposable_local",
        approval_label: "LOCAL-AUTH-V2-RESET",
        destructive_reset_allowed: true,
        schema_fingerprint_sha256: "a".repeat(64),
        opposite_schema_count: 0,
      },
    ]);
    const approval = {
      plane: "neon" as const,
      expectedDatabase: "athyper_neon",
      acknowledgement: "RESET_NEON",
      disposableEnvironmentMarker: "I_UNDERSTAND_DATA_WILL_BE_DESTROYED",
      executionProfile: "development_clean_reset",
      approvalLabel: "LOCAL-AUTH-V2-RESET",
    };

    await assert.rejects(
      assertDestructiveResetAllowed(client, approval),
      /identity\/marker mismatch/,
    );
    await assert.doesNotReject(
      assertDestructiveResetAllowed(client, {
        ...approval,
        refreshDisposableFingerprint: true,
      }),
    );
    assert.equal(
      client.statements.some((statement) =>
        statement.includes("UPDATE public.database_reset_guard_v2"),
      ),
      true,
    );
  });

  it("rejects immutable seed-version content drift", async () => {
    const client = new FakeClient([
      {
        source_path: "seed/a.sql",
        content_sha256: "a".repeat(64),
        manifest_sha256: "b".repeat(64),
      },
    ]);
    await assert.rejects(
      registerSeedPack(client, {
        plane: "neon",
        packKey: "seed/a",
        packVersion: "v1",
        sourcePath: "seed/a.sql",
        contentSha256: "c".repeat(64),
        manifestSha256: "b".repeat(64),
      }),
      /immutable seed pack content drift/,
    );
  });
});
