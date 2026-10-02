import assert from "node:assert/strict";
import { test } from "node:test";
import { bannedTokens } from "./publication-tokens.mjs";

test("generic manifest names do not ban unrelated documentation; customer paths remain banned", () => {
  const customerPath = "customer/example/source-manifest.json";
  for (const target of ["internal", "external"]) {
    const tokens = bannedTokens(
      [customerPath, "customer/example/private-evidence.json"],
      target,
    );
    assert.ok(!tokens.includes("source-manifest.json"));
    assert.ok(tokens.includes(customerPath));
    assert.ok(tokens.includes("private-evidence.json"));
    assert.ok(
      !tokens.some((token) =>
        "The build writes source-manifest.json".includes(token),
      ),
    );
    assert.ok(
      tokens.some((token) =>
        `Download /assets/${customerPath}`.includes(token),
      ),
    );
  }
});

test("external output retains internal-only and DDL exclusions", () => {
  const tokens = bannedTokens(
    ["architecture/internal/private-design.md"],
    "external",
  );
  assert.ok(tokens.includes("private-design"));
  assert.ok(tokens.includes("architecture/internal/private-design.md"));
  assert.ok(tokens.includes("server/db/ddl"));
});
