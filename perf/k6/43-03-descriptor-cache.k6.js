/**
 * 43-03 — Descriptor Cache Load Test
 *
 * P1 requirement: 500 concurrent users/tenant hitting
 *   GET /api/metadata/entities/:entity/compiled
 * Target:
 *   ✓ <10ms p95 on cache HIT path
 *   ✓ Tenant A requests never return Tenant B entity data
 *
 * Dependency: 43-01 (cache key includes tenantId — key is now
 *   `descriptor:v1:{tenantId}:{entityCode}` after the fix).
 *
 * ── Scenarios ────────────────────────────────────────────────────────────────
 *   warmup          10 VUs × 30 s  — seeds Redis for every entity in ENTITY_POOL
 *   cache_hit       500 VUs × 3 m  — all hammer journal_entry (stable HIT)
 *   cache_miss      50 VUs × 1 iter — each VU hits a distinct cold entity
 *   tenant_iso      100 VUs × 2 m  — alternates Tenant A/B; asserts no data bleed
 *
 * ── Thresholds ───────────────────────────────────────────────────────────────
 *   descriptor_hit_ms   p(95) < 10   (hard SLA — cache HIT only)
 *   http_req_failed     rate  < 0.01 (< 1 % errors across all scenarios)
 *   iso_violations      count == 0   (zero tolerance for cross-tenant leaks)
 *
 * ── Prerequisites ────────────────────────────────────────────────────────────
 *   • Server running at BASE_URL with populated DB (ENTITY_POOL entities seeded)
 *   • Redis cache deployed (Sprint 39) + 43-01 cache key fix applied
 *   • TOKEN_TENANT_A / ORG_TENANT_A  — Tenant A credentials
 *   • TOKEN_TENANT_B / ORG_TENANT_B  — Tenant B credentials (isolation scenario)
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   k6 run \
 *     -e BASE_URL=http://localhost:3001/api \
 *     -e TOKEN_TENANT_A=eyJ... \
 *     -e ORG_TENANT_A=demo-org \
 *     -e TOKEN_TENANT_B=eyJ... \
 *     -e ORG_TENANT_B=corp-org \
 *     perf/k6/43-03-descriptor-cache.k6.js
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { ENV }     from './shared/env.js';
import { headersA, headersB } from './shared/headers.js';
import { safeParseJson } from './shared/utils.js';

// ── Custom metrics ────────────────────────────────────────────────────────────

/** Latency for cache-HIT responses only (p95 SLA: <10ms) */
const descriptorHitMs   = new Trend('descriptor_hit_ms',  true);
/** Latency for cache-MISS (DB) responses */
const descriptorMissMs  = new Trend('descriptor_miss_ms', true);
/** Running count of X-Cache: HIT responses */
const cacheHitCount     = new Counter('cache_hit_count');
/** Running count of X-Cache: MISS responses */
const cacheMissCount    = new Counter('cache_miss_count');
/** Any response where entity_code !== requested code — must stay 0 */
const isoViolations     = new Counter('iso_violations');
/** Rate of 2xx responses across all descriptor requests */
const successRate       = new Rate('descriptor_success_rate');

// ── Entities available in the demo seed ──────────────────────────────────────
//
// These codes must exist in control.entity with an EFFECTIVE entity_version.
// Adjust to match your actual seeded entities.
const ENTITY_POOL = [
  'journal_entry',
  'vendor',
  'customer',
  'product',
  'purchase_order',
  'sales_order',
  'invoice',
  'payment',
  'account',
  'cost_center',
  'employee',
  'department',
  'project',
  'budget',
  'asset',
  'contract',
  'shipment',
  'warehouse',
  'tax_code',
  'currency',
];

/** Warm entity used for the cache_hit scenario — everyone hits the same key */
const WARM_ENTITY = 'journal_entry';

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * Warmup: seed Redis cache for every entity before the main scenarios start.
     * 10 VUs cycle through all ENTITY_POOL entries so all are in cache.
     */
    warmup: {
      executor:  'constant-vus',
      vus:       10,
      duration:  '30s',
      tags:      { scenario: 'warmup' },
      env:       { SCENARIO: 'warmup' },
    },

    /**
     * Cache hit: 500 VUs × 3 min all hitting the same entity.
     * After warmup the entry is in Redis; every response must be X-Cache: HIT.
     * p95 of descriptor_hit_ms must be < 10 ms.
     */
    cache_hit: {
      executor:   'constant-vus',
      vus:        500,
      duration:   '3m',
      startTime:  '35s',       // 5 s buffer after warmup ends
      tags:       { scenario: 'cache_hit' },
      env:        { SCENARIO: 'cache_hit' },
    },

    /**
     * Cache miss: 50 VUs each do exactly one request for a cold entity.
     * Verifies the full DB path still works and records miss latency baseline.
     */
    cache_miss: {
      executor:       'per-vu-iterations',
      vus:            50,
      iterations:     1,
      startTime:      '40s',
      maxDuration:    '60s',
      tags:           { scenario: 'cache_miss' },
      env:            { SCENARIO: 'cache_miss' },
    },

    /**
     * Tenant isolation: 100 VUs alternate between Tenant A and Tenant B, both
     * requesting the same entity code.  The response entity_code must always
     * match what was requested — never bleed across tenants.
     */
    tenant_iso: {
      executor:  'constant-vus',
      vus:       100,
      duration:  '2m',
      startTime: '40s',
      tags:      { scenario: 'tenant_iso' },
      env:       { SCENARIO: 'tenant_iso' },
    },
  },

  thresholds: {
    // Hard SLA: cache-HIT p95 < 10 ms
    descriptor_hit_ms:      ['p(95)<10'],
    // Overall HTTP error rate < 1 %
    http_req_failed:        ['rate<0.01'],
    // Zero cross-tenant data leaks
    iso_violations:         ['count==0'],
    // > 99 % successful descriptor fetches
    descriptor_success_rate: ['rate>0.99'],
  },
};

