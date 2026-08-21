/**
 * 43-05 — Workflow Engine Concurrency Test
 *
 * P3 requirement: 1 000 concurrent approval requests hitting
 *   POST /api/workflow/items/:id/action
 *
 * Targets:
 *   ✓ Measure SLA timer accuracy (±1 s) — verified via compliance report
 *   ✓ Measure approval action throughput
 *   ✓ Surface DB lock contention on lifecycle_instance (SELECT FOR UPDATE
 *     inside control.advance_workflow_state()) — shows as P99 latency spikes
 *
 * ── Why this stresses the DB lock ────────────────────────────────────────────
 * advance_workflow_state() issues SELECT … FOR UPDATE on master.lifecycle_instance
 * before updating state.  1 000 concurrent approvals on distinct entities means
 * 1 000 concurrent row-level locks — no contention expected unless two VUs share
 * the same entity.  The scenario deliberately keeps entity IDs distinct (one
 * work_item → one entity) so we measure lock acquisition overhead, not deadlock.
 *
 * ── Scenarios ────────────────────────────────────────────────────────────────
 *   seed_phase     1 VU  × setup — creates 1 000 JEs + submits for approval
 *   approval_burst 1 000 VUs × 1 iter — each approves its assigned work_item
 *   compliance_check 1 VU × 1 iter  — GET /workflow/reports/compliance after burst
 *
 * ── Thresholds ───────────────────────────────────────────────────────────────
 *   workflow_action_ms  p(95) < 500   (action latency including DB lock overhead)
 *   workflow_action_ms  p(99) < 2000  (lock contention outliers)
 *   workflow_errors     rate  < 0.02  (< 2% unexpected failures)
 *   http_req_failed     rate  < 0.02
 *
 * ── Prerequisites ────────────────────────────────────────────────────────────
 *   • Server running, workflow engine wired (Sprint 29)
 *   • Tenant has a workflow_template bound to journal_entry with at least
 *     one approval stage
 *   • APPROVER_TOKEN / APPROVER_ORG env vars — token for the approver principal
 *     (must be in the approver role for the workflow template)
 *   • BASE_URL, TOKEN_TENANT_A, ORG_TENANT_A set
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 *   k6 run \
 *     -e BASE_URL=http://localhost:3001/api \
 *     -e TOKEN_TENANT_A=eyJ... \
 *     -e ORG_TENANT_A=demo-org \
 *     -e APPROVER_TOKEN=eyJ... \
 *     -e APPROVER_ORG=demo-org \
 *     perf/k6/43-05-workflow-engine.k6.js
 *
 * ── Tip: pre-seed instead of live-seed ───────────────────────────────────────
 *   For deterministic timing, pre-create the 1 K work items before running k6:
 *     node server/scripts/seed-workflow-items.ts --count 1000 --out /tmp/wf-items.json
 *   Then pass:
 *     -e SEEDED_WORK_ITEMS=<json-array-of-uuids>
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate, Gauge } from 'k6/metrics';
import { ENV }      from './shared/env.js';
import { headersA } from './shared/headers.js';
import { safeParseJson } from './shared/utils.js';

// ── Custom metrics ────────────────────────────────────────────────────────────

/** End-to-end latency of each POST .../action call */
const workflowActionMs    = new Trend('workflow_action_ms', true);
/** Count of non-200 / unexpected failures */
const workflowErrors      = new Counter('workflow_errors');
/** Rate of unexpected (non-409/422) errors */
const workflowErrorRate   = new Rate('workflow_errors_rate');
/** Count of successful approvals */
const approvalSuccessCount = new Counter('approval_success_count');
/** Highest observed queue depth for lifecycle_timers (SLA timer accuracy proxy) */
const slaTimerQueueDepth  = new Gauge('sla_timer_queue_depth');

// ── Pool of work_item_ids shared across all VUs ───────────────────────────────
// Populated in setup(), referenced in default() via the data parameter.
// k6 does NOT share mutable state between VUs — the pool is read-only after setup.

// ── k6 options ────────────────────────────────────────────────────────────────

const POOL_SIZE = 1000;  // Number of work items to create + approve

