import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const roots = [
  "server/packages/services/ai",
  "server/packages/services/iam/support",
  "server/src",
  "server/db/scripts/verify",
  "server/packages/adapters/db/src/prisma",
  "docs/runbooks",
  "docs/meta-entity",
];
const extensions = new Set([".ts", ".prisma", ".md"]);
const tables = [
  "ai_action_policy",
  "ai_confidence_threshold",
  "ai_drift_baseline",
  "atlas_conversation_retention_policy",
  "atlas_tenant_provider_credential",
  "atlas_tenant_provider_credential_epoch",
  "ai_tool_invocation",
  "atlas_run",
  "ai_agent_call",
  "ai_agent_run",
  "ai_calibration_log",
  "ai_call_transcript",
  "ai_call_transcript_default",
  "ai_feedback_log",
  "ai_inference_log",
  "ai_monitoring_log",
  "atlas_knowledge_chunk",
  "atlas_knowledge_revision",
  "atlas_knowledge_source",
  "atlas_message",
  "atlas_support_session",
  "atlas_thread",
];

function boundedName(table, name) {
  const candidate = `${table}_${name}`;
  if (candidate.length <= 63) return candidate;
  let hash = 2166136261;
  for (const char of candidate) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${candidate.slice(0, 54)}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function filesUnder(path) {
  if (!(await stat(path)).isDirectory()) return [path];
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (extensions.has(extname(entry.name))) files.push(child);
  }
  return files;
}

let changed = 0;
for (const root of roots) {
  for (const file of await filesUnder(resolve(repoRoot, root))) {
    const original = await readFile(file, "utf8");
    let updated = original;
    for (const table of tables) {
      updated = updated.replace(
        new RegExp(`\\b(?:control|event|log|master)[.]${table}\\b`, "g"),
        `ai.${table}`,
      );
      if (extname(file) === ".prisma") {
        const modelPattern = new RegExp(
          `(model\\s+${table}\\s+\\{[\\s\\S]*?@@schema\\()"(?:control|event|log|master)"(\\)[\\s\\S]*?\\n\\})`,
          "g",
        );
        updated = updated.replace(modelPattern, "$1\"ai\"$2");
        const modelBlockPattern = new RegExp(
          `(model\\s+${table}\\s+\\{[\\s\\S]*?\\n\\})`,
          "g",
        );
        updated = updated.replace(modelBlockPattern, (block) =>
          block.replace(/map: "([a-z_][a-z0-9_]*)"/g, (mapping, name) =>
            name.startsWith(`${table}_`)
              ? mapping
              : `map: "${boundedName(table, name)}"`),
        );
      }
    }
    if (updated !== original) {
      await writeFile(file, updated);
      changed += 1;
    }
  }
}

console.log(`Updated ${changed} files.`);
