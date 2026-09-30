#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  stagingProviderPath,
  writeStagingProviderEnvironment,
} from "../stackctl/src/provider-config.mjs";

function usage() {
  return "Usage: install-stg-provider-config.mjs --from-terraform-output <output.json> [--runtime-root <path>]";
}

function argumentsOf(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (!["--from-terraform-output", "--runtime-root"].includes(flag)) throw new Error(usage());
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    options[flag.slice(2)] = value;
    index += 1;
  }
  if (!options["from-terraform-output"]) throw new Error(usage());
  return options;
}

function value(output, key) {
  const root = output?.ses?.value ?? output?.ses;
  const result = root?.[key];
  if (typeof result !== "string" || !result.trim()) throw new Error(`Terraform SES output is missing ${key}`);
  return result.trim();
}

export function installStagingProviderConfig(terraformOutput, runtimeRoot) {
  const region = value(terraformOutput, "region");
  const path = stagingProviderPath(runtimeRoot);
  writeStagingProviderEnvironment(path, {
    ATHYPER_ENV: "staging",
    EMAIL_PROVIDER: "ses",
    SES_REGION: region,
    SES_CONFIGURATION_SET: value(terraformOutput, "configuration_set_name"),
    SES_FROM: value(terraformOutput, "from_address"),
    SES_EVENT_QUEUE_URL: value(terraformOutput, "event_queue_url"),
    SES_EVENT_REGION: region,
  });
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = argumentsOf(process.argv.slice(2));
    const input = JSON.parse(readFileSync(resolve(options["from-terraform-output"]), "utf8"));
    const runtimeRoot = resolve(options["runtime-root"] ?? process.env.ATHYPER_RUNTIME_ROOT ?? join(homedir(), ".athyper"));
    const path = installStagingProviderConfig(input, runtimeRoot);
    process.stdout.write(`Installed owner-only STAGING provider configuration at ${path}; values were not printed.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
