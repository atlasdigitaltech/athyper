"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@athyper/ui/layout";
import { Button } from "@athyper/ui/primitives";
import { getCsrfToken } from "@/lib/bff-fetch";
import { FlowWizard, FlowWizardSkeleton } from "@athyper/document-runtime/intake";
import {
  CompositeFlowWizard,
  CompletionSummaryPanel,
  DuplicateCheckBanner,
  useCompositeIntakeEngine,
  type CompositeFlowBundle,
} from "@athyper/document-runtime/composite";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import type { EntityIntakeMode } from "@athyper/entity-runtime/intake";

interface EntityModeFlowProps {
  mode: EntityIntakeMode;
  hostEntityCode: string;
  hostEntityLabel: string;
  backHref?: string;
  duplicateEntityLabel?: string;
  initialValues?: Record<string, unknown>;
  roleModeCodes?: string[];
}

export default function EntityModeFlow({
  mode,
  hostEntityCode,
  hostEntityLabel,
  backHref,
  duplicateEntityLabel,
  initialValues,
  roleModeCodes,
}: EntityModeFlowProps) {
  const router = useRouter();
  const flowEntity = mode.flow_entity ?? (mode.code === "extension" ? hostEntityCode : mode.code);
  const flowCode = mode.flow_code;
  const resolvedBackHref = backHref ?? `/app/${hostEntityCode}/new`;

  const { data: bundle, isLoading } = useQuery({
    queryKey: ["entity-mode-flow", hostEntityCode, flowEntity, flowCode],
    queryFn: async (): Promise<CompositeFlowBundle | null> => {
      if (!flowEntity || !flowCode) return null;
      const res = await fetch(
        `/api/relay/api/metadata/entities/${encodeURIComponent(flowEntity)}/flow?flow_code=${encodeURIComponent(flowCode)}`,
      );
      if (!res.ok) return null;
      return unwrapFlowBundle(await res.json());
    },
    enabled: Boolean(flowEntity && flowCode),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const persistenceMode = String(
    bundle?.config?.persistence_mode ?? mode.persistence_mode ?? "",
  );

  if (isLoading) return <FlowWizardSkeleton />;

  if (!bundle) {
    return (
      <PageFrame title={mode.label} description="The metadata flow is not available yet.">
        <Button size="sm" variant="outline" onClick={() => router.push(resolvedBackHref)}>
          Back
        </Button>
      </PageFrame>
    );
  }

  if (persistenceMode.startsWith("composite_")) {
    return (
      <CompositeEntityModeFlow
        bundle={bundle}
        hostEntityCode={hostEntityCode}
        hostEntityLabel={hostEntityLabel}
        persistenceMode={persistenceMode}
        duplicateEntityLabel={duplicateEntityLabel}
        onCancel={() => router.push(resolvedBackHref)}
      />
    );
  }

  return (
    <EntityFlowWizard
      bundle={bundle as unknown as FlowBundle}
      mode={mode}
      hostEntityCode={hostEntityCode}
      hostEntityLabel={hostEntityLabel}
      persistenceMode={persistenceMode}
      initialValues={initialValues}
      roleModeCodes={roleModeCodes}
      onCancel={() => router.push(resolvedBackHref)}
    />
  );
}

function EntityFlowWizard({
  bundle,
  mode,
  hostEntityCode,
  hostEntityLabel,
  persistenceMode,
  initialValues,
  roleModeCodes,
  onCancel,
}: {
  bundle: FlowBundle;
  mode: EntityIntakeMode;
  hostEntityCode: string;
  hostEntityLabel: string;
  persistenceMode: string;
  initialValues?: Record<string, unknown>;
  roleModeCodes?: string[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const role = roleModeCodes?.includes(mode.code) ? mode.code : undefined;
  const endpoint = resolvePersistenceEndpoint(persistenceMode, hostEntityCode, mode);

  async function handleSubmit(draft: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({
          persistence_mode: persistenceMode,
          role,
          draft,
        }),
      });

      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((body["message"] as string | undefined) ?? `Error ${res.status}`);
      }

      router.push(resolveRecordHref(body, hostEntityCode));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FlowWizard
      bundle={bundle}
      userPermissions={bundle.user_permissions}
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitting={submitting}
      entityCode={hostEntityCode}
      entityLabel={hostEntityLabel}
    />
  );
}

function CompositeEntityModeFlow({
  bundle,
  hostEntityCode,
  hostEntityLabel,
  persistenceMode,
  duplicateEntityLabel,
  onCancel,
}: {
  bundle: CompositeFlowBundle;
  hostEntityCode: string;
  hostEntityLabel: string;
  persistenceMode: string;
  duplicateEntityLabel?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const engine = useCompositeIntakeEngine(bundle);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dupBlocker, setDupBlocker] = useState(false);
  const [dupChecking, setDupChecking] = useState(false);
  const endpoint = resolvePersistenceEndpoint(persistenceMode, hostEntityCode);
  const resolvedDuplicateLabel = duplicateEntityLabel ?? `${hostEntityLabel.toLowerCase()}s`;

  const identifiers = useMemo(
    () => (engine.state.childRows["identifiers"] ?? []) as Record<string, unknown>[],
    [engine.state.childRows],
  );

  async function handleSubmit() {
    if (dupBlocker || dupChecking) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = engine.compositePayload();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
          "Idempotency-Key": engine.flowRunId,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setSubmitError((body["message"] as string | undefined) ?? `Error ${res.status}`);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`composite-intake-flow-run-${bundle.flow_code}`);
      }

      router.push(resolveRecordHref(body, hostEntityCode));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const completionReport = engine.completionReport();
  const currentStepReport = engine.currentStep.step_key === "review"
    ? completionReport
    : completionReport.filter((item) => item.step_key === engine.currentStep.step_key);

  const summarySlot = (
    <CompletionSummaryPanel report={currentStepReport} title="Step Completion" />
  );

  const duplicateGate = (
    <DuplicateCheckBanner
      flatFields={engine.state.flatFields}
      identifiers={identifiers}
      entityLabel={resolvedDuplicateLabel}
      debounceMs={300}
      onBlockerChange={setDupBlocker}
      onCheckingChange={setDupChecking}
      reserveSpace
    />
  );

  const reviewSlot = (
    <div className="space-y-4">
      <DuplicateCheckBanner
        flatFields={engine.state.flatFields}
        identifiers={identifiers}
        entityLabel={resolvedDuplicateLabel}
        debounceMs={300}
        onBlockerChange={setDupBlocker}
        onCheckingChange={setDupChecking}
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
      submitting={submitting}
      primaryActionDisabled={dupBlocker || dupChecking}
      stepSlots={{ identify: duplicateGate }}
      entityLabel={hostEntityLabel}
      entityCode={hostEntityCode}
    />
  );
}

