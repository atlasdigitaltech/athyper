/**
 * 43-07 — Field Security Middleware Overhead Test
 *
 * P5 requirement: field_security_policy active on an entity.
 * Target: < 5 ms additional overhead per response vs baseline.
 *
 * ── What the middleware does (Sprint 38) ─────────────────────────────────────
 * createFieldSecurityMiddleware() intercepts res.json() and:
 *   1. Checks a 5-min in-process cache for policy rows (tenantId × entityType)
 *   2. If policy rows exist, applies masking to matching fields per principal role:
 *      • "full"    → null
 *      • "partial" → ****last4
 *      • "hash"    → [pii:xxxxxxxx]
 *   3. Calls original res.json() with the masked payload
 *
 * ── Measurement approach ─────────────────────────────────────────────────────
 * Two scenarios run CONCURRENTLY with identical load:
 *
 *   baseline     — GET /records/:BASELINE_ENTITY
 *     • Entity has NO field_security_policy rows (no masking work)
 *     • Records the raw DB+serialize overhead (req_dur_baseline_ms)
 *
 *   with_policy  — GET /records/:POLICY_ENTITY
 *     • Entity has at least one field_security_policy row (masking IS applied)
 *     • Records the overhead including policy lookup + masking (req_dur_policy_ms)
 *
 * Overhead = median(req_dur_policy_ms) - median(req_dur_baseline_ms)
 * Pass condition: overhead < 5 ms at both p50 and p95.
 *
 * ── Thresholds ───────────────────────────────────────────────────────────────
 *   req_dur_baseline_ms   p(95) < 200  (overall response time baseline)
 *   req_dur_policy_ms     p(95) < 205  (policy path must stay within +5ms of baseline)
 *   http_req_failed       rate  < 0.01
 *
 * Note: the `p(95)<205` threshold assumes a baseline p95 of ~200ms — adjust both
 * thresholds to your environment's observed baseline.  The DevOps/QA team should
 * run baseline first, record p95, then set BASELINE_P95_MS + POLICY_HEADROOM_MS
 * via env vars (see below) to make the threshold adaptive.
 *
 * ── Prerequisites ────────────────────────────────────────────────────────────
 *   • BASELINE_ENTITY must exist with NO field_security_policy rows
 *     (e.g. 'cost_center', 'department', or any entity without PII fields)
 *   • POLICY_ENTITY must exist WITH at least one field_security_policy row
 *     covering at least one field on the entity
 *     (e.g. 'customer' with email/phone masked, or 'vendor' with bank_account masked)
 *   • Principal used (TOKEN_TENANT_A) must NOT be in the access_roles list so
 *     masking IS applied (verifies the hot path, not the short-circuit exit)
 *   • Server running, field-security middleware mounted on records routes
 *   • BASE_URL, TOKEN_TENANT_A, ORG_TENANT_A set
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   k6 run \
 *     -e BASE_URL=http://localhost:3001/api \
 *     -e TOKEN_TENANT_A=eyJ... \
 *     -e ORG_TENANT_A=demo-org \
 *     -e BASELINE_ENTITY=cost_center \
 *     -e POLICY_ENTITY=customer \
 *     perf/k6/43-07-field-security.k6.js
 *
 * ── Interpreting results ──────────────────────────────────────────────────────
 *   k6 summary will print both Trend metrics.  To compute exact overhead:
 *     overhead_p50_ms = req_dur_policy_ms{p50} - req_dur_baseline_ms{p50}
 *     overhead_p95_ms = req_dur_policy_ms{p95} - req_dur_baseline_ms{p95}
 *   Both must be < 5 ms to pass Sprint 43 acceptance criteria.
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { ENV }      from './shared/env.js';
import { headersA } from './shared/headers.js';

// ── Custom metrics ────────────────────────────────────────────────────────────

/** End-to-end latency for baseline entity (no field security) */
const reqDurBaselineMs  = new Trend('req_dur_baseline_ms',  true);
/** End-to-end latency for policy-active entity (field masking applied) */
const reqDurPolicyMs    = new Trend('req_dur_policy_ms',    true);
/** Count of baseline requests where masking was unexpectedly applied */
const baselineMaskLeaks = new Counter('baseline_mask_leaks');
/** Count of policy requests where masking was NOT applied (should be 0) */
const policyMaskMisses  = new Counter('policy_mask_misses');
/** Overall HTTP success rate */
const successRate       = new Rate('field_sec_success_rate');

