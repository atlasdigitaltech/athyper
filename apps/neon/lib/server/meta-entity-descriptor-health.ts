import "server-only";

import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeCanvasFlags } from "@athyper/runtime-canvas/surfaces";

const REGISTERED_RENDERER_KINDS = new Set([
  "fields",
  "lifecycle",
  "workflow",
  "audit_summary",
  "line_items",
  "child_records",
]);

const CONTEXT_PANEL_KINDS = new Set([
  "attachments",
  "comments",
  "activity_log",
  "audit_trail",
  "versions",
  "compare",
]);

export interface DescriptorHealthReport {
  entityCode: string;
  warnings: string[];
  errors: string[];
}

export function validateDescriptorHealth(
  descriptor: MetaEntityRuntimeDescriptor,
  flags: RuntimeCanvasFlags,
): DescriptorHealthReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const mainSurfaces = descriptor.surfaces.filter(
    (s) => s.enabled && s.placement === "main" && !CONTEXT_PANEL_KINDS.has(s.kind),
  );
  const subrouteSurfaces = descriptor.surfaces.filter(
    (s) => s.enabled && s.placement === "subroute",
  );

  // Shell-specific checks
  if (flags.descriptorSurfaceShell) {
    if (mainSurfaces.length === 0) {
      errors.push(
        "descriptorSurfaceShell is enabled but no main-placement surfaces are configured. The shell will render empty.",
      );
    }

    const unregisteredSurfaces = mainSurfaces.filter(
      (s) => !REGISTERED_RENDERER_KINDS.has(s.kind),
    );
    for (const s of unregisteredSurfaces) {
      warnings.push(
        `Surface "${s.key}" (kind: "${s.kind}") has no registered renderer — it will show a "No renderer" fallback.`,
      );
    }

    const fieldsCount = mainSurfaces.filter((s) => s.kind === "fields").length;
    if (fieldsCount === 0) {
      warnings.push(
        'No "fields" surface is configured for main placement. The default detail view will be empty.',
      );
    }
    if (fieldsCount > 1) {
      warnings.push(`${fieldsCount} "fields" surfaces are on main placement — only one is expected.`);
    }
  }

  // Grouped forms checks
  if (flags.groupedForms) {
    if (descriptor.fieldGroups.length === 0) {
      warnings.push(
        "groupedForms is enabled but no fieldGroups are defined in the descriptor. Forms will fall back to a flat grid.",
      );
    }
  }

  // Subroute surface checks
  for (const s of subrouteSurfaces) {
    if (!REGISTERED_RENDERER_KINDS.has(s.kind) && !CONTEXT_PANEL_KINDS.has(s.kind)) {
      warnings.push(
        `Subroute surface "${s.key}" (kind: "${s.kind}") has no registered renderer.`,
      );
    }
  }

  // Capability vs surface consistency
  if (descriptor.capabilities.hasLifecycle) {
    const hasLifecycleSurface = descriptor.surfaces.some((s) => s.kind === "lifecycle" && s.enabled);
    if (!hasLifecycleSurface) {
      warnings.push(
        "capabilities.hasLifecycle is true but no enabled lifecycle surface is configured.",
      );
    }
  }
  if (descriptor.capabilities.hasWorkflow) {
    const hasWorkflowSurface = descriptor.surfaces.some((s) => s.kind === "workflow" && s.enabled);
    if (!hasWorkflowSurface) {
      warnings.push(
        "capabilities.hasWorkflow is true but no enabled workflow surface is configured.",
      );
    }
  }
  if (descriptor.capabilities.hasLineItems) {
    const hasLineItemsSurface = descriptor.surfaces.some((s) => s.kind === "line_items" && s.enabled);
    if (!hasLineItemsSurface) {
      warnings.push(
        "capabilities.hasLineItems is true but no enabled line_items surface is configured.",
      );
    }
  }

  // Field count sanity
  if (descriptor.fields.length === 0) {
    errors.push("Descriptor has no fields — the entity contract is empty.");
  }

  return { entityCode: descriptor.entityCode, warnings, errors };
}

export function logDescriptorHealthInDev(
  descriptor: MetaEntityRuntimeDescriptor,
  flags: RuntimeCanvasFlags,
): void {
  if (process.env.NODE_ENV !== "development") return;

  const report = validateDescriptorHealth(descriptor, flags);
  if (report.errors.length === 0 && report.warnings.length === 0) return;

  const prefix = `[neon-descriptor-health] ${report.entityCode}`;
  for (const error of report.errors) {
    console.error(`${prefix}: ERROR — ${error}`);
  }
  for (const warning of report.warnings) {
    console.warn(`${prefix}: ${warning}`);
  }
}
