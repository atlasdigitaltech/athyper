import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const inventory = JSON.parse(readFileSync(
  resolve(root, "config/legacy-experience-cleanup.json"),
  "utf8",
).replace(/^\uFEFF/, ""));
const failures = [];
const requiredTargetCodes = new Set([
  "plane_shell_wrappers",
  "settings_clients",
  "neon_legacy_settings_sections",
  "placeholder_command_hubs",
  "legacy_favorites_container",
  "finance_setup_poc",
  "static_dashboard_values",
  "ignored_inbox_catchall_behavior",
  "temporary_feature_wrappers",
  "migration_flags",
]);

if (inventory.schemaVersion !== 1) failures.push("unsupported cleanup inventory schema");
if (!Number.isInteger(inventory.observationWindowDays) || inventory.observationWindowDays < 7) {
  failures.push("cleanup observation window must be at least seven days");
}

for (const target of inventory.targets ?? []) {
  requiredTargetCodes.delete(target.code);
  if (!["removed", "retain_until_observed"].includes(target.status)) {
    failures.push(`${target.code}: invalid status`);
    continue;
  }
  if (!target.flag) failures.push(`${target.code}: rollout flag is required`);
  for (const path of target.paths ?? []) {
    const present = existsSync(resolve(root, path));
    if (target.status === "removed" && present) failures.push(`${target.code}: removed path still exists: ${path}`);
    if (target.status === "retain_until_observed" && !present) {
      failures.push(`${target.code}: inventory is stale; retained path is absent: ${path}`);
    }
  }
}
for (const code of requiredTargetCodes) failures.push(`cleanup target is not inventoried: ${code}`);

const activeEntries = [
  "apps/studio/app/(shell)/dashboard/page.tsx",
  "apps/studio/app/(shell)/setup/page.tsx",
  "apps/studio/app/(shell)/content/page.tsx",
  "apps/neon/app/(shell)/dashboard/page.tsx",
  "apps/neon/app/(shell)/setup/page.tsx",
  "apps/neon/app/(shell)/content/page.tsx",
  "apps/mesh/app/(shell)/dashboard/page.tsx",
  "apps/mesh/app/(shell)/setup/page.tsx",
  "apps/mesh/app/(shell)/content/page.tsx",
];
for (const path of activeEntries) {
  const source = readFileSync(resolve(root, path), "utf8");
  if (/coming soon|will appear here|\bReview\b|\bResolve\b|>\s*0\s*</i.test(source)) {
    failures.push(`${path}: active placeholder or static dashboard copy`);
  }
}

for (const plane of ["studio", "neon", "mesh"]) {
  const path = `apps/${plane}/app/(shell)/inbox/[...requestId]/page.tsx`;
  const source = readFileSync(resolve(root, path), "utf8");
  if (!source.includes("requestId.join")) failures.push(`${path}: catch-all path is ignored`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Experience cleanup inventory verified.\n");
}
