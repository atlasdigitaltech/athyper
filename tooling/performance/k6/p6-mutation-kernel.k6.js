/**
 * P6 mutation-kernel exit gate. Run only against a disposable tenant.
 * End-to-end p95 thresholds are intentionally at least as strict as the
 * transaction targets, so a passing run also bounds transaction time.
 * Framework telemetry is the companion source for the 5-8 SQL statement gate.
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

import { ENV } from "./shared/env.js";
import { headersA } from "./shared/headers.js";

const ENTITY = __ENV.P6_ENTITY || "company_code";
const WRITE_ENABLED = (__ENV.P6_WRITE_MODE || "").toLowerCase() === "enabled";
const CREATE_BODY = json("P6_CREATE_BODY_JSON");
const PATCH_BODY = json("P6_PATCH_BODY_JSON");
const PATCH_IDS = csv(__ENV.P6_PATCH_RECORD_IDS || "");
const DELETE_IDS = csv(__ENV.P6_DELETE_RECORD_IDS || "");
const ETAG = __ENV.P6_EXPECTED_VERSION || "1";
const failures = new Counter("p6_contract_failures");
const createMs = new Trend("p6_create_ms", true);
const patchMs = new Trend("p6_patch_ms", true);
const deleteMs = new Trend("p6_delete_ms", true);

if (!WRITE_ENABLED) {
  throw new Error("[athyper-perf] P6_WRITE_MODE=enabled is required for the mutation kernel");
}

const scenarios = {};
if (CREATE_BODY) scenarios.create = iterations("createRecord", positiveInteger("P6_CREATE_ITERATIONS", 10));
if (PATCH_BODY && PATCH_IDS.length) scenarios.patch = iterations("patchRecord", PATCH_IDS.length);
if (DELETE_IDS.length) scenarios.remove = iterations("deleteRecord", DELETE_IDS.length);
if (Object.keys(scenarios).length === 0) {
  throw new Error("[athyper-perf] configure at least one P6 create, patch, or delete workload");
}

export const options = {
  scenarios,
  thresholds: {
    p6_contract_failures: ["count==0"],
    p6_create_ms: ["p(95)<100"],
    p6_patch_ms: ["p(95)<50"],
    p6_delete_ms: ["p(95)<100"],
  },
};

export function createRecord() {
  request("POST", "", CREATE_BODY, createMs, [200, 201]);
}

export function patchRecord() {
  request("PATCH", PATCH_IDS[__ITER % PATCH_IDS.length], PATCH_BODY, patchMs, [200]);
}

export function deleteRecord() {
  request("DELETE", DELETE_IDS[__ITER % DELETE_IDS.length], undefined, deleteMs, [200, 204]);
}

function request(method, id, body, metric, statuses) {
  const suffix = id ? `/${encodeURIComponent(id)}` : "";
  const response = http.request(method, `${ENV.BASE_URL}/runtime/v1/entities/${encodeURIComponent(ENTITY)}${suffix}`,
    body === undefined ? null : JSON.stringify(body), {
      headers: {
        ...headersA(ENV),
        "X-Plane": __ENV.PLANE || "neon",
        "Idempotency-Key": `p6-${method.toLowerCase()}-${__VU}-${__ITER}-${Date.now()}`,
        ...(method === "PATCH" || method === "DELETE" ? { "If-Match": ETAG } : {}),
      },
      tags: { name: `p6_${method.toLowerCase()}`, framework_operation: method.toLowerCase(), entity: ENTITY },
    });
  metric.add(response.timings.duration);
  if (!check(response, { [`${method} succeeds`]: () => statuses.includes(response.status) })) failures.add(1);
}

function iterations(exec, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
    throw new Error(`[athyper-perf] ${exec} iterations must be between 1 and 10000`);
  }
  return { executor: "shared-iterations", exec, vus: Math.min(5, count), iterations: count, maxDuration: "2m" };
}

function json(name) {
  if (!__ENV[name]) return null;
  try { return JSON.parse(__ENV[name]); } catch { throw new Error(`${name} must be valid JSON`); }
}

function csv(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }

function positiveInteger(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) {
    throw new Error(`[athyper-perf] ${name} must be an integer between 1 and 10000`);
  }
  return value;
}
