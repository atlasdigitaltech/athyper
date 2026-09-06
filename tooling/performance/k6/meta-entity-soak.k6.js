/** Long-running bounded-cardinality soak for L1 eviction, heap, pool, and outbox telemetry. */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

import { ENV } from "./shared/env.js";
import { headersA } from "./shared/headers.js";

const ENTITIES = (__ENV.ENTITY_CODES || "supplier,purchase_order,ledger_entry")
  .split(",").map((value) => value.trim()).filter(Boolean);
if (ENTITIES.length === 0) throw new Error("ENTITY_CODES must contain at least one entity code");
const SOAK_VUS = Number(__ENV.SOAK_VUS || 20);
if (!Number.isSafeInteger(SOAK_VUS) || SOAK_VUS <= 0) throw new Error("SOAK_VUS must be a positive integer");
const failures = new Counter("meta_entity_soak_failures");

export const options = {
  scenarios: {
    soak: {
      executor: "constant-vus",
      vus: SOAK_VUS,
      duration: __ENV.SOAK_DURATION || "30m",
      gracefulStop: "30s",
    },
  },
  thresholds: { http_req_failed: ["rate<0.01"], meta_entity_soak_failures: ["count==0"] },
};

export default function () {
  const entity = ENTITIES[(__VU + __ITER) % ENTITIES.length];
  const descriptor = http.get(`${ENV.BASE_URL}/metadata/entities/${encodeURIComponent(entity)}/compiled`, {
    headers: headersA(ENV), tags: { name: "soak_descriptor", entity },
  });
  const list = http.get(`${ENV.BASE_URL}/runtime/v1/entities/${encodeURIComponent(entity)}?count_mode=none&limit=100`, {
    headers: headersA(ENV), tags: { name: "soak_list", entity },
  });
  const passed = check({ descriptor, list }, {
    "soak requests succeed": ({ descriptor: d, list: l }) =>
      d.status >= 200 && d.status < 300 && l.status >= 200 && l.status < 300,
  });
  if (!passed) failures.add(1);
  sleep(0.1);
}