// ── Configurable entity codes ─────────────────────────────────────────────────
const BASELINE_ENTITY = __ENV.BASELINE_ENTITY || 'cost_center';
const POLICY_ENTITY   = __ENV.POLICY_ENTITY   || 'customer';

// ── Adaptive threshold support ────────────────────────────────────────────────
// Set BASELINE_P95_MS to your environment's observed baseline p95 (in ms).
// POLICY_HEADROOM_MS is the maximum allowed overhead (default: 5 ms per spec).
const BASELINE_P95_MS    = parseInt(__ENV.BASELINE_P95_MS    || '200', 10);
const POLICY_HEADROOM_MS = parseInt(__ENV.POLICY_HEADROOM_MS || '5',   10);
const POLICY_P95_BUDGET  = BASELINE_P95_MS + POLICY_HEADROOM_MS;

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    /**
     * Baseline: 50 VUs hitting the entity with no field security policy.
     * Establishes the floor latency (DB read + JSON serialize, no masking).
     */
    baseline: {
      executor:  'constant-vus',
      vus:       50,
      duration:  '3m',
      tags:      { scenario: 'baseline' },
      env:       { SCENARIO: 'baseline' },
    },

    /**
     * With policy: 50 VUs hitting the policy-active entity.
     * Same concurrency as baseline — any latency delta isolates middleware cost.
     * Runs CONCURRENTLY with baseline so system load is identical for both.
     */
    with_policy: {
      executor:  'constant-vus',
      vus:       50,
      duration:  '3m',
      tags:      { scenario: 'with_policy' },
      env:       { SCENARIO: 'with_policy' },
    },

    /**
     * Cache-warm burst: 50 VUs hitting the policy entity after the cache has
     * been warm for ≥5 min.  This isolates the in-process cache-hit path only
     * (no DB policy lookup) — should be even lower overhead than the 3-min run.
     * Starts at 3m30s to let the first two scenarios stabilise the cache.
     */
    policy_cache_warm: {
      executor:    'constant-vus',
      vus:         50,
      duration:    '2m',
      startTime:   '3m30s',
      tags:        { scenario: 'policy_cache_warm' },
      env:         { SCENARIO: 'policy_cache_warm' },
    },
  },

  thresholds: {
    // Baseline must stay under configured p95 budget
    'req_dur_baseline_ms': [`p(95)<${BASELINE_P95_MS}`],
    // Policy path must stay within POLICY_HEADROOM_MS of baseline
    'req_dur_policy_ms':   [`p(95)<${POLICY_P95_BUDGET}`],
    // No masking applied to baseline entity fields
    'baseline_mask_leaks': ['count==0'],
    // HTTP error budget
    'http_req_failed':     ['rate<0.01'],
    // Success rate
    'field_sec_success_rate': ['rate>0.99'],
  },
};

// ── Default function ──────────────────────────────────────────────────────────

export default function () {
  const scenario = __ENV.SCENARIO;

  if (scenario === 'baseline')          runBaseline();
  else if (scenario === 'with_policy')  runWithPolicy();
  else if (scenario === 'policy_cache_warm') runWithPolicy(); // same code, warm cache
}

// ── Scenario implementations ──────────────────────────────────────────────────

function runBaseline() {
  const hdrs = headersA(ENV);
  const res  = http.get(
    `${ENV.BASE_URL}/records/${BASELINE_ENTITY}?limit=20`,
    { headers: hdrs, tags: { name: 'baseline_get' } },
  );

  const is2xx = res.status >= 200 && res.status < 300;
  successRate.add(is2xx ? 1 : 0);

  if (is2xx) {
    reqDurBaselineMs.add(res.timings.duration);

    const body  = safeParseJson(res.body);
    const items = body?.items ?? body?.data ?? (Array.isArray(body) ? body : []);

    // Field masking check: on the baseline entity, no field should be "[pii:*]" or "****"
    // If the middleware is incorrectly applied here, we catch it.
    let maskDetected = false;
    for (const item of items) {
      for (const val of Object.values(item ?? {})) {
        if (typeof val === 'string' && (val.startsWith('[pii:') || val.includes('****'))) {
          maskDetected = true;
          break;
        }
      }
      if (maskDetected) break;
    }
    if (maskDetected) baselineMaskLeaks.add(1);

    check(res, {
      'baseline 200':          (r) => r.status === 200,
      'no unexpected masking': () => !maskDetected,
    });
  }

  sleep(0.1);
}