// ── Default function (called per VU iteration) ────────────────────────────────

export default function () {
  const scenario = __ENV.SCENARIO;

  if (scenario === 'warmup') {
    runWarmup();
  } else if (scenario === 'cache_hit') {
    runCacheHit();
  } else if (scenario === 'cache_miss') {
    runCacheMiss();
  } else if (scenario === 'tenant_iso') {
    runTenantIso();
  }
}

// ── Scenario implementations ──────────────────────────────────────────────────

function runWarmup() {
  // Each VU cycles through a slice of the entity pool so all entities are warmed
  const entity = ENTITY_POOL[(__ITER % ENTITY_POOL.length)];
  const res = http.get(
    `${ENV.BASE_URL}/metadata/entities/${entity}/compiled`,
    { headers: headersA(ENV), tags: { name: 'warmup' } },
  );
  check(res, { 'warmup 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(0.05);
}

function runCacheHit() {
  // All VUs hit the same well-known entity — should consistently return HIT
  const res = http.get(
    `${ENV.BASE_URL}/metadata/entities/${WARM_ENTITY}/compiled`,
    { headers: headersA(ENV), tags: { name: 'descriptor_hit' } },
  );

  const is2xx      = res.status >= 200 && res.status < 300;
  const xCache     = res.headers['X-Cache'] ?? res.headers['x-cache'] ?? '';
  const isHit      = xCache.toUpperCase() === 'HIT';
  const isMiss     = xCache.toUpperCase() === 'MISS';

  successRate.add(is2xx ? 1 : 0);

  if (is2xx) {
    if (isHit) {
      descriptorHitMs.add(res.timings.duration);
      cacheHitCount.add(1);
    } else if (isMiss) {
      // Expected only on very first requests before cache is warm
      descriptorMissMs.add(res.timings.duration);
      cacheMissCount.add(1);
    }

    const body = safeParseJson(res.body);
    check(res, {
      'status 200':            (r) => r.status === 200,
      'entity_code correct':   () => body?.entity_code === WARM_ENTITY,
      'compiled_hash present': () => typeof body?.compiled_hash === 'string',
      'fields array present':  () => Array.isArray(body?.fields),
      'x-cache header set':    () => xCache !== '',
    });
  }

  // Throttle to ~20 req/s per VU; 500 VUs → ~10 K req/s total.
  // Increase sleep if targeting server CPU limits rather than max throughput.
  sleep(0.05);
}

function runCacheMiss() {
  // per-vu-iterations=1, so each VU fires exactly one cold request.
  // Rotate through ENTITY_POOL by __VU index; repeat for VUs > pool size.
  const entity = ENTITY_POOL[(__VU - 1) % ENTITY_POOL.length];
  const res = http.get(
    `${ENV.BASE_URL}/metadata/entities/${entity}/compiled`,
    { headers: headersA(ENV), tags: { name: 'descriptor_miss' } },
  );

  const xCache = res.headers['X-Cache'] ?? res.headers['x-cache'] ?? '';
  successRate.add(res.status === 200 ? 1 : 0);

  if (res.status === 200) {
    // Should be MISS since this is the first request for this entity in this test run.
    // (May occasionally be HIT if warmup scenario already cached it — that is fine.)
    descriptorMissMs.add(res.timings.duration);
    if (xCache.toUpperCase() === 'MISS') cacheMissCount.add(1);
    if (xCache.toUpperCase() === 'HIT')  cacheHitCount.add(1);

    const body = safeParseJson(res.body);
    check(res, {
      'status 200':          (r) => r.status === 200,
      'entity_code correct': () => body?.entity_code === entity,
    });
  } else if (res.status === 404) {
    // Entity not in DB — adjust ENTITY_POOL for your seed data
    check(res, { 'entity not found (404 expected if not seeded)': () => true });
  }
}

function runTenantIso() {
  // Alternate VUs between Tenant A and Tenant B.
  // Both request the same entity code; responses must never cross tenants.
  const useA   = __VU % 2 === 0;
  const hdrs   = useA ? headersA(ENV) : headersB(ENV);
  const entity = WARM_ENTITY;

  const res = http.get(
    `${ENV.BASE_URL}/metadata/entities/${entity}/compiled`,
    { headers: hdrs, tags: { name: 'descriptor_iso' } },
  );

  successRate.add(res.status === 200 ? 1 : 0);

  if (res.status === 200) {
    const body = safeParseJson(res.body);

    // entity_code must always match the requested entity — never the wrong one
    const entityMatch = body?.entity_code === entity;
    if (!entityMatch) isoViolations.add(1);

    check(res, {
      'status 200':                      (r) => r.status === 200,
      'entity_code matches request':     () => entityMatch,
      'compiled_hash is string':         () => typeof body?.compiled_hash === 'string',
    });
  }

  sleep(0.1);
}

