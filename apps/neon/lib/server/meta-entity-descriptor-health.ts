import "server-only";

import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { EntityCapabilityManifest } from "@athyper/api-contracts/metadata";
import type { RuntimeCanvasFlags } from "@athyper/runtime-canvas/surfaces";

// Mirror of packages/shared/runtime-domain/runtime-canvas/src/surfaces/registry.ts. Kept in
// sync manually â€” if a new surface kind is registered there, add it here so
// dev-time health checks don't emit spurious "no renderer" warnings.
const REGISTERED_RENDERER_KINDS = new Set([
  "fields",
  "lifecycle",
  "workflow",
  "audit_summary",
  "line_items",
  "child_records",
  "summary_cards",
  "contacts_channel",
  "addresses",
  "banking_summary",
  "tax_profile_summary",
  "supplier_company_code",
  "operational_presentation",
  "document_lines",
  "document_components",
  "document_schedules",
  "document_accounting",
  "postings_preview",
]);

const CONTEXT_PANEL_KINDS = new Set([
  "attachments",
  "comments",
  "activity_log",
  "audit_trail",
  "versions",
  "compare",
  "distributions",
]);

export interface DescriptorHealthReport {
  entityCode: string;
  warnings: string[];
  errors: string[];
}

export function validateDescriptorHealth(
  descriptor: MetaEntityRuntimeDescriptor,
  flags: RuntimeCanvasFlags,
  capabilityManifest?: EntityCapabilityManifest,
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
        `Surface "${s.key}" (kind: "${s.kind}") has no registered renderer â€” it will show a "No renderer" fallback.`,
      );
    }

    const fieldsCount = mainSurfaces.filter((s) => s.kind === "fields").length;
    if (fieldsCount === 0) {
      warnings.push(
        'No "fields" surface is configured for main placement. The default detail view will be empty.',
      );
    }
    if (fieldsCount > 1) {
      warnings.push(`${fieldsCount} "fields" surfaces are on main placement â€” only one is expected.`);
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
    const hasLineItemsSurface = descriptor.surfaces.some(
      (s) => (s.kind === "line_items" || s.kind === "document_lines") && s.enabled,
    );
    if (!hasLineItemsSurface) {
      warnings.push(
        "capabilities.hasLineItems is true but no enabled line_items/document_lines surface is configured.",
      );
    }
  }

  // Field count sanity
  if (descriptor.fields.length === 0) {
    errors.push("Descriptor has no fields â€” the entity contract is empty.");
  }

  if (!capabilityManifest) {
    errors.push("Compiled entity has no capability manifest.");
  } else {
    const bindings = Object.entries(capabilityManifest.mutation);
    for (const [action, binding] of bindings) {
      if (!binding?.enabled) continue;
      if ((binding.kind === "handler" || binding.kind === "write_facade") && !binding.handler) {
        errors.push(`Enabled ${action} binding is missing its named handler.`);
      }
      if (!binding.permissionCode && action !== "aggregate") {
        errors.push(`Enabled ${action} binding is missing a permission.`);
      }
    }
    if (capabilityManifest.write.fields.length !== descriptor.fields.length) {
      errors.push("Capability write projection does not cover every descriptor field.");
    }
  }

  return { entityCode: descriptor.entityCode, warnings, errors };
}

export function logDescriptorHealthInDev(
  descriptor: MetaEntityRuntimeDescriptor,
  flags: RuntimeCanvasFlags,
  capabilityManifest?: EntityCapabilityManifest,
): void {
  if (process.env.NODE_ENV !== "development") return;

  const report = validateDescriptorHealth(descriptor, flags, capabilityManifest);
  if (report.errors.length === 0 && report.warnings.length === 0) return;

  const prefix = `[neon-descriptor-health] ${report.entityCode}`;
  for (const error of report.errors) {
    console.error(`${prefix}: ERROR â€” ${error}`);
  }
  for (const warning of report.warnings) {
    console.warn(`${prefix}: ${warning}`);
  }
}
