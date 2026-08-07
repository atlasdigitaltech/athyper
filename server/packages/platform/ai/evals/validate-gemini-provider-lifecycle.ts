import { readFileSync } from "node:fs";

import { z } from "zod";

const IsoDateSchema = z.iso.date();

export const GeminiProviderLifecycleSchema = z.object({
  manifest_id: z.literal("atlas-gemini-provider-lifecycle"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  selected_binding: z.object({
    binding_id: z.literal("atlas-gemini-eval"),
    model_id: z.literal("gemini-3.6-flash"),
    lifecycle_status: z.literal("stable_ga"),
    released_on: IsoDateSchema,
    published_shutdown_on: IsoDateSchema.nullable(),
    api_surface: z.literal("interactions"),
    endpoint_version: z.literal("v1beta"),
    sdk_package: z.literal("@google/genai"),
    sdk_version: z.literal("2.13.0"),
  }).strict(),
  review: z.object({
    reviewed_on: IsoDateSchema,
    due_on: IsoDateSchema,
    owner_role: z.string().min(3).max(100),
    approver_roles: z.array(z.string().min(2).max(100)).min(1),
    source_urls: z.array(z.url()).min(3),
  }).strict(),
  replacement_rehearsal: z.object({
    status: z.enum(["not_run", "passed", "failed"]),
    due_on: IsoDateSchema,
    owner_role: z.string().min(3).max(100),
    required_evidence: z.array(z.string().min(10).max(250)).min(5),
  }).strict(),
  blocked_model_ids: z.array(z.string().regex(/^gemini-/)).min(1),
  watched_retirements: z.array(z.object({
    model_id: z.string().regex(/^gemini-/),
    earliest_shutdown_on: IsoDateSchema,
    action: z.string().min(10).max(250),
  }).strict()).min(1),
}).strict();

export type GeminiProviderLifecycle = z.infer<
  typeof GeminiProviderLifecycleSchema
>;

export interface GeminiLifecycleAlert {
  severity: "warning" | "blocking";
  code:
    | "selected_model_is_blocked"
    | "model_lifecycle_review_due"
    | "model_lifecycle_review_overdue"
    | "replacement_rehearsal_due"
    | "replacement_rehearsal_overdue"
    | "selected_model_shutdown_near";
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const DUE_WARNING_DAYS = 7;
const SHUTDOWN_WARNING_DAYS = 90;

export function loadGeminiProviderLifecycle(
  sourceUrl: URL = new URL(
    "./gemini-provider-lifecycle-v1.json",
    import.meta.url,
  ),
): GeminiProviderLifecycle {
  const parsed: unknown = JSON.parse(readFileSync(sourceUrl, "utf8"));
  return validateGeminiProviderLifecycle(parsed);
}

export function validateGeminiProviderLifecycle(
  value: unknown,
): GeminiProviderLifecycle {
  const manifest = GeminiProviderLifecycleSchema.parse(value);

  if (manifest.review.reviewed_on > manifest.review.due_on) {
    throw new Error("Gemini lifecycle review due date precedes review date");
  }
  if (
    new Set(manifest.blocked_model_ids).size
    !== manifest.blocked_model_ids.length
  ) {
    throw new Error("Gemini blocked model IDs must be unique");
  }
  if (
    new Set(manifest.watched_retirements.map((item) => item.model_id)).size
    !== manifest.watched_retirements.length
  ) {
    throw new Error("Gemini watched retirement model IDs must be unique");
  }

  return manifest;
}

export function evaluateGeminiLifecycleAlerts(
  manifest: GeminiProviderLifecycle,
  asOf: Date = new Date(),
): GeminiLifecycleAlert[] {
  const alerts: GeminiLifecycleAlert[] = [];
  const today = utcDateOnly(asOf);

  if (manifest.blocked_model_ids.includes(manifest.selected_binding.model_id)) {
    alerts.push({
      severity: "blocking",
      code: "selected_model_is_blocked",
      message:
        `Selected Gemini model ${manifest.selected_binding.model_id} is explicitly blocked`,
    });
  }

  addDueDateAlert(
    alerts,
    today,
    manifest.review.due_on,
    "model_lifecycle_review_due",
    "model_lifecycle_review_overdue",
    "Gemini model lifecycle review",
  );

  if (manifest.replacement_rehearsal.status !== "passed") {
    addDueDateAlert(
      alerts,
      today,
      manifest.replacement_rehearsal.due_on,
      "replacement_rehearsal_due",
      "replacement_rehearsal_overdue",
      "Gemini replacement rehearsal",
    );
  }

  if (manifest.selected_binding.published_shutdown_on) {
    const days = daysUntil(
      today,
      manifest.selected_binding.published_shutdown_on,
    );
    if (days <= SHUTDOWN_WARNING_DAYS) {
      alerts.push({
        severity: days < 0 ? "blocking" : "warning",
        code: "selected_model_shutdown_near",
        message:
          `Selected Gemini model shutdown is ${days < 0 ? "overdue" : `in ${days} days`}`,
      });
    }
  }

  return alerts;
}

function addDueDateAlert(
  alerts: GeminiLifecycleAlert[],
  today: string,
  dueOn: string,
  dueCode: GeminiLifecycleAlert["code"],
  overdueCode: GeminiLifecycleAlert["code"],
  label: string,
): void {
  const days = daysUntil(today, dueOn);
  if (days < 0) {
    alerts.push({
      severity: "blocking",
      code: overdueCode,
      message: `${label} is overdue by ${Math.abs(days)} days`,
    });
  } else if (days <= DUE_WARNING_DAYS) {
    alerts.push({
      severity: "warning",
      code: dueCode,
      message: `${label} is due in ${days} days`,
    });
  }
}

function daysUntil(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.floor((to - from) / DAY_MS);
}

function utcDateOnly(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Gemini lifecycle alert date is invalid");
  }
  return value.toISOString().slice(0, 10);
}
