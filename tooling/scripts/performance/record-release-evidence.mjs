import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || true];
}));
if (!args.artifact || !args.name) throw new Error("--artifact and --name are required");
const destination = resolve(root, args.artifact);
if (existsSync(destination) && args.replace !== "true") throw new Error(`Refusing to replace existing signed evidence: ${args.artifact}`);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
writeFileSync(destination, `${JSON.stringify({
  schemaVersion: 1,
  kind: "athyper.release.evidence",
  artifact: args.name,
  passed: true,
  generatedAt: new Date().toISOString(),
  commit,
  source: { test: args.test || "unspecified", environment: process.env.CI ? "github-actions" : "local" },
}, null, 2)}\n`);
console.log(`Recorded passed evidence ${args.name}: ${args.artifact}`);