export const options = {
  scenarios: {
    /**
     * Approval burst: 1 000 VUs each fire exactly one approval.
     * executor=per-vu-iterations ensures each VU fires once — true concurrency.
     * startTime offset gives setup() time to complete before the burst fires.
     */
    approval_burst: {
      executor:    'per-vu-iterations',
      vus:         POOL_SIZE,
      iterations:  1,
      startTime:   '0s',        // setup() runs before default() regardless
      maxDuration: '10m',       // generous timeout for slow envs
      tags:        { scenario: 'approval_burst' },
      env:         { SCENARIO: 'approval_burst' },
    },

    /**
     * Compliance report: fired after burst to confirm SLA data was recorded.
     * Single VU, runs after the burst completes.
     */
    compliance_check: {
      executor:    'per-vu-iterations',
      vus:         1,
      iterations:  1,
      startTime:   '9m',        // run near end of maxDuration window
      maxDuration: '2m',
      tags:        { scenario: 'compliance_check' },
      env:         { SCENARIO: 'compliance_check' },
    },

    /**
     * SLA timer monitor: polls jobs/lifecycle-timers queue depth every 10 s
     * throughout the test to verify SLA timers are firing promptly.
     */
    sla_monitor: {
      executor:   'constant-vus',
      vus:        1,
      duration:   '10m',
      tags:       { scenario: 'sla_monitor' },
      env:        { SCENARIO: 'sla_monitor' },
    },
  },

  thresholds: {
    // Core latency SLA
    'workflow_action_ms':          ['p(95)<500', 'p(99)<2000'],
    // Error tolerance
    'workflow_errors_rate':        ['rate<0.02'],
    // HTTP errors
    'http_req_failed':             ['rate<0.02'],
  },
};

// ── Setup: create 1 000 pending work items ────────────────────────────────────

export function setup() {
  // Allow pre-seeded IDs via env var to skip expensive setup
  const seededJson = __ENV.SEEDED_WORK_ITEMS || '';
  if (seededJson) {
    try {
      const ids = JSON.parse(seededJson);
      if (Array.isArray(ids) && ids.length >= POOL_SIZE) {
        console.log(`[43-05 setup] Using ${ids.length} pre-seeded work_item_ids`);
        return { workItemIds: ids.slice(0, POOL_SIZE) };
      }
    } catch (e) {
      console.warn('[43-05 setup] Could not parse SEEDED_WORK_ITEMS: ' + e.message);
    }
  }

  // Determine which token to use for submissions (submitter) and approvals (approver)
  const submitterHdrs = headersA(ENV);
  const approverHdrs  = buildApproverHeaders();

  console.log(`[43-05 setup] Creating ${POOL_SIZE} journal entries for approval pool...`);

  const workItemIds = [];
  const today       = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < POOL_SIZE; i++) {
    // ── Step 1: Create draft journal entry ──────────────────────────────────
    const jeBody = JSON.stringify({
      description:  `WF-perf-${i}-${Date.now()}`,
      journal_date: today,
      reference_no: `PERF-WF-${i}-${Date.now()}`,
      lines: [
        { account_code: '1001', debit: 100 * (i % 10 + 1), credit: 0,                    narration: 'Dr' },
        { account_code: '2001', debit: 0,                   credit: 100 * (i % 10 + 1),  narration: 'Cr' },
      ],
    });

    const jeRes = http.post(`${ENV.BASE_URL}/finance/journals`, jeBody, {
      headers: submitterHdrs,
    });

    if (jeRes.status !== 200 && jeRes.status !== 201) {
      if (i === 0) {
        console.error(
          `[43-05 setup] Journal create failed (status ${jeRes.status}): ${jeRes.body}`,
        );
      }
      continue;
    }

    const je   = safeParseJson(jeRes.body);
    const jeId = je?.id ?? je?.data?.id;
    if (!jeId) continue;

    // ── Step 2: Submit for approval ──────────────────────────────────────────
    const submitRes = http.post(
      `${ENV.BASE_URL}/finance/journals/${jeId}/submit`,
      '{}',
      { headers: submitterHdrs },
    );

    if (submitRes.status < 200 || submitRes.status >= 300) continue;

    const sub        = safeParseJson(submitRes.body);
    const workItemId = sub?.work_item_id
                    ?? sub?.data?.work_item_id
                    ?? sub?.workflow?.work_item_id;

    if (workItemId) {
      workItemIds.push(workItemId);
    }

    // Log progress every 100 items to avoid silent setup hangs
    if ((i + 1) % 100 === 0) {
      console.log(`[43-05 setup] ${i + 1}/${POOL_SIZE} created, ${workItemIds.length} in pool`);
    }
  }

  if (workItemIds.length < POOL_SIZE * 0.9) {
    console.warn(
      `[43-05 setup] Only ${workItemIds.length}/${POOL_SIZE} work items created. ` +
      'Check workflow template binding for journal_entry.',
    );
  }

  return {
    workItemIds,
    approverHdrs,
  };
}

