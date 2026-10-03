import {
  parseEntityDirectoryScope,
  validateDirectoryScopeFields,
} from "@athyper/server-contract-metadata";
import type {
  RecordCollectionScopeResolution,
  RecordCollectionScopeResolver,
} from "@athyper/server-contract-records";
import type { NeonRecordCollectionScopeCatalog } from "./record-collection-scope.js";

type Input = Parameters<RecordCollectionScopeResolver["resolve"]>[0];
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Selected scopes are resolved against the principal's catalog, never accepted as grants. */
export async function resolveDirectoryFieldScope(
  input: Input,
  catalog: NeonRecordCollectionScopeCatalog,
): Promise<RecordCollectionScopeResolution> {
  const deny = (code: string): RecordCollectionScopeResolution => ({
    status: "forbidden",
    code,
    message: "The published directory scope is unavailable or not permitted.",
    labels: [],
  });
  let rule;
  try {
    rule = parseEntityDirectoryScope(input.descriptor.directoryScope);
    validateDirectoryScopeFields(rule, input.descriptor.fields);
  } catch {
    return deny("DIRECTORY_FIELD_BINDING_INVALID");
  }
  const binding = rule.fieldBinding;
  if (
    !input.descriptor.storage.tenantField ||
    !binding ||
    input.operationCode !== "read" ||
    input.context.planeKey !== "neon" ||
    input.descriptor.planeKey !== "neon"
  )
    return deny("DIRECTORY_FIELD_BINDING_UNAVAILABLE");
  const workContext = {
    schemaVersion: 1 as const,
    resolver: binding.resolver,
    requiredCoordinates: [
      ...(binding.companyField
        ? ["companyCodeId" as const, "legalEntityId" as const]
        : []),
      ...(binding.organizationField
        ? ["operatingOrganizationId" as const]
        : []),
    ],
  };
  const coordinate = input.coordinate ?? {};
  if (
    coordinate.companyCodeIds !== undefined ||
    coordinate.operatingOrganizationIds !== undefined ||
    coordinate.partnerRole !== undefined ||
    coordinate.eligibleOperation !== undefined ||
    (!binding.companyField &&
      (coordinate.companyCodeId !== undefined ||
        coordinate.legalEntityId !== undefined)) ||
    (!binding.organizationField &&
      coordinate.operatingOrganizationId !== undefined)
  )
    return deny("INVALID_WORK_CONTEXT");
  for (const id of [
    coordinate.companyCodeId,
    coordinate.legalEntityId,
    coordinate.operatingOrganizationId,
  ])
    if (id !== undefined && !uuid.test(id)) return deny("INVALID_WORK_CONTEXT");
  if (
    (coordinate.companyCodeId === undefined) !==
    (coordinate.legalEntityId === undefined)
  )
    return deny("INVALID_WORK_CONTEXT");
  if (
    (binding.companyField && !coordinate.companyCodeId) ||
    (binding.organizationField && !coordinate.operatingOrganizationId)
  )
    return {
      status: "context_required",
      workContext,
      labels: [
        { key: "scope", label: "Record scope", value: "Selection required" },
      ],
    };
  const [work, operating] = await Promise.all([
    binding.companyField ? catalog.neonWorkContexts(input.context) : undefined,
    binding.organizationField
      ? catalog.neonOperatingOrganizations(input.context)
      : undefined,
  ]);
  const company = work?.companies.find(
    (item) =>
      item.companyCodeId === coordinate.companyCodeId &&
      item.legalEntityId === coordinate.legalEntityId,
  );
  const organization = operating?.organizations.find(
    (item) => item.id === coordinate.operatingOrganizationId,
  );
  if (
    (binding.companyField && !company) ||
    (binding.organizationField && !organization)
  )
    return deny("NEON_WORK_CONTEXT_NOT_PERMITTED");
  if (
    company &&
    organization &&
    !organization.companyAssignments.some(
      (item) => item.companyCodeId === company.companyCodeId,
    )
  )
    return deny("NEON_WORK_CONTEXT_INCOMPATIBLE");
  const predicates = [
    ...(company && binding.companyField
      ? [{ field: binding.companyField, value: company.companyCodeId }]
      : []),
    ...(organization && binding.organizationField
      ? [{ field: binding.organizationField, value: organization.id }]
      : []),
  ];
  return {
    status: "ready",
    workContext,
    authorizationResource: {
      ...(company
        ? {
            companyCodeId: company.companyCodeId,
            legalEntityId: company.legalEntityId,
          }
        : {}),
      ...(organization ? { operatingOrganizationId: organization.id } : {}),
    },
    constraints: [
      {
        kind: "entity.directory.fields.v1",
        entityCode: input.descriptor.entityCode,
        storageSchema: input.descriptor.storage.schema,
        storageObject: input.descriptor.storage.object,
        predicates,
      },
    ],
    labels: [
      ...(company
        ? [
            {
              key: "company",
              label: "Company",
              value: `${company.code} · ${company.displayName}`,
            },
          ]
        : []),
      ...(organization
        ? [
            {
              key: "organization",
              label: "Operating organization",
              value: `${organization.code} · ${organization.displayName}`,
            },
          ]
        : []),
    ],
    fingerprintMaterial: {
      resolver: binding.resolver,
      descriptorHash: input.descriptor.compiledHash,
      workRevision: work?.revision ?? "unused",
      organizationRevision: operating?.revision ?? "unused",
      predicates: JSON.stringify(predicates),
    },
  };
}
