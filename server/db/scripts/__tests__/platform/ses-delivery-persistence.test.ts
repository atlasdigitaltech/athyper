import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const dbRoot = new URL("../../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, dbRoot), "utf8");

describe("SES delivery persistence contract", () => {
  it("installs the forward migration on all three planes", async () => {
    for (const plane of ["studio", "neon", "mesh"]) {
      const manifest = await read(`migrations/manifests/${plane}.txt`);
      assert.match(manifest, /^20260825_ses_delivery_persistence\.sql$/m);
      assert.equal(
        manifest.match(/20260825_ses_delivery_persistence\.sql/g)?.length,
        1,
      );
    }
  });

  it("keeps provider receipts append-only, unique, and payload-redacted", async () => {
    const [tables, triggers, migration] = await Promise.all([
      read("ddl/common/event/03_tables.sql"),
      read("ddl/common/event/08_triggers.sql"),
      read("migrations/20260825_ses_delivery_persistence.sql"),
    ]);
    for (const source of [tables, migration]) {
      assert.match(source, /CREATE TABLE event\.notification_provider_event/);
      assert.match(source, /UNIQUE\s*\(provider_code,provider_event_id\)/);
      assert.match(source, /payload_sha256/);
      assert.match(source, /CHECK\s*\(is_redacted\)/);
      const receipt =
        source.match(
          /CREATE TABLE event\.notification_provider_event([\s\S]*?)\n\);/,
        )?.[1] ?? "";
      assert.doesNotMatch(
        receipt,
        /raw_payload|recipient_addr\s+text|email_address/,
      );
    }
    assert.match(triggers, /notification_provider_event_append_only/);
    assert.match(migration, /notification_provider_event_append_only/);
  });

  it("uses hash-only global and tenant suppression projections", async () => {
    const tables = await read("ddl/common/event/03_tables.sql");
    const indexes = await read("ddl/common/event/06_indexes.sql");
    assert.match(tables, /CREATE TABLE event\.notification_email_suppression/);
    assert.match(tables, /address_hash\s+char\(64\)/);
    assert.doesNotMatch(
      tables,
      /notification_email_suppression[\s\S]{0,1200}(email_address|recipient_addr)/,
    );
    assert.match(indexes, /notification_email_suppression_tenant_active_uq/);
    assert.match(indexes, /notification_email_suppression_global_active_uq/);
  });
});