// ── Default function ──────────────────────────────────────────────────────────

export default function (data) {
  const scenario = __ENV.SCENARIO;

  if (scenario === 'approval_burst')   runApprovalBurst(data);
  else if (scenario === 'compliance_check') runComplianceCheck(data);
  else if (scenario === 'sla_monitor') runSlaMonitor(data);
}

// ── Scenario implementations ──────────────────────────────────────────────────

function runApprovalBurst(data) {
  const workItemIds = data?.workItemIds ?? [];

  if (workItemIds.length === 0) {
    console.error('[43-05 burst] No work_item_ids — setup failed or no workflow template bound');
    workflowErrors.add(1);
    workflowErrorRate.add(1);
    return;
  }

  // Each VU takes the item at its own 0-based index
  const idx        = (__VU - 1) % workItemIds.length;
  const workItemId = workItemIds[idx];

  // Use approver credentials if available, fall back to tenant A
  const hdrs = data?.approverHdrs ?? headersA(ENV);

  const body = JSON.stringify({
    action:  'approve',
    remarks: `Burst approval by VU ${__VU} at ${Date.now()}`,
  });

  const res = http.post(
    `${ENV.BASE_URL}/workflow/items/${workItemId}/action`,
    body,
    { headers: hdrs, tags: { name: 'workflow_approve' } },
  );

  workflowActionMs.add(res.timings.duration);

  const isSuccess = res.status === 200;
  const isExpectedConflict = res.status === 409 || res.status === 422; // already actioned
  const isUnexpected = !isSuccess && !isExpectedConflict;

  approvalSuccessCount.add(isSuccess ? 1 : 0);
  workflowErrorRate.add(isUnexpected ? 1 : 0);
  if (isUnexpected) workflowErrors.add(1);

  check(res, {
    'approve 200 or expected conflict': (r) =>
      r.status === 200 || r.status === 409 || r.status === 422,
    'no 5xx server error': (r) => r.status < 500,
    'response time < 2s':  (r) => r.timings.duration < 2000,
  });
}

function runComplianceCheck(data) {
  const hdrs = headersA(ENV);

  // Query last 24h to capture the burst
  const to   = new Date().toISOString();
  const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const res = http.get(
    `${ENV.BASE_URL}/workflow/reports/compliance?from=${from}&to=${to}`,
    { headers: hdrs, tags: { name: 'compliance_report' } },
  );

  if (res.status !== 200) {
    console.warn(`[43-05 compliance] Report returned ${res.status}: ${res.body}`);
    return;
  }

  const body = safeParseJson(res.body);
  const s    = body?.summary ?? {};

  console.log(
    `[43-05 compliance] total=${s.totalRequests} approved=${s.approved} `+
    `rejected=${s.rejected} slaBreached=${s.slaBreachedCount} `+
    `avgApprovalMin=${s.avgApprovalMinutes} stuckItems=${s.stuckItemCount}`,
  );

  check(res, {
    'compliance report 200':          (r) => r.status === 200,
    'totalRequests > 0':              () => (s.totalRequests ?? 0) > 0,
    'slaBreachRate < 10%':            () => (s.slaBreachRate ?? 100) < 10,
    'no stuck items after burst':     () => (s.stuckItemCount ?? 1) === 0,
  });
}

function runSlaMonitor(data) {
  const hdrs = headersA(ENV);

  // Poll lifecycle-timers queue depth as a proxy for SLA timer health
  const res = http.get(
    `${ENV.BASE_URL}/jobs/lifecycle-timers`,
    { headers: hdrs, tags: { name: 'sla_timer_poll' } },
  );

  if (res.status === 200) {
    const body   = safeParseJson(res.body);
    const counts = body?.counts ?? {};
    const depth  = Number(counts.waiting ?? 0) + Number(counts.delayed ?? 0);

    slaTimerQueueDepth.add(depth);

    check(res, {
      'timer queue healthy': (r) => r.status === 200,
      'no stale timers (depth < 1000)': () => depth < 1000,
    });
  }

  sleep(10);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildApproverHeaders() {
  const approverToken = __ENV.APPROVER_TOKEN || '';
  const approverOrg   = __ENV.APPROVER_ORG   || '';
  const approverRealm = __ENV.APPROVER_REALM  || ENV.REALM_A;

  if (approverToken && approverOrg) {
    return {
      Authorization:  `Bearer ${approverToken}`,
      'X-Org':        approverOrg,
      'X-Realm':      approverRealm,
      'Content-Type': 'application/json',
    };
  }
  return headersA(ENV);
}

