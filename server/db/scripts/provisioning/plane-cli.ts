import { pathToFileURL } from "node:url";

import { applyAuthorizationSeedPack } from "../apply-authorization-seed-pack.js";
import type { ProvisionPlane } from "../safe-provision.js";

export async function runPlaneProvisionCli(
  plane: ProvisionPlane,
  args = process.argv.slice(2),
): Promise<void> {
  if (args.includes("--reset") || args.includes("--drop-only")) {
    throw new Error(
      "destructive reset is not part of tenant provisioning; use the guarded foundation reset workflow first",
    );
  }
  const requestedTenant = readOption(args, "--tenant");
  if (
    requestedTenant
    && !["athyper", "technostat", "cirrusatlantic", "all"].includes(requestedTenant)
  ) {
    throw new Error(
      `tenant is not declared by the canonical manifest: ${requestedTenant}`,
    );
  }
  const dryRun = args.includes("--dry-run")
    || args.includes("--plan")
    || args.includes("--status");
  const result = await applyAuthorizationSeedPack({
    plane,
    manifestPath: readOption(args, "--manifest"),
    dryRun,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function isMain(importMetaUrl: string): boolean {
  return importMetaUrl === pathToFileURL(process.argv[1] ?? "").href;
}

function readOption(args: readonly string[], name: string): string | undefined {
  const equals = args.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
