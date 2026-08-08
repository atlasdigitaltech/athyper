/**
 * Phase 5.5 — Three-Plane Permission Stack.
 *
 * Pure-function unit tests for the KC sync state machine. The real worker
 * still does the HTTP fan-out; these tests lock the contract that determines
 * which operations the worker must issue.
 */

import { describe, expect, it } from "vitest";

import {
  computeBindingAttributeDelta,
  computeTenantSyncDelta,
  type DbActiveGrant,
  type DbTenantRow,
  type KcOrgRow,
} from "@athyper/svc-iam";

// ──────────────────────────────────────────────────────────────────────────────
// computeTenantSyncDelta
// ──────────────────────────────────────────────────────────────────────────────

function tenant(id: string, name: string, status = "active"): DbTenantRow {
  return { id, name, status, realm_key: "athyper" };
}

function org(alias: string, name: string): KcOrgRow {
  return { alias, name, attributes: {} };
}

describe("computeTenantSyncDelta", () => {
  it("returns empty delta when KC and DB already agree", () => {
    const delta = computeTenantSyncDelta(
      [tenant("t-1", "Acme")],
      [org("t-1", "Acme")],
    );
    expect(delta.toCreate).toHaveLength(0);
    expect(delta.toRename).toHaveLength(0);
    expect(delta.toArchive).toHaveLength(0);
  });

  it("marks a DB-only tenant as toCreate", () => {
    const delta = computeTenantSyncDelta(
      [tenant("t-1", "Acme"), tenant("t-2", "Globex")],
      [org("t-1", "Acme")],
    );
    expect(delta.toCreate.map((t) => t.id)).toEqual(["t-2"]);
    expect(delta.toRename).toHaveLength(0);
    expect(delta.toArchive).toHaveLength(0);
  });

  it("marks a KC-only org as toArchive", () => {
    const delta = computeTenantSyncDelta(
      [tenant("t-1", "Acme")],
      [org("t-1", "Acme"), org("t-stale", "Old Tenant")],
    );
    expect(delta.toArchive).toEqual(["t-stale"]);
  });

  it("marks a renamed tenant as toRename", () => {
    const delta = computeTenantSyncDelta(
      [tenant("t-1", "Acme Holdings")],
      [org("t-1", "Acme")],
    );
    expect(delta.toRename).toEqual([{ alias: "t-1", from: "Acme", to: "Acme Holdings" }]);
  });

  it("ignores inactive tenants — they're not synced AND any matching org is archived", () => {
    const delta = computeTenantSyncDelta(
      [tenant("t-1", "Acme", "inactive")],
      [org("t-1", "Acme")],
    );
    expect(delta.toCreate).toHaveLength(0);
    expect(delta.toArchive).toEqual(["t-1"]);
  });

  it("handles a complex mixed delta", () => {
    const delta = computeTenantSyncDelta(
      [
        tenant("t-1", "Acme"),               // unchanged
        tenant("t-2", "Globex Holdings"),    // rename
        tenant("t-3", "New Co"),             // create
        tenant("t-old", "Old", "inactive"),  // archive
      ],
      [
        org("t-1", "Acme"),
        org("t-2", "Globex"),
        org("t-old", "Old"),
        org("t-orphan", "Orphaned"),         // archive (no DB row at all)
      ],
    );
    expect(delta.toCreate.map((t) => t.id).sort()).toEqual(["t-3"]);
    expect(delta.toRename).toEqual([{ alias: "t-2", from: "Globex", to: "Globex Holdings" }]);
    expect(delta.toArchive.sort()).toEqual(["t-old", "t-orphan"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// computeBindingAttributeDelta
// ──────────────────────────────────────────────────────────────────────────────

function grant(grant_id: string, principal_id: string, status = "active"): DbActiveGrant {
  return { grant_id, principal_id, account_id: "acct-x", status };
}

describe("computeBindingAttributeDelta", () => {
  it("returns no updates when KC and DB already agree", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g1", "p1"), grant("g2", "p1")]],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1", "g2"]],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates).toHaveLength(0);
  });

  it("adds missing grants on the KC side", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g1", "p1"), grant("g2", "p1")]],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1"]],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates).toHaveLength(1);
    expect(delta.updates[0]!.add).toEqual(["g2"]);
    expect(delta.updates[0]!.remove).toEqual([]);
    expect(delta.updates[0]!.final).toEqual(["g1", "g2"]);
  });

  it("removes revoked grants from the KC attribute", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g1", "p1")]],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1", "g2-revoked"]],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates[0]!.remove).toEqual(["g2-revoked"]);
    expect(delta.updates[0]!.final).toEqual(["g1"]);
  });

  it("treats inactive grants as 'not present in DB' (forcing KC removal)", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g1", "p1"), grant("g2-revoked", "p1", "revoked")]],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1", "g2-revoked"]],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates[0]!.remove).toEqual(["g2-revoked"]);
    expect(delta.updates[0]!.final).toEqual(["g1"]);
  });

  it("clears the attribute entirely when DB has no active grants for the user", () => {
    const dbByUser = new Map([
      ["user-a", []],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1", "g2"]],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates[0]!.add).toEqual([]);
    expect(delta.updates[0]!.remove.sort()).toEqual(["g1", "g2"]);
    expect(delta.updates[0]!.final).toEqual([]);
  });

  it("handles users that exist on one side only", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g1", "p1")]],
      ["user-b", [grant("g3", "p2")]],
    ]);
    const kcByUser = new Map([
      ["user-a", ["g1"]],
      ["user-c", ["g4"]], // KC-only — user dropped
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    // user-a unchanged, user-b needs add, user-c needs full clear
    expect(delta.updates).toHaveLength(2);
    const byUser = new Map(delta.updates.map((u) => [u.user_id, u]));
    expect(byUser.get("user-b")?.add).toEqual(["g3"]);
    expect(byUser.get("user-c")?.remove).toEqual(["g4"]);
    expect(byUser.get("user-c")?.final).toEqual([]);
  });

  it("emits sorted output for deterministic worker behavior", () => {
    const dbByUser = new Map([
      ["user-a", [grant("g-z", "p1"), grant("g-a", "p1"), grant("g-m", "p1")]],
    ]);
    const kcByUser = new Map([
      ["user-a", []],
    ]);
    const delta = computeBindingAttributeDelta(dbByUser, kcByUser);
    expect(delta.updates[0]!.add).toEqual(["g-a", "g-m", "g-z"]);
    expect(delta.updates[0]!.final).toEqual(["g-a", "g-m", "g-z"]);
  });
});
