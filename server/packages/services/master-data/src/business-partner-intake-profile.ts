import { supplierRequirementFieldContract } from "@athyper/server-contract-master-data";
import {
  dataSurfaceValues,
  type EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";
import type { CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
/** Reconstruct UI answers from typed commands so browser and API validate the same metadata. */
export function validateProfileIntake(
  surface: EntityIntakeSurfaceV1,
  surfaces: readonly EntityIntakeSurfaceV1[],
  command: CreateBusinessPartnerRequestCommand,
): void {
  surface = supplierRequirementSurface(surface, command.requestedRole);
  surfaces = surfaces.map(s => s.key === surface.key ? surface : s);
  const extensions = command.extensions ?? {},
    payload = command.proposedPayload,
    answers: Record<string, unknown> = {};
  const record = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  for (const f of surface.sections.flatMap((s) => s.fields)) {
    if (f.control === "input" && f.payload) {
      answers[f.valueKey] =
        f.payload.target === "canonical"
          ? payload[f.payload.path]
          : f.payload.target === "request_only"
            ? record(payload.tenantFields)[f.payload.path]
            : f.payload.path === "operatingOrganizationId"
              ? command.operatingOrganizationId
              : undefined;
      if (answers[f.valueKey] === undefined)
        answers[f.valueKey] = f.defaultValue;
    }
    if (f.control === "repeatableGroup" && f.extensionGroup) {
      const rows =
        extensions[f.extensionGroup as keyof typeof extensions] ?? [];
      answers[f.valueKey] = rows.map((row) => ({
        ...row,
        ...Object.fromEntries(
          (
            surfaces
              .find((s) => s.key === f.itemSurfaceKey)
              ?.sections.flatMap((s) => s.fields) ?? []
          ).flatMap((c) =>
            c.control === "input" && c.payload
              ? [[c.valueKey, (row as any)[c.payload.path]]]
              : [],
          ),
        ),
        key: row.clientItemKey,
        supportingDocuments: (extensions.supportingDocuments ?? [])
          .filter(doc => doc.sectionCode === f.extensionGroup && doc.entryKey === row.clientItemKey)
          .map(doc => ({...doc,key:doc.clientItemKey})),
        ...(f.extensionGroup === "bankAccounts" ? {accountIdentifier:(row as any).maskedValue} : {}),
        ...(f.extensionGroup === "taxRegistrations"
          ? { value: (row as any).maskedValue }
          : {}),
        ...(f.extensionGroup === "certifications"
          ? { certificateNumber: (row as any).maskedCertificateNumber }
          : {}),
      }));
      // Every submitted collection must be validated, even if a caller hides the prototype view.
      if (rows.length && f.visibleWhen?.operator === "equals") {
        const selector = surface.sections
          .flatMap((section) => section.fields)
          .find((field) => field.key === f.visibleWhen!.field);
        if (selector?.control === "input")
          answers[selector.valueKey] = f.visibleWhen.value;
      }
    }
  }
  answers.addresses = (extensions.addresses ?? []).map((row) => ({
    ...row,
    key: row.clientItemKey,
  }));
  answers.contacts = (extensions.contactPersons ?? []).map((row) => ({
    ...row,
    key: row.clientItemKey,
    channels: (extensions.contactChannels ?? [])
      .filter((c) => c.contactClientItemKey === row.clientItemKey)
      .map((c) => ({ ...c, key: c.clientItemKey })),
  }));
  // Raw bank identifiers were validated by protected capture. Here only a mask is available.
  // Keep all other field validation (country, format selection, routing, etc.).
  const protectedSurfaces = surfaces.map(s => ({...s, sections:s.sections.map(section => ({...section, fields:section.fields.map(f => {
    if (f.control !== "input" || f.valueKey !== "accountIdentifier") return f;
    return {...f, format:undefined, pattern:undefined,
      referenceRules:f.referenceRules ? {...f.referenceRules,pattern:undefined} : undefined,
      variants:f.variants?.map(v => ({...v,format:"none" as const}))};
  })}))}));
  dataSurfaceValues(protectedSurfaces.find(s => s.key === surface.key)!, protectedSurfaces, answers,command.draftCapture?"draft":"submit");
}

/** The native Details surface is the supplier form; customer APIs keep their existing contract. */
export function supplierRequirementSurface(surface: EntityIntakeSurfaceV1, requestedRole?: string): EntityIntakeSurfaceV1 {
  if (requestedRole === "supplier") return surface;
  return {...surface, sections: surface.sections.map(s=>({...s,fields:s.fields.filter(f=>f.control!=="input" || !supplierRequirementFieldContract.fields.includes(f.valueKey as never))}))};
}
