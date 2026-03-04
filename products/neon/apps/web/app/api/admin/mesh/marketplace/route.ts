import "server-only";

import { NextResponse } from "next/server";

import { requireAdminSession } from "../meta-studio/helpers";

function getBaselineMarketplaceData() {
  return {
    summary: {
      totalItems: 2,
      readyToPublish: 1,
      published: 0,
      needsAttention: 1,
      totalDownloads: 0,
      averageRating: null,
    },
    items: [
      {
        id: "mkt-stub-module-1",
        type: "module",
        code: "customer-portal",
        name: "Customer Portal Module",
        description:
          "Self-service portal for customers to manage accounts and orders",
        version: "1.0.0",
        publishingStatus: "ready",
        readinessScore: 92,
        checks: [
          {
            id: "chk-1",
            category: "metadata",
            name: "Module manifest",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
          {
            id: "chk-2",
            category: "documentation",
            name: "README present",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
          {
            id: "chk-3",
            category: "security",
            name: "No secrets in code",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
          {
            id: "chk-4",
            category: "testing",
            name: "Test coverage >80%",
            status: "warning",
            message: "Coverage at 78%",
            blocksPublish: false,
          },
          {
            id: "chk-5",
            category: "licensing",
            name: "License declared",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
        ],
        marketplaceStats: null,
        lastValidatedAt: "2026-02-18T14:00:00.000Z",
        publishedAt: null,
        updatedAt: "2026-02-18T14:00:00.000Z",
      },
      {
        id: "mkt-stub-tpl-1",
        type: "entity_template",
        code: "invoice-entity",
        name: "Invoice Entity Template",
        description:
          "Pre-configured invoice entity with standard fields and lifecycle",
        version: "0.9.0",
        publishingStatus: "draft",
        readinessScore: 55,
        checks: [
          {
            id: "chk-6",
            category: "metadata",
            name: "Template manifest",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
          {
            id: "chk-7",
            category: "documentation",
            name: "README present",
            status: "failed",
            message: "Missing README.md",
            blocksPublish: true,
          },
          {
            id: "chk-8",
            category: "security",
            name: "No secrets in code",
            status: "passed",
            message: null,
            blocksPublish: true,
          },
          {
            id: "chk-9",
            category: "testing",
            name: "Test coverage >80%",
            status: "failed",
            message: "No tests found",
            blocksPublish: false,
          },
          {
            id: "chk-10",
            category: "licensing",
            name: "License declared",
            status: "pending",
            message: "Not yet validated",
            blocksPublish: true,
          },
        ],
        marketplaceStats: null,
        lastValidatedAt: null,
        publishedAt: null,
        updatedAt: "2026-02-17T09:00:00.000Z",
      },
    ],
  };
}

/**
 * GET /api/admin/mesh/marketplace
 * Returns marketplace readiness data: summary + publishable items with checks.
 */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const res = await fetch(`${auth.runtimeApiUrl}/api/marketplace/readiness`, {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Tenant-Id": auth.tenantId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(getBaselineMarketplaceData(), {
        headers: {
          "X-Correlation-Id": auth.correlationId,
          "X-Stub-Response": "true",
        },
      });
    }

    const data: unknown = await res.json();
    return NextResponse.json(
      typeof data === "object" && data !== null
        ? data
        : { summary: {}, items: [] },
      { headers: { "X-Correlation-Id": auth.correlationId } },
    );
  } catch {
    return NextResponse.json(getBaselineMarketplaceData(), {
      headers: {
        "X-Correlation-Id": auth.correlationId,
        "X-Stub-Response": "true",
      },
    });
  }
}
