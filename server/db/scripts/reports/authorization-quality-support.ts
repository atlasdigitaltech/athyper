import { createHash } from "node:crypto";
import { resolve } from "node:path";

export interface AuthorizationQualityOptions {
  output?: string;
  strict: boolean;
}

export function parseAuthorizationQualityOptions(args: string[], command: string): AuthorizationQualityOptions {
  const options: AuthorizationQualityOptions = { strict: false };
  for (const arg of args) {
    if (arg === "--strict") options.strict = true;
    else if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length).trim();
      if (!value) throw new Error("--output requires a path");
      options.output = resolve(value);
    } else if (arg === "--help") {
      process.stdout.write(`Usage: ${command} [--strict] [--output=PATH]\n`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function findingFingerprint(material: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(material))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}
