"use client";

/**
 * SupplierIntakePage — wires useCompositeIntakeEngine into CompositeFlowWizard.
 *
 * Separated from page.tsx so the engine hook (which requires a bundle) is only
 * called once the bundle is available, avoiding conditional-hook violations.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useCompositeIntakeEngine,
  CompositeFlowWizard,
  CompletionSummaryPanel,
  DuplicateCheckBanner,
} from "@athyper/document-runtime/composite";
import type { CompositeFlowBundle } from "@athyper/document-runtime/composite";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SupplierIntakePageProps {
  bundle: CompositeFlowBundle;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierIntakePage({
  bundle,
  onCancel,
}: SupplierIntakePageProps) {
  const router  = useRouter();
  const engine  = useCompositeIntakeEngine(bundle);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dupBlocker, setDupBlocker]   = useState(false);

  const identifiers = (engine.state.childRows["identifiers"] ?? []) as Record<string, unknown>[];

  async function handleSubmit() {
    if (dupBlocker) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = engine.compositePayload();

      const res = await fetch("/api/relay/api/records/supplier/intake", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Idempotency-Key": engine.flowRunId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg  = (body["message"] as string | undefined) ?? `Error ${res.status}`;
        setSubmitError(msg);
        return;
      }

      const { supplier_id } = await res.json() as { supplier_id: string };

      // Clear the idempotency key from sessionStorage so a fresh visit gets a
      // new run ID (the old key is already consumed by the server).
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`composite-intake-flow-run-${bundle.flow_code}`);
      }

      router.push(`/app/supplier/${supplier_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const summarySlot = (
    <CompletionSummaryPanel report={engine.completionReport()} />
  );

  const reviewSlot = (
    <div className="space-y-4">
      <DuplicateCheckBanner
        flatFields={engine.state.flatFields}
        identifiers={identifiers}
        onBlockerChange={setDupBlocker}
      />

      {dupBlocker && (
        <p className="text-xs font-semibold text-destructive">
          Resolve exact-match duplicates above before submitting.
        </p>
      )}

      {submitError && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {submitError}
        </p>
      )}
    </div>
  );

  return (
    <CompositeFlowWizard
      bundle={bundle}
      engine={engine}
      userPermissions={bundle.user_permissions}
      summarySlot={summarySlot}
      reviewSlot={reviewSlot}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitting={submitting || dupBlocker}
      entityLabel="Supplier"
      entityCode="supplier"
    />
  );
}
