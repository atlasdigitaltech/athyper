import { parseActivityCollections } from "./activity-collections.js";
import { PublicationContractError } from "./errors.js";
import { capabilityAuthoringMode } from "./capability-authoring-mode.js";
import { ACTIVITY_PROFILE_PATHS, parseActivityPolicy } from "./activity-policy.js";

export interface CapabilityProfile {
  readonly schema: "athyper.capability-profile/1";
  readonly profileCode: string;
  readonly profileVersion: number;
  readonly capabilityKey: "comments" | "attachments" | "activity";
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly permittedOverrides: Readonly<Record<string, OverrideRule>>;
}
export type OverrideRule = { readonly minimum: number; readonly maximum: number }
  | { readonly allowedValues: readonly (string | boolean)[] }
  | { readonly collectionBindings: true }
  | { readonly allowedSubset: readonly string[] };

const commentPaths = new Set(["defaultAudience", "allowedAudiences", "maxTextLength", "maxDepth", "draftRetentionDays", "reactionCodes", "attachments.allowed", "attachments.maxCount",
  ...["replies", "edits", "reactions", "mentions", "drafts", "reporting", "history"].map(key => `features.${key}`)]);
const attachmentPaths = new Set(["maxFileBytes", "maxBatchCount", "allowedContentTypes", "categories", "folders", "versioning", "rename",
  "processing.preview", "processing.extraction", "processing.search", "processing.renditions"]);
function invalid(message: string): never {
  throw new PublicationContractError("ENTITY_CAPABILITY_INVALID", `capability profile: ${message}`);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("object required");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => ["__proto__", "prototype", "constructor"].includes(key))) invalid("unsafe property");
  return result;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) invalid("unexpected or missing property");
}
function leaves(value: Record<string, unknown>, prefix = ""): [string, unknown][] {
  return Object.entries(value).flatMap(([key, item]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) invalid("invalid nested property");
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const children = record(item);
      if (!Object.keys(children).length) invalid(`empty nested object: ${path}`);
      return leaves(children, path);
    }
    return [[path, item] as [string, unknown]];
  });
}
function matches(value: unknown, rule: OverrideRule): boolean {
  if ("collectionBindings" in rule) { try { parseActivityCollections(value); return true; } catch { return false; } }
  if ("minimum" in rule) return Number.isSafeInteger(value) && Number(value) >= rule.minimum && Number(value) <= rule.maximum;
  if ("allowedValues" in rule) return rule.allowedValues.some(candidate => candidate === value);
  return Array.isArray(value) && new Set(value).size === value.length && value.every(item => typeof item === "string" && rule.allowedSubset.includes(item));
}