function runWithPolicy() {
  const hdrs = headersA(ENV);
  const res  = http.get(
    `${ENV.BASE_URL}/records/${POLICY_ENTITY}?limit=20`,
    { headers: hdrs, tags: { name: 'policy_get' } },
  );

  const is2xx = res.status >= 200 && res.status < 300;
  successRate.add(is2xx ? 1 : 0);

  if (is2xx) {
    reqDurPolicyMs.add(res.timings.duration);

    const body  = safeParseJson(res.body);
    const items = body?.items ?? body?.data ?? (Array.isArray(body) ? body : []);

    // Field masking check: on the policy entity, at least one field should be masked.
    // If no masking occurs after policy is configured, the middleware isn't wired.
    // policyMaskMisses is informational — not a hard threshold.
    const hasAnyMask = items.some((item) =>
      Object.values(item ?? {}).some(
        (val) => val === null
               || (typeof val === 'string' && (val.startsWith('[pii:') || val.includes('****'))),
      ),
    );

    // Only flag a miss if the entity has records to mask (empty result is OK)
    if (items.length > 0 && !hasAnyMask) {
      policyMaskMisses.add(1);
      // This is a warning, not a hard failure — the entity may have no fields
      // configured with a masking policy, or the test principal is in access_roles.
    }

    check(res, {
      'policy entity 200':          (r) => r.status === 200,
      'response under budget':      (r) => r.timings.duration < POLICY_P95_BUDGET * 2, // 2× p95 per-request guard
      'masking applied or no rows': () => hasAnyMask || items.length === 0,
    });
  }

  sleep(0.1);
}

// ── Summary helper (called at end of test by k6) ──────────────────────────────

export function handleSummary(data) {
  const baseP50 = data.metrics['req_dur_baseline_ms']?.values?.['p(50)'] ?? 0;
  const baseP95 = data.metrics['req_dur_baseline_ms']?.values?.['p(95)'] ?? 0;
  const polP50  = data.metrics['req_dur_policy_ms']?.values?.['p(50)'] ?? 0;
  const polP95  = data.metrics['req_dur_policy_ms']?.values?.['p(95)'] ?? 0;

  const overheadP50 = (polP50 - baseP50).toFixed(2);
  const overheadP95 = (polP95 - baseP95).toFixed(2);

  const passP50 = (polP50 - baseP50) < POLICY_HEADROOM_MS;
  const passP95 = (polP95 - baseP95) < POLICY_HEADROOM_MS;

  const summary = {
    '43-07 Field Security Overhead': {
      baseline_p50_ms:     baseP50.toFixed(2),
      baseline_p95_ms:     baseP95.toFixed(2),
      policy_p50_ms:       polP50.toFixed(2),
      policy_p95_ms:       polP95.toFixed(2),
      overhead_p50_ms:     overheadP50,
      overhead_p95_ms:     overheadP95,
      policy_headroom_ms:  POLICY_HEADROOM_MS,
      pass_p50:            passP50,
      pass_p95:            passP95,
      overall_pass:        passP50 && passP95,
    },
  };

  console.log('\n──────────────────────────────────────────────');
  console.log(`43-07 Field Security Overhead Report`);
  console.log(`  Baseline  p50=${baseP50.toFixed(1)}ms  p95=${baseP95.toFixed(1)}ms`);
  console.log(`  Policy    p50=${polP50.toFixed(1)}ms  p95=${polP95.toFixed(1)}ms`);
  console.log(`  Overhead  p50=${overheadP50}ms  p95=${overheadP95}ms`);
  console.log(`  Target:   overhead < ${POLICY_HEADROOM_MS}ms`);
  console.log(`  Result:   ${passP50 && passP95 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('──────────────────────────────────────────────\n');

  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function safeParseJson(body) {
  try { return JSON.parse(body); } catch { return null; }
}
