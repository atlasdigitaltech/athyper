import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { analyzeServerRebuild } from "./verify-server-rebuild-boundaries.mjs";

function write(root, path, value) {
  const target = join(root, ...path.split("/"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "athyper-server-boundary-"));
  write(root, ".dockerignore", "server-backup\n");
  write(root, "pnpm-workspace.yaml", "packages:\n  - server/apps/*\n  - server/packages/*\n  - server/packages/contracts/*\n");
  write(root, "server/package.json", { name: "@athyper/server-workspace", private: true, scripts: { test: "node --test" }, devDependencies: { typescript: "1" } });
  write(root, "server/apps/platform-host/package.json", { name: "@athyper/server-platform-host", private: true, dependencies: { "@athyper/server-contract-foo": "workspace:*" } });
  write(root, "server/apps/platform-host/src/index.ts", 'import type { Foo } from "@athyper/server-contract-foo"; export type HostFoo = Foo;\n');
  write(root, "server/packages/foundation/package.json", { name: "@athyper/server-foundation", private: true, exports: { ".": "./src/index.ts" }, devDependencies: { typescript: "1" } });
  write(root, "server/packages/foundation/src/index.ts", "export type FoundationId = string;\n");
  write(root, "server/packages/contracts/foo/package.json", { name: "@athyper/server-contract-foo", private: true, exports: { ".": "./src/index.ts" } });
  write(root, "server/packages/contracts/foo/src/index.ts", "export interface Foo { id: string }\n");
  write(root, "server/architecture/contract-ownership.json", { schemaVersion: 1, domains: { foo: "@athyper/server-contract-foo" }, duplicateSymbolAllowlist: [] });
  return root;
}

function violation(mutator, code) {
  const root = fixture();
  try {
    mutator(root);
    const result = analyzeServerRebuild(root);
    assert.ok(result.violations.some((item) => item.code === code), JSON.stringify(result.violations));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("accepts the canonical fixture", () => {
  const root = fixture();
  try { assert.deepEqual(analyzeServerRebuild(root).violations, []); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects every protected boundary class", async (suite) => {
  await suite.test("package naming", () => violation((root) => write(root, "server/packages/contracts/foo/package.json", { name: "@athyper/foo", private: true }), "PACKAGE_NAME"));
  await suite.test("kernel imports", () => violation((root) => write(root, "server/packages/contracts/foo/src/index.ts", 'export * from "./kernel/index.js";'), "KERNEL"));
  await suite.test("cross-package relative imports", () => violation((root) => write(root, "server/apps/platform-host/src/index.ts", 'export * from "../../../packages/contracts/foo/src/index.js";'), "CROSS_PACKAGE_RELATIVE"));
  await suite.test("unexported deep imports", () => violation((root) => write(root, "server/apps/platform-host/src/index.ts", 'import type { Foo } from "@athyper/server-contract-foo/internal"; export type X = Foo;'), "DEEP_IMPORT"));
  await suite.test("host direction", () => violation((root) => {
    write(root, "server/packages/contracts/foo/package.json", { name: "@athyper/server-contract-foo", private: true, exports: { ".": "./src/index.ts" }, dependencies: { "@athyper/server-platform-host": "workspace:*" } });
    write(root, "server/packages/contracts/foo/src/index.ts", 'export type { HostFoo } from "@athyper/server-platform-host";');
  }, "HOST_DIRECTION"));
  await suite.test("Foundation isolation", () => violation((root) => {
    write(root, "server/packages/foundation/package.json", { name: "@athyper/server-foundation", private: true, exports: { ".": "./src/index.ts" }, dependencies: { "@athyper/server-contract-foo": "workspace:*" } });
    write(root, "server/packages/foundation/src/index.ts", 'export type { Foo } from "@athyper/server-contract-foo";');
  }, "FOUNDATION_ISOLATION"));
  await suite.test("undeclared dependencies", () => violation((root) => write(root, "server/apps/platform-host/src/index.ts", 'import "left-pad";'), "UNDECLARED_DEPENDENCY"));
  await suite.test("contract ownership", () => violation((root) => write(root, "server/architecture/contract-ownership.json", { schemaVersion: 1, domains: {}, duplicateSymbolAllowlist: [] }), "CONTRACT_OWNERSHIP"));
  await suite.test("duplicate contract symbols", () => violation((root) => {
    write(root, "server/packages/contracts/bar/package.json", { name: "@athyper/server-contract-bar", private: true, exports: { ".": "./src/index.ts" } });
    write(root, "server/packages/contracts/bar/src/index.ts", "export interface Foo { value: string }\n");
    write(root, "server/architecture/contract-ownership.json", { schemaVersion: 1, domains: { foo: "@athyper/server-contract-foo", bar: "@athyper/server-contract-bar" }, duplicateSymbolAllowlist: [] });
  }, "DUPLICATE_CONTRACT"));
  await suite.test("backup isolation", () => violation((root) => write(root, ".dockerignore", "node_modules\n"), "BACKUP_ISOLATION"));
});
