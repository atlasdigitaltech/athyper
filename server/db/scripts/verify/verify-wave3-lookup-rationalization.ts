import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type Plane = "common" | "athyper" | "neon" | "mesh";
type Entry = { sourceFile: string; domains: string[]; plane: Plane; disposition: string; sealedDomainMatches: Record<string, string>; targetPack: string };
const root = resolve(import.meta.dirname, "../../../..");
const db = resolve(root, "server/db");
const ledger = JSON.parse(readFileSync(resolve(db, "seed/migration/wave3-lookup-ledger.v1.json"), "utf8")) as { sourceFiles: number; entries: Entry[] };
assert.equal(ledger.sourceFiles, 268, "all 268 lookup files must remain classified");
assert.equal(new Set(ledger.entries.map((entry) => entry.sourceFile)).size, 268, "ledger source rows must be unique");
assert.equal(ledger.entries.filter((entry) => entry.domains.length === 0 && entry.disposition !== "rewrite" && entry.disposition !== "retire").length, 0,
  "only registry rewrites or explicit tombstones may lack domain extraction");

const roots: Record<Plane, string> = {
  common: resolve(db, "ddl/common/control"),
  athyper: resolve(db, "ddl/planes/athyper/control"),
  neon: resolve(db, "ddl/planes/neon/control"),
  mesh: resolve(db, "ddl/planes/mesh/control"),
};
for (const plane of Object.keys(roots) as Plane[]) {
  const packDir = resolve(roots[plane], "lookup-packs");
  const files = readdirSync(packDir).filter((name) => /^12_.*_seed\.sql$/.test(name)).sort();
  assert.ok(files.length > 0, `${plane} must own at least one generated pack`);
  const entrypoint = readFileSync(resolve(roots[plane], "12_lookup_reference_entrypoint.sql"), "utf8");
  assert.deepEqual([...entrypoint.matchAll(/\\ir lookup-packs\/(\S+)/g)].map((match) => match[1]).sort(), files,
    `${plane} entrypoint must include every generated pack exactly once`);
  if (plane === "common") {
    for (const consumer of ["athyper", "neon", "mesh"]) {
      const manifest = readFileSync(resolve(db, `ddl/planes/${consumer}/_manifest.txt`), "utf8");
      assert.match(manifest, /^common\/control\/12_lookup_reference_entrypoint\.sql$/m);
    }
  } else {
    const manifest = readFileSync(resolve(db, `ddl/planes/${plane}/_manifest.txt`), "utf8");
    assert.match(manifest, new RegExp(`^planes/${plane}/control/12_lookup_reference_entrypoint\\.sql$`, "m"));
    assert.match(manifest, /^common\/control\/12_lookup_reference_entrypoint\.sql$/m);
  }
}

const allGenerated = (Object.keys(roots) as Plane[]).flatMap((plane) =>
  readdirSync(resolve(roots[plane], "lookup-packs")).filter((name) => name.endsWith("_seed.sql"))
    .map((name) => readFileSync(resolve(roots[plane], "lookup-packs", name), "utf8")),
).join("\n");
for (const entry of ledger.entries.filter((candidate) => candidate.disposition === "retire")) {
  for (const domain of Object.keys(entry.sealedDomainMatches)) {
    assert.ok(!allGenerated.includes(`'${domain}'`), `sealed domain ${domain} must not be emitted to lookup_value`);
  }
}
for (const marker of ["ON CONFLICT (code) DO UPDATE", "ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE", "IS DISTINCT FROM", "seed-assertion: semantic"]) {
  assert.ok(allGenerated.includes(marker), `generated packs must contain ${marker}`);
}
const provision = readFileSync(resolve(db, "scripts/provision.ts"), "utf8");
assert.ok(!provision.includes('relFromSeed.startsWith("platform/000_lookups/")'), "legacy lookup tree should no longer be special-cased in runtime provisioning");
console.log("Wave 3 lookup rationalization verified: 268 files classified; sealed duplicates retired; consumer packs manifest-owned.");
