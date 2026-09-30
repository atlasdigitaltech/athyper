/**
 * P0 meta-entity baseline: descriptor, list, detail, create, PATCH, aggregate.
 *
 * Read scenarios run when their required identifiers are present. Mutating
 * scenarios are disabled unless WRITE_MODE=enabled and their JSON payloads are
 * supplied. Use a disposable performance tenant for writes.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

import { ENV } from "./shared/env.js";
import { headersA } from "./shared/headers.js";
import { safeParseJson } from "./shared/utils.js";

const ENTITY = __ENV.ENTITY || "supplier";
const RECORD_ID = __ENV.RECORD_ID || "";
const WRITE_ENABLED = (__ENV.WRITE_MODE || "").toLowerCase() === "enabled";
const CREATE_BODY = parseOptionalJson("CREATE_BODY_JSON");
const PATCH_BODY = parseOptionalJson("PATCH_BODY_JSON");
const AGGREGATE_BODY = parseOptionalJson("AGGREGATE_BODY_JSON");
const PATCH_RECORD_IDS = csv(__ENV.PATCH_RECORD_IDS || RECORD_ID);
const AGGREGATE_RECORD_IDS = csv(__ENV.AGGREGATE_RECORD_IDS || RECORD_ID);

const latency = {
  descriptor: new Trend("p0_descriptor_ms", true),
  list: new Trend("p0_list_ms", true),
  detail: new Trend("p0_detail_ms", true),
  create: new Trend("p0_create_ms", true),
  patch: new Trend("p0_patch_ms", true),
  aggregate: new Trend("p0_aggregate_ms", true),
};
const failures = new Counter("p0_contract_failures");

const scenarios = {
  descriptor: constantScenario("descriptor", "descriptorBootstrap", 10, "60s", "0s"),
  list: constantScenario("list", "listRecords", 10, "60s", "5s"),
};
if (RECORD_ID) scenarios.detail = constantScenario("detail", "recordDetail", 10, "60s", "10s");
if (WRITE_ENABLED && CREATE_BODY) {
  scenarios.create = iterationScenario("create", "createRecord", 10, "15s");
}
if (WRITE_ENABLED && PATCH_BODY && PATCH_RECORD_IDS.length > 0) {
  scenarios.patch = iterationScenario("patch", "patchRecord", PATCH_RECORD_IDS.length, "20s");
}
if (WRITE_ENABLED && AGGREGATE_BODY && AGGREGATE_RECORD_IDS.length > 0) {
  scenarios.aggregate = iterationScenario("aggregate", "aggregateSave", AGGREGATE_RECORD_IDS.length, "25s");
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    p0_contract_failures: ["count==0"],
  },
};

export function descriptorBootstrap() {
  run("descriptor", "GET", `/metadata/entities/${encodeURIComponent(ENTITY)}/compiled`);
  sleep(0.1);
}

export function listRecords() {
  run("list", "GET", `/runtime/v1/entities/${encodeURIComponent(ENTITY)}?page=1&page_size=50`);
  sleep(0.1);
}

export function recordDetail() {
  run("detail", "GET", `/runtime/v1/entities/${encodeURIComponent(ENTITY)}/${encodeURIComponent(RECORD_ID)}`);
  sleep(0.1);
}

export function createRecord() {
  run("create", "POST", `/runtime/v1/entities/${encodeURIComponent(ENTITY)}`, CREATE_BODY, {
    "Idempotency-Key": uniqueKey("create"),
  });
}

export function patchRecord() {
  const recordId = PATCH_RECORD_IDS[__VU % PATCH_RECORD_IDS.length];
  run("patch", "PATCH", `/runtime/v1/entities/${encodeURIComponent(ENTITY)}/${encodeURIComponent(recordId)}`, PATCH_BODY, {
    "Idempotency-Key": uniqueKey("patch"),
  });
}

export function aggregateSave() {
  const recordId = AGGREGATE_RECORD_IDS[__VU % AGGREGATE_RECORD_IDS.length];
  run("aggregate", "POST", `/runtime/v1/entities/${encodeURIComponent(ENTITY)}/${encodeURIComponent(recordId)}/edit/submit`, AGGREGATE_BODY, {
    "Idempotency-Key": uniqueKey("aggregate"),
    ...optionalHeader("X-Document-Edit-Workspace", __ENV.DOCUMENT_EDIT_WORKSPACE),
  });
}

function run(kind, method, path, body, extraHeaders = {}) {
  const params = {
    headers: {
      ...headersA(ENV),
      "X-Plane": __ENV.PLANE || "neon",
      "X-Rollout-Cohort": __ENV.ROLLOUT_COHORT || "control",
      ...extraHeaders,
    },
    tags: { name: `p0_${kind}`, framework_operation: kind, entity: ENTITY },
  };
  const url = `${ENV.BASE_URL}${path}`;
  const response = body === undefined
    ? http.request(method, url, null, params)
    : http.request(method, url, JSON.stringify(body), params);
  latency[kind].add(response.timings.duration);

  const parsed = safeParseJson(response.body);
  const ok = response.status >= 200 && response.status < 300;
  const shaped = response.status === 204 || parsed !== null;
  const passed = check(response, {
    [`${kind} status is successful`]: () => ok,
    [`${kind} response is JSON or empty`]: () => shaped,
  });
  if (!passed) failures.add(1);
}

function constantScenario(tag, exec, vus, duration, startTime) {
  return {
    executor: "constant-vus",
    exec,
    vus: numberEnv(`${tag.toUpperCase()}_VUS`, vus),
    duration: __ENV[`${tag.toUpperCase()}_DURATION`] || duration,
    startTime,
    tags: { scenario: `p0_${tag}` },
  };
}

function iterationScenario(tag, exec, iterations, startTime) {
  return {
    executor: "shared-iterations",
    exec,
    vus: Math.min(numberEnv(`${tag.toUpperCase()}_VUS`, 2), iterations),
    iterations,
    maxDuration: "2m",
    startTime,
    tags: { scenario: `p0_${tag}` },
  };
}

function parseOptionalJson(name) {
  const raw = __ENV[name];
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { throw new Error(`[athyper-perf] ${name} must be valid JSON`); }
}

function csv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function numberEnv(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function uniqueKey(prefix) {
  return `p0-${prefix}-${__VU}-${__ITER}-${Date.now()}`;
}

function optionalHeader(name, value) {
  return value ? { [name]: value } : {};
}
