#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  throw new Error(message);
}

function mustContain(source, needle, label) {
  if (!source.includes(needle)) {
    fail(`Missing ${label}: expected "${needle}"`);
  }
}

function mustMatch(source, regex, label) {
  const match = source.match(regex);
  if (!match) {
    fail(`Missing ${label}: expected pattern ${regex}`);
  }
  return match;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const checks = [
  {
    path: resolve(repositoryRoot, "server/db/ddl/planes/neon/authz/12_compiled_permission_reference_seed.sql"),
    required: {
      isSeedPayload: true,
      plane: "neon",
      assertions: "seed-assertions",
      countHeader: /-- seed-expected-row-count:\s*exact:(\d+)/i,
    },
  },
  {
    path: resolve(repositoryRoot, "server/db/ddl/planes/athyper/authz/12_compiled_permission_reference_seed.sql"),
    required: {
      isSeedPayload: true,
      plane: "athyper",
      assertions: "seed-assertions",
      countHeader: /-- seed-expected-row-count:\s*exact:(\d+)/i,
    },
  },
  {
    path: resolve(repositoryRoot, "server/db/ddl/planes/athyper/control/12_lookup_reference_entrypoint.sql"),
    required: {
      isSeedPayload: false,
      plane: "athyper",
      assertions: null,
      includesEntries: /\\ir\s+lookup-packs\//i,
    },
  },
  {
    path: resolve(repositoryRoot, "server/db/ddl/planes/neon/control/12_lookup_reference_entrypoint.sql"),
    required: {
      isSeedPayload: false,
      plane: "neon",
      assertions: null,
      includesEntries: /\\ir\s+lookup-packs\//i,
    },
  },
  {
    path: resolve(repositoryRoot, "server/db/ddl/planes/mesh/control/12_lookup_reference_entrypoint.sql"),
    required: {
      isSeedPayload: false,
      plane: "mesh",
      assertions: null,
      includesEntries: /\\ir\s+lookup-packs\//i,
    },
  },
];

const result = {
  smoke: "authorization-wave2-catalog",
  seedFilesChecked: checks.length,
  passed: true,
  counts: {},
  manifestHashes: {},
};

for (const check of checks) {
  const source = await readFile(check.path, "utf8");
  const digest = createHash("sha256").update(source).digest("hex");
  result.manifestHashes[check.path.replace(/\\+/g, "/")] = digest.slice(0, 12);

  if (check.required.isSeedPayload) {
    mustContain(source, "-- seed-contract-version:", `${check.path} contract header`);
    mustContain(
      source,
      `seed-plane: ${check.required.plane}`,
      `${check.path} plane assertion`,
    );
    result.passed = result.passed && true;
  } else {
    if (!check.required.includesEntries?.test(source)) {
      fail(`${check.path} should reference generated lookup pack payloads`);
    }
  }

  if (check.required.countHeader) {
    const match = mustMatch(source, check.required.countHeader, `${check.path} expected-row-count`);
    const expectedRowCount = Number.parseInt(match[1], 10);
    const actualRowCount = (source.match(/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']*'/g) ?? []).length;
    if (actualRowCount < expectedRowCount) {
      fail(
        `${check.path} payload is short (${actualRowCount} rows) versus expected ${expectedRowCount}`,
      );
    }
    result.counts[check.path.replace(/\\/g, "/")] = {
      expected: expectedRowCount,
      detected: actualRowCount,
    };
  }

  if (check.required.assertions) {
    mustContain(
      source,
      `seed-assertions`,
      `${check.path} assertion marker`,
    );
  }

  if (check.required.includesEntries && check.required.isSeedPayload) {
    if (!check.required.includesEntries.test(source)) {
      fail(`${check.path} should reference generated payloads`);
    }
  }
}
console.log(JSON.stringify(result, null, 2));
