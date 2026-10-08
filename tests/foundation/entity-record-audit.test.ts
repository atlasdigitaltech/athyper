import assert from "node:assert/strict";
import test from "node:test";
import { readStorageJson, writeStorageItem } from "../../packages/platform/entity/runtime/list-view/src/browser-storage";
import { sectionAvailability } from "../../packages/platform/entity/runtime/form-detail/src/section-availability";
import { ENTITY_RUNTIME_KEY_PATTERN, isEntityRuntimeKey, isEntityNavigationKey, isEntityRuntimeUuid, resolveEntityStatusTone } from "../../packages/contracts/platform/entity-runtime/src/runtime-values";

test("authentication and missing resources never masquerade as section permission denial", () => {
  for (const status of [401, 404, 500]) assert.equal(sectionAvailability({status}), undefined);
  assert.equal(sectionAvailability({status: 403}), "forbidden");
  assert.equal(sectionAvailability({status: 409, problem: {code: "ENTITY_RUNTIME_CONTEXT_REQUIRED"}}), "context_required");
  assert.equal(sectionAvailability({status: 409, problem: {code: "BP_360_SCOPE_REQUIRED"}}), "context_required");
  assert.equal(sectionAvailability({status: 409, problem: {code: "STALE_CURSOR"}}), undefined);
});

test("navigation compatibility does not widen section or surface key syntax", () => {
  for (const value of ["overview", "Identity", "a.b-c_d", "360", "", "../x", "x/y", "a".repeat(128)]) {
    assert.equal(isEntityRuntimeKey(value), new RegExp(ENTITY_RUNTIME_KEY_PATTERN).test(value));
  }
  assert.equal(isEntityNavigationKey("360"), true);
  assert.equal(isEntityRuntimeKey("360"), false);
  assert.equal(isEntityNavigationKey("360/evil"), false);
  assert.equal(isEntityRuntimeUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isEntityRuntimeUuid("11111111-1111-4111-8111-111111111111/"), false);
});

test("status tone is keyed by the exact published choice value and only by own keys", () => {
  assert.equal(resolveEntityStatusTone("published", {published: "success"}), "success");
  assert.equal(resolveEntityStatusTone("Published", {Published: "warning", published: "success"}), "warning");
  assert.equal(resolveEntityStatusTone("ACTIVE", {active: "success"}), "neutral");
  assert.equal(resolveEntityStatusTone("constructor", {active: "success"}), "neutral");
  assert.equal(resolveEntityStatusTone("toString", Object.create({toString: "danger"})), "neutral");
  assert.equal(resolveEntityStatusTone("active", {}), "neutral");
  assert.equal(resolveEntityStatusTone("active", {active: "invalid"}), "neutral");
  assert.equal(resolveEntityStatusTone(null, {active: "success"}), "neutral");
});

test("optional preference storage recovers corrupt JSON and tolerates denied storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map<string, string>([["broken", "{invalid"]]);
  try {
    Object.defineProperty(globalThis, "window", {configurable: true, value: {localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
      setItem: (key: string, value: string) => stored.set(key, value),
    }}});
    assert.equal(readStorageJson("broken"), null);
    assert.equal(stored.has("broken"), false);
    writeStorageItem("valid", '{"mode":"sections"}');
    assert.deepEqual(readStorageJson("valid"), {mode: "sections"});
    Object.defineProperty(globalThis, "window", {configurable: true, get() {throw new Error("Storage denied");}});
    assert.equal(readStorageJson("valid"), null);
    assert.doesNotThrow(() => writeStorageItem("valid", "{}"));
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
