/** Cold-load stampede, skew, tenant isolation, and Redis-impairment qualification. */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

import { ENV } from "./shared/env.js";
import { headersA, headersB } from "./shared/headers.js";

const ENTITIES = (__ENV.ENTITY_CODES || "supplier,purchase_order,ledger_entry")
  .split(",").map((value) => value.trim()).filter(Boolean);
const failures = new Counter("meta_entity_resilience_failures");

export const options = {
  scenarios: {
    stampede: { executor: "shared-iterations", exec: "stampede", vus: 100, iterations: 100, maxDuration: "2m" },
    skew: { executor: "constant-vus", exec: "skew", vus: Number(__ENV.SKEW_VUS || 20), duration: __ENV.SKEW_DURATION || "2m", startTime: "5s" },
    failure: { executor: "constant-vus", exec: "failure", vus: Number(__ENV.FAILURE_VUS || 5), duration: __ENV.FAILURE_DURATION || "1m", startTime: "10s" },
  },
  thresholds: { http_req_failed: ["rate<0.01"], meta_entity_resilience_failures: ["count==0"] },
};

export function setup() {
  if (__ENV.COLD_PREP_URL) {
    const response = http.post(__ENV.COLD_PREP_URL, null, { headers: headersA(ENV), tags: { name: "cold_generation_bump" } });
    if (response.status < 200 || response.status >= 300) throw new Error(`cold preparation failed: ${response.status}`);
  }
}

export function stampede() {
  descriptor(ENTITIES[0], headersA(ENV), "stampede");
}

export function skew() {
  // Deliberately bias 80% of requests to one hot entity.
  const entity = __ITER % 5 === 0 ? ENTITIES[__ITER % ENTITIES.length] : ENTITIES[0];
  descriptor(entity, headersA(ENV), "skew");
  if (ENV.TOKEN_B && ENV.ORG_B) descriptor(entity, headersB(ENV), "tenant_b");
  sleep(0.05);
}

export function failure() {
  const base = __ENV.FAILURE_BASE_URL || ENV.BASE_URL;
  const response = http.get(`${base}/metadata/entities/${encodeURIComponent(ENTITIES[0])}/compiled`, {
    headers: headersA(ENV), tags: { name: "redis_failure_fallback" },
  });
  verify(response, "failure fallback");
  sleep(0.1);
}

function descriptor(entity, headers, name) {
  const response = http.get(`${ENV.BASE_URL}/metadata/entities/${encodeURIComponent(entity)}/compiled`, {
    headers, tags: { name: `descriptor_${name}`, entity },
  });
  verify(response, name);
}

function verify(response, name) {
  const passed = check(response, {
    [`${name} succeeds`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} returns descriptor hash`]: (r) => Boolean(r.headers["X-Descriptor-Hash"] || r.headers["X-Execution-Descriptor-Hash"]),
  });
  if (!passed) failures.add(1);
}
