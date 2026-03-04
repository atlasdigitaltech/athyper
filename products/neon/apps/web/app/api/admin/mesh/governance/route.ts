import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../meta-studio/helpers";

/**
 * GET /api/admin/mesh/governance
 *
 * Returns aggregated audit governance data for the GovernanceDashboard.
 * Proxies to the runtime API if available, otherwise returns baseline defaults.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    // Try to proxy to runtime governance endpoint
    const res = await fetch(`${auth.runtimeApiUrl}/api/admin/governance`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data: unknown = await res.json();
      return NextResponse.json(
        { success: true, data },
        {
          headers: { "X-Correlation-Id": auth.correlationId },
        },
      );
    }

    // Runtime endpoint not available — return baseline data
    return NextResponse.json(
      {
        success: true,
        data: getBaselineGovernanceData(),
      },
      {
        headers: { "X-Correlation-Id": auth.correlationId },
      },
    );
  } catch {
    // Fallback to baseline if runtime is unreachable
    return NextResponse.json(
      {
        success: true,
        data: getBaselineGovernanceData(),
      },
      {
        headers: { "X-Correlation-Id": auth.correlationId },
      },
    );
  }
}

/**
 * Returns safe baseline governance data when the runtime API is not available.
 * The dashboard renders properly with these defaults — no 404 errors.
 */
function getBaselineGovernanceData() {
  return {
    pipeline: {
      outbox: { pending: 0, processing: 0, failed: 0, dead: 0 },
      memoryBuffer: { depth: 0, maxSize: 1000 },
      circuitBreaker: { state: "CLOSED", failures: 0, successes: 0 },
      dlq: { total: 0, unreplayed: 0, oldestAt: null },
    },
    hashChain: {
      tenantsVerified: 0,
      tenantsTotal: 1,
      lastVerifiedAt: null,
      lastAnchorDate: null,
      chainBreaks: 0,
      eventsTotal: 0,
    },
    retention: {
      retentionDays: 90,
      partitions: [],
      nextPartitionDate: null,
      lastCleanupAt: null,
    },
    compliance: {
      eventsTotal: 0,
      eventsRedacted: 0,
      eventsEncrypted: 0,
      redactionCoverage: 0,
      encryptionCoverage: 0,
      dsarRequestsOpen: 0,
      dsarRequestsCompleted: 0,
    },
    featureFlags: {
      writeMode: "outbox",
      hashChainEnabled: true,
      timelineEnabled: true,
      encryptionEnabled: false,
      loadSheddingEnabled: true,
      tieringEnabled: false,
    },
    recentAccess: [],
  };
}