export function parseCapabilityProfile(value: unknown): CapabilityProfile {
  const v = record(value);
  exact(v, ["schema", "profileCode", "profileVersion", "capabilityKey", "defaults", "permittedOverrides"]);
  if (v.schema !== "athyper.capability-profile/1" || typeof v.profileCode !== "string"
      || !/^platform\.(?:collaboration\.(?:comments|attachments)|activity)\.[a-z][a-z0-9_.-]*$/.test(v.profileCode)
      || !Number.isSafeInteger(v.profileVersion) || Number(v.profileVersion) < 1
      || !["comments", "attachments", "activity"].includes(String(v.capabilityKey))
      || !v.profileCode.startsWith(v.capabilityKey === "activity" ? "platform.activity." : `platform.collaboration.${v.capabilityKey}.`)) invalid("identity invalid");
  const defaults = record(v.defaults), rules = record(v.permittedOverrides);
  const allowed = v.capabilityKey === "activity" ? ACTIVITY_PROFILE_PATHS : v.capabilityKey === "comments" ? commentPaths : attachmentPaths;
  if (v.capabilityKey === "activity") parseActivityPolicy(defaults);
  const values = new Map(leaves(defaults));
  for (const [path, item] of values) {
    if (!allowed.has(path) || item === null || item === undefined) invalid(`unsupported default: ${path}`);
    if (v.capabilityKey === "activity") continue; // Complete typed policy was validated above.
    if (["maxTextLength", "maxDepth", "draftRetentionDays", "maxFileBytes", "maxBatchCount", "attachments.maxCount"].includes(path)) {
      if (!Number.isSafeInteger(item) || Number(item) < (path === "attachments.maxCount" ? 0 : 1)) invalid(`invalid numeric default: ${path}`);
    } else if (path === "defaultAudience") {
      if (!["public", "private", "internal"].includes(String(item))) invalid("invalid default audience");
    } else if (["allowedAudiences", "reactionCodes", "allowedContentTypes", "categories", "processing.renditions"].includes(path)) {
      if (!Array.isArray(item) || item.some(value => typeof value !== "string" || !value.trim())
          || new Set(item).size !== item.length) invalid(`invalid list default: ${path}`);
      if (path === "allowedAudiences" && item.some(value => !["public", "private", "internal"].includes(value))) invalid("invalid audience");
    } else if (typeof item !== "boolean") invalid(`invalid boolean default: ${path}`);
  }
  for (const [path, item] of Object.entries(rules)) {
    if (!allowed.has(path) || !values.has(path)) invalid(`unsupported override: ${path}`);
    const rule = record(item);
    if (Object.hasOwn(rule, "minimum")) {
      exact(rule, ["minimum", "maximum"]);
      if (!Number.isSafeInteger(rule.minimum) || !Number.isSafeInteger(rule.maximum)
          || Number(rule.minimum) < 0 || Number(rule.maximum) < Number(rule.minimum)) invalid(`invalid bounds: ${path}`);
    } else if (Object.hasOwn(rule, "collectionBindings")) {
      exact(rule, ["collectionBindings"]);
      if (v.capabilityKey !== "activity" || path !== "collections" || rule.collectionBindings !== true) invalid("invalid collection override rule");
    } else if (Object.hasOwn(rule, "allowedValues")) {
      exact(rule, ["allowedValues"]);
      if (!Array.isArray(rule.allowedValues) || !rule.allowedValues.length
          || rule.allowedValues.some(item => !["string", "boolean"].includes(typeof item))) invalid(`invalid values: ${path}`);
    } else {
      exact(rule, ["allowedSubset"]);
      if (!Array.isArray(rule.allowedSubset) || rule.allowedSubset.some(item => typeof item !== "string")) invalid(`invalid subset: ${path}`);
    }
    if (!matches(values.get(path), rule as unknown as OverrideRule)) invalid(`default outside override contract: ${path}`);
  }
  return structuredClone(v) as unknown as CapabilityProfile;
}

/** Pure source resolution. Final owner/service binding validation is mandatory downstream. */
export function resolveCapabilityProfileDefaults(member: unknown, lookup: (code: string, version: number) => unknown) {
  if (capabilityAuthoringMode(member, "capabilities") !== "profile") invalid("profile mode required");
  const source = record(member), ref = record(source.profile);
  exact(ref, ["code", "version"]);
  if (typeof ref.code !== "string" || !Number.isSafeInteger(ref.version) || Number(ref.version) < 1) invalid("exact profile version required");
  const profile = parseCapabilityProfile(lookup(ref.code, Number(ref.version)));
  if (profile.profileCode !== ref.code || profile.profileVersion !== ref.version || profile.capabilityKey !== source.capabilityKey) invalid("resolved profile identity mismatch");
  const result = structuredClone(profile.defaults) as Record<string, unknown>;
  const overrides = Object.hasOwn(source, "overrides") ? record(source.overrides) : {};
  for (const [path, value] of leaves(overrides)) {
    const rule = profile.permittedOverrides[path];
    if (!rule || !matches(value, rule)) invalid(`override not permitted: ${path}`);
    const parts = path.split(".");
    let target = result;
    for (const key of parts.slice(0, -1)) target = record(target[key]);
    target[parts.at(-1)!] = structuredClone(value);
  }
  if (profile.capabilityKey === "comments" && (!Array.isArray(result.allowedAudiences)
      || !result.allowedAudiences.includes(result.defaultAudience))) invalid("default audience must be allowed");
  if (profile.capabilityKey === "activity") parseActivityPolicy(result);
  return { profile, defaults: result };
}

/** Recheck effective values against the pinned source, including direct artifacts. */
export function validateCapabilityProfileBinding(profile: CapabilityProfile, binding: unknown): void {
  const actual = record(binding);
  if (profile.capabilityKey === "activity" && Object.hasOwn(actual, "recording") !== Object.hasOwn(profile.defaults, "recording")) invalid("recording must belong to the pinned profile");
  if (profile.capabilityKey === "activity") parseActivityPolicy(Object.fromEntries(Object.keys(profile.defaults).map(key => [key, actual[key]])));
  for (const [path, value] of leaves(record(profile.defaults))) {
    let observed: unknown = actual;
    for (const part of path.split(".")) observed = record(observed)[part];
    if (JSON.stringify(observed) === JSON.stringify(value)) continue;
    const rule = profile.permittedOverrides[path];
    if (!rule || !matches(observed, rule)) invalid(`binding exceeds pinned profile: ${path}`);
  }
}