function resolvePersistenceEndpoint(
  persistenceMode: string,
  hostEntityCode: string,
  mode?: EntityIntakeMode,
): string {
  const compositeMatch = /^composite_(.+)_intake$/.exec(persistenceMode);
  if (compositeMatch?.[1]) {
    return `/api/relay/api/records/${encodeURIComponent(compositeMatch[1])}/intake`;
  }

  const extensionMatch = /^(.+)_extension$/.exec(persistenceMode);
  if (extensionMatch?.[1]) {
    return `/api/relay/api/records/${encodeURIComponent(extensionMatch[1])}/extend`;
  }

  const intakeMatch = /^(.+)_intake$/.exec(persistenceMode);
  if (intakeMatch?.[1]) {
    return `/api/relay/api/records/${encodeURIComponent(intakeMatch[1])}/intake`;
  }

  const fallbackEntity = mode?.flow_entity ?? hostEntityCode;
  return `/api/relay/api/records/${encodeURIComponent(fallbackEntity)}/intake`;
}

function unwrapFlowBundle(json: unknown): CompositeFlowBundle {
  if (json && typeof json === "object" && "bundle" in json) {
    const bundle = (json as { bundle?: unknown }).bundle;
    if (bundle && typeof bundle === "object") {
      return bundle as CompositeFlowBundle;
    }
  }
  return json as CompositeFlowBundle;
}

function resolveRecordHref(body: Record<string, unknown>, hostEntityCode: string): string {
  const recordId = body[`${hostEntityCode}_id`] ?? body["id"];
  return typeof recordId === "string" && recordId
    ? `/app/${hostEntityCode}/${encodeURIComponent(recordId)}`
    : `/app/${hostEntityCode}`;
}
