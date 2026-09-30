import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GOVERNANCE_COMPOSITION_FILES = [
  "server/apps/platform-host/src/composition/register-services.ts",
  "server/packages/platform/governance/src",
  "server/packages/platform/control-admin/src",
];

export function findGenericPlaneFallbacks(source) {
  const findings = [];
  const lines = source.split(/\r?\n/u);
  const fallback = /\b\w*(?:database|repository|repositories|store)\w*\s*=.*(?:\.neon|\[\s*["']neon["']\s*\]).*\?\?.*(?:\.studio|\.mesh|\[\s*["'](?:studio|mesh)["']\s*\])/iu;
  const reverseFallback = /\b\w*(?:database|repository|repositories|store)\w*\s*=.*(?:\.studio|\.mesh|\[\s*["'](?:studio|mesh)["']\s*\]).*\?\?.*(?:\.neon|\[\s*["']neon["']\s*\])/iu;
  for (let index = 0; index < lines.length; index += 1) {
    if (fallback.test(lines[index]) || reverseFallback.test(lines[index])) findings.push({ line: index + 1, text: lines[index].trim() });
  }
  return findings;
}

export function verifyGovernancePlaneComposition(root = process.cwd()) {
  const files = GOVERNANCE_COMPOSITION_FILES.flatMap((entry) => sourceFiles(resolve(root, entry)));
  const findings = files.flatMap((file) => findGenericPlaneFallbacks(readFileSync(file, "utf8")).map((item) => ({ ...item, file })));
  if (findings.length > 0) throw new Error(`Governance/control composition contains generic plane fallback:\n${findings.map((item) => `${item.file}:${item.line}: ${item.text}`).join("\n")}`);
  const source = readFileSync(resolve(root, GOVERNANCE_COMPOSITION_FILES[0]), "utf8");
  if (!source.includes("createExactPlaneRepositoryProvider")) throw new Error("Governance/control composition must use the exact-plane repository provider");
  for (const plane of ["studio", "neon", "mesh"]) {
    if (!source.includes(`governance.${"${planeKey}"}`)) break;
    if (!source.includes(`metadataDatabases.${plane}`)) throw new Error(`Missing explicit ${plane} governance registration`);
  }
  return true;
}

function sourceFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sourceFiles(resolve(path, entry.name)) : entry.name.endsWith(".ts") ? [resolve(path, entry.name)] : []);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyGovernancePlaneComposition();
  console.log("Governance exact-plane composition policy passed.");
}
