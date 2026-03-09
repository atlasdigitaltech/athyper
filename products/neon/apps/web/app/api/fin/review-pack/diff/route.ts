/**
 * Snapshot Diff API — Phase 14
 *
 * GET /api/fin/review-pack/diff?baseId=...&compareId=...
 *   → Compare two review snapshots and return structured diff.
 *     Compares: readiness, blockers, sections, action items,
 *     decisions, carry-forward, overrides, commentary.
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET — compute diff
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);

    const baseId = url.searchParams.get("baseId");
    const compareId = url.searchParams.get("compareId");

    if (!baseId || !compareId) {
      return errorResponse("VALIDATION", "baseId and compareId are required", 400);
    }

    // Fetch both snapshots
    const [baseResult, compareResult] = await Promise.all([
      sql`
        SELECT id, snapshot_code, status, review_type,
               workspace_state, sections,
               readiness_score, phase, blocker_count,
               open_action_items, decision_count, carryforward_count,
               signed_off_by_name, signed_off_at,
               created_at
        FROM fin.review_snapshot
        WHERE id = ${baseId}::uuid AND tenant_id = ${tenantUuid}
      `.execute(db),
      sql`
        SELECT id, snapshot_code, status, review_type,
               workspace_state, sections,
               readiness_score, phase, blocker_count,
               open_action_items, decision_count, carryforward_count,
               signed_off_by_name, signed_off_at,
               created_at
        FROM fin.review_snapshot
        WHERE id = ${compareId}::uuid AND tenant_id = ${tenantUuid}
      `.execute(db),
    ]);

    const base = (baseResult.rows as any[])[0];
    const compare = (compareResult.rows as any[])[0];

    if (!base || !compare) {
      return errorResponse("NOT_FOUND", "One or both snapshots not found", 404);
    }

    const baseState = base.workspace_state as any;
    const compareState = compare.workspace_state as any;

    // Compute structured diff
    const diff = computeDiff(base, compare, baseState, compareState);

    return successResponse({ data: diff });
  } catch (error) {
    console.error("[GET /api/fin/review-pack/diff] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to compute snapshot diff");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

interface SnapshotDiff {
  base: { id: string; code: string; createdAt: string; status: string };
  compare: { id: string; code: string; createdAt: string; status: string };
  summary: {
    readinessChange: number;
    phaseChanged: boolean;
    blockersDelta: number;
    actionItemsDelta: number;
    decisionsDelta: number;
    carryForwardDelta: number;
    sectionsChanged: number;
    totalChanges: number;
  };
  readiness: {
    base: number; compare: number; delta: number;
    basePhase: string; comparePhase: string;
  };
  blockers: {
    added: string[];
    removed: string[];
    unchanged: string[];
  };
  sections: SectionDiff[];
  actionItems: ItemDiff;
  decisions: ItemDiff;
  carryForward: ItemDiff;
  overrides: {
    baseCount: number;
    compareCount: number;
    baseImpact: number;
    compareImpact: number;
  };
}

interface SectionDiff {
  sectionKey: string;
  title: string;
  status: "added" | "removed" | "changed" | "unchanged";
  baseBody?: string;
  compareBody?: string;
}

interface ItemDiff {
  added: { id: string; title: string; [key: string]: any }[];
  removed: { id: string; title: string; [key: string]: any }[];
  changed: { id: string; title: string; changes: string[] }[];
  baseCount: number;
  compareCount: number;
}

function computeDiff(
  base: any,
  compare: any,
  baseState: any,
  compareState: any,
): SnapshotDiff {
  // Readiness
  const readinessChange = (compare.readiness_score ?? 0) - (base.readiness_score ?? 0);
  const phaseChanged = base.phase !== compare.phase;

  // Blockers
  const baseBlockers: string[] = baseState?.blockers ?? [];
  const compareBlockers: string[] = compareState?.blockers ?? [];
  const addedBlockers = compareBlockers.filter((b: string) => !baseBlockers.includes(b));
  const removedBlockers = baseBlockers.filter((b: string) => !compareBlockers.includes(b));
  const unchangedBlockers = baseBlockers.filter((b: string) => compareBlockers.includes(b));

  // Sections
  const baseSections: any[] = (base.sections ?? []) as any[];
  const compareSections: any[] = (compare.sections ?? []) as any[];
  const baseSectionMap = new Map(baseSections.map((s: any) => [s.sectionKey, s]));
  const compareSectionMap = new Map(compareSections.map((s: any) => [s.sectionKey, s]));
  const allKeys = new Set([...baseSectionMap.keys(), ...compareSectionMap.keys()]);

  const sectionDiffs: SectionDiff[] = [];
  let sectionsChanged = 0;
  for (const key of allKeys) {
    const bs = baseSectionMap.get(key);
    const cs = compareSectionMap.get(key);
    if (!bs && cs) {
      sectionDiffs.push({ sectionKey: key, title: cs.title, status: "added", compareBody: cs.body });
      sectionsChanged++;
    } else if (bs && !cs) {
      sectionDiffs.push({ sectionKey: key, title: bs.title, status: "removed", baseBody: bs.body });
      sectionsChanged++;
    } else if (bs && cs && bs.body !== cs.body) {
      sectionDiffs.push({ sectionKey: key, title: cs.title, status: "changed", baseBody: bs.body, compareBody: cs.body });
      sectionsChanged++;
    } else if (bs && cs) {
      sectionDiffs.push({ sectionKey: key, title: cs.title, status: "unchanged" });
    }
  }

  // Action items diff
  const actionItemsDiff = diffItems(
    baseState?.actionItems ?? [],
    compareState?.actionItems ?? [],
    "status",
  );

  // Decisions diff
  const decisionsDiff = diffItems(
    baseState?.decisions ?? [],
    compareState?.decisions ?? [],
    "decision_type",
  );

  // Carry-forward diff
  const carryForwardDiff = diffItemsByField(
    baseState?.carryForward ?? [],
    compareState?.carryForward ?? [],
    "source_title",
    "resolved",
  );

  // Overrides
  const baseOverrides = baseState?.overrides ?? { active_count: 0, total_impact: 0 };
  const compareOverrides = compareState?.overrides ?? { active_count: 0, total_impact: 0 };

  const totalChanges =
    (readinessChange !== 0 ? 1 : 0) +
    (phaseChanged ? 1 : 0) +
    addedBlockers.length + removedBlockers.length +
    sectionsChanged +
    actionItemsDiff.added.length + actionItemsDiff.removed.length + actionItemsDiff.changed.length +
    decisionsDiff.added.length +
    carryForwardDiff.added.length + carryForwardDiff.removed.length;

  return {
    base: { id: base.id, code: base.snapshot_code, createdAt: base.created_at, status: base.status },
    compare: { id: compare.id, code: compare.snapshot_code, createdAt: compare.created_at, status: compare.status },
    summary: {
      readinessChange,
      phaseChanged,
      blockersDelta: compareBlockers.length - baseBlockers.length,
      actionItemsDelta: (compare.open_action_items ?? 0) - (base.open_action_items ?? 0),
      decisionsDelta: (compare.decision_count ?? 0) - (base.decision_count ?? 0),
      carryForwardDelta: (compare.carryforward_count ?? 0) - (base.carryforward_count ?? 0),
      sectionsChanged,
      totalChanges,
    },
    readiness: {
      base: base.readiness_score ?? 0,
      compare: compare.readiness_score ?? 0,
      delta: readinessChange,
      basePhase: base.phase ?? "",
      comparePhase: compare.phase ?? "",
    },
    blockers: { added: addedBlockers, removed: removedBlockers, unchanged: unchangedBlockers },
    sections: sectionDiffs,
    actionItems: actionItemsDiff,
    decisions: decisionsDiff,
    carryForward: carryForwardDiff,
    overrides: {
      baseCount: Number(baseOverrides.active_count),
      compareCount: Number(compareOverrides.active_count),
      baseImpact: Number(baseOverrides.total_impact),
      compareImpact: Number(compareOverrides.total_impact),
    },
  };
}

function diffItems(baseItems: any[], compareItems: any[], changeField: string): ItemDiff {
  const baseMap = new Map(baseItems.map((i: any) => [i.id, i]));
  const compareMap = new Map(compareItems.map((i: any) => [i.id, i]));

  const added = compareItems.filter((i: any) => !baseMap.has(i.id))
    .map((i: any) => ({ id: i.id, title: i.title ?? i.decision_type ?? "" }));
  const removed = baseItems.filter((i: any) => !compareMap.has(i.id))
    .map((i: any) => ({ id: i.id, title: i.title ?? i.decision_type ?? "" }));

  const changed: { id: string; title: string; changes: string[] }[] = [];
  for (const [id, baseItem] of baseMap.entries()) {
    const compareItem = compareMap.get(id);
    if (compareItem && baseItem[changeField] !== compareItem[changeField]) {
      changed.push({
        id,
        title: compareItem.title ?? "",
        changes: [`${changeField}: ${baseItem[changeField]} → ${compareItem[changeField]}`],
      });
    }
  }

  return {
    added, removed, changed,
    baseCount: baseItems.length,
    compareCount: compareItems.length,
  };
}

function diffItemsByField(baseItems: any[], compareItems: any[], titleField: string, changeField: string): ItemDiff {
  const baseMap = new Map(baseItems.map((i: any) => [i.id, i]));
  const compareMap = new Map(compareItems.map((i: any) => [i.id, i]));

  const added = compareItems.filter((i: any) => !baseMap.has(i.id))
    .map((i: any) => ({ id: i.id, title: i[titleField] ?? "" }));
  const removed = baseItems.filter((i: any) => !compareMap.has(i.id))
    .map((i: any) => ({ id: i.id, title: i[titleField] ?? "" }));

  const changed: { id: string; title: string; changes: string[] }[] = [];
  for (const [id, baseItem] of baseMap.entries()) {
    const compareItem = compareMap.get(id);
    if (compareItem && baseItem[changeField] !== compareItem[changeField]) {
      changed.push({
        id,
        title: compareItem[titleField] ?? "",
        changes: [`${changeField}: ${baseItem[changeField]} → ${compareItem[changeField]}`],
      });
    }
  }

  return {
    added, removed, changed,
    baseCount: baseItems.length,
    compareCount: compareItems.length,
  };
}
