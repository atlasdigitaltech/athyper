/**
 * @route GET /api/document-runtime/<entity>/rules
 *
 * Field-rule + action-rule projection (Cleanup Plan v5 §4.7 + §5.7 +
 * amendment 9).
 *
 * Single endpoint that returns BOTH:
 *   - field_rules:  { <field_name>: { editable_in_status: string[] } }
 *   - action_rules: { <action_code>: { <status>: { capability, reason, required_permission } } }
 *
 * Open decision O1 in v5 §9 resolves to "single endpoint" — fewer
 * round-trips per page mount; rules change rarely so caching is easy.
 *
 * ─── Authz gates ──────────────────────────────────────────────────────
 *   1. Session — 401 if unauthenticated
 *   2. Entity descriptor — 404 ENTITY_NOT_FOUND when entity isn't
 *      visible in the active plane (prevents probing arbitrary entities)
 *   3. Forward — fetch entity_field + entity_action_rule via backend
 *      records API; backend enforces tenant scope + RLS.
 */

import { NextResponse } from "next/server";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

const FETCH_PAGE_SIZE = 500;

// ─── Public response shapes ───────────────────────────────────────────

interface FieldRuleProjection {
  editable_in_status: string[];
}

interface ActionRuleProjection {
  capability:          "allowed" | "denied" | "requires_permission";
  required_permission: string | null;
  reason:              string | null;
}

interface DocumentRulesResponse {
  ok:           true;
  entity:       string;
  field_rules:  Record<string, FieldRuleProjection>;
  action_rules: Record<string, Record<string, ActionRuleProjection>>;
}

// ─── Route handler ────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");

  // ── Gate 1: Session ──────────────────────────────────────────────────
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load rules." },
      { status: 401 },
    );
  }

  const upstreamHeaders = buildRuntimeHeaders(session);

  // ── Gate 2: Entity registered for active plane ───────────────────────
  // Prevents probing arbitrary entities through this generic endpoint.
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      {
        error: "ENTITY_NOT_FOUND",
        message: `Entity '${entityCode}' not registered for the active plane.`,
      },
      { status: 404 },
    );
  }

  // ── Fetch fields + action rules in parallel ──────────────────────────
  const [fieldRows, actionRuleRows] = await Promise.all([
    fetchAll("entity_field", { entity_code: entityCode }, upstreamHeaders),
    fetchAll("entity_action_rule", { entity_code: entityCode }, upstreamHeaders),
  ]);

  // ── Project ──────────────────────────────────────────────────────────
  const field_rules:  Record<string, FieldRuleProjection> = {};
  for (const row of fieldRows) {
    const flat = flattenRecord(row);
    const name = readString(flat, "name") || readString(flat, "field_name");
    if (!name) continue;
    const editableRaw = flat["editable_in_status"];
    const statuses: string[] = Array.isArray(editableRaw)
      ? editableRaw.filter((s): s is string => typeof s === "string")
      : [];
    if (statuses.length === 0) continue;
    field_rules[name] = { editable_in_status: statuses };
  }

  const action_rules: Record<string, Record<string, ActionRuleProjection>> = {};
  for (const row of actionRuleRows) {
    const flat = flattenRecord(row);
    const action_code = readString(flat, "action_code");
    const status = readString(flat, "status");
    const capability = readCapability(flat["capability"]);
    if (!action_code || !status || !capability) continue;
    const bucket = action_rules[action_code] ?? {};
    bucket[status] = {
      capability,
      required_permission: readNullableString(flat, "required_permission"),
      reason:              readNullableString(flat, "reason"),
    };
    action_rules[action_code] = bucket;
  }

  const body: DocumentRulesResponse = {
    ok:           true,
    entity:       entityCode,
    field_rules,
    action_rules,
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=60", // 60-second cache for hot page
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function fetchAll(
  entityCode: string,
  filters: Record<string, string>,
  headers: Record<string, string>,
): Promise<RuntimeRecordRow[]> {
  const collected: RuntimeRecordRow[] = [];
  let page = 1;
  // Rules tables are small; loop to safety cap.
  while (page <= 10) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) params.append(`filter.${k}`, v);
    params.append("page_size", String(FETCH_PAGE_SIZE));
    params.append("page", String(page));
    const upstream = await fetch(
      buildRuntimeUrl(`/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`),
      { headers, cache: "no-store" },
    );
    if (!upstream.ok) break;
    const body = await upstream.json().catch(() => null) as {
      records?: RuntimeRecordRow[];
      pagination?: { total_pages?: number };
      isFullyLoaded?: boolean;
    } | null;
    const rows = Array.isArray(body?.records) ? body!.records! : [];
    collected.push(...rows);
    if (body?.isFullyLoaded === true) break;
    if (rows.length < FETCH_PAGE_SIZE) break;
    const totalPages = body?.pagination?.total_pages;
    if (totalPages == null || page >= totalPages) break;
    page += 1;
  }
  return collected;
}

function flattenRecord(record: RuntimeRecordRow): Record<string, unknown> {
  const data = record.data && typeof record.data === "object" ? record.data : {};
  return { ...record, ...(data as Record<string, unknown>) };
}

function readString(record: Record<string, unknown>, field: string): string {
  const v = record[field];
  return typeof v === "string" ? v : "";
}

function readNullableString(record: Record<string, unknown>, field: string): string | null {
  const v = record[field];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readCapability(value: unknown): ActionRuleProjection["capability"] | null {
  if (value === "allowed" || value === "denied" || value === "requires_permission") return value;
  return null;
}
