import { readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { parseCapabilityProfile, type CapabilityProfile } from "@athyper/server-contract-publication";

/** Repository-owned source adapter. Not a runtime registry or publication authority. */
export function createCapabilityProfileFileResolver(directory: string) {
  const root = realpathSync(directory);
  const lock = JSON.parse(readFileSync(resolve(root, "source-lock.json"), "utf8")) as Record<string, unknown>;
  if (lock.schema !== "athyper.capability-profile-source-lock/1" || !Array.isArray(lock.profiles)
      || Object.keys(lock).some(key => !["schema", "profiles"].includes(key))) throw Error("CAPABILITY_PROFILE_LOCK_INVALID");
  const catalog = new Map<string, CapabilityProfile>();
  for (const value of lock.profiles) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("CAPABILITY_PROFILE_LOCK_INVALID");
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).sort().join() !== ["code", "file", "sha256", "version"].sort().join()
        || typeof entry.code !== "string" || !Number.isSafeInteger(entry.version) || Number(entry.version) < 1
        || typeof entry.file !== "string" || isAbsolute(entry.file)
        || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error("CAPABILITY_PROFILE_LOCK_INVALID");
    const file = realpathSync(resolve(root, entry.file));
    const path = relative(root, file);
    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path)) throw Error("CAPABILITY_PROFILE_PATH_INVALID");
    const bytes = readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw Error("CAPABILITY_PROFILE_SOURCE_DRIFT");
    const profile = parseCapabilityProfile(JSON.parse(bytes.toString("utf8")));
    if (profile.profileCode !== entry.code || profile.profileVersion !== entry.version) throw Error("CAPABILITY_PROFILE_LOCK_IDENTITY_MISMATCH");
    const key = `${entry.code}@${entry.version}`;
    if (catalog.has(key)) throw Error("CAPABILITY_PROFILE_DUPLICATE_VERSION");
    catalog.set(key, profile);
  }
  return (code: string, version: number): CapabilityProfile => {
    const profile = catalog.get(`${code}@${version}`);
    if (!profile) throw Error("CAPABILITY_PROFILE_VERSION_UNKNOWN");
    return structuredClone(profile);
  };
}
