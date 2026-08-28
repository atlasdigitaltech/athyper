import { createHash } from "node:crypto";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";

const contractHash = digest("studio.metadata_entity.catalog.contract.v2");
const compiledHash = digest("studio.metadata_entity.catalog.descriptor.v2");
const metadataEntityDescriptor: EntityRuntimeDescriptor = Object.freeze({
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "metadata_entity",
  planeKey: "studio",
  releaseId: "studio-catalog-metadata-entity-v2",
  releaseNo: 2,
  contractHash,
  compiledHash,
  storage: Object.freeze({ schema: "metadata", object: "entity", idField: "id", statusField: "status" }),
  fields: Object.freeze([
    field("id", "uuid", true, true, true, { label: "Entity ID", defaultVisible: false, defaultOrder: 90, defaultWidth: 300 }),
    field("entity_code", "string", true, true, true, { label: "Entity code", semanticRole: "identity", defaultVisible: true, defaultOrder: 0, defaultWidth: 240 }),
    field("entity_class", "enum", true, true, true, { label: "Class", defaultVisible: true, defaultOrder: 1, defaultWidth: 170, groupable: true }),
    field("ownership_model", "enum", true, true, true, { label: "Ownership", defaultVisible: true, defaultOrder: 2, defaultWidth: 160, groupable: true }),
    field("status", "enum", true, true, true, { label: "Status", semanticRole: "status", defaultVisible: true, defaultOrder: 3, defaultWidth: 130, groupable: true }),
    field("created_at", "datetime", true, true, true, { label: "Created", defaultVisible: true, defaultOrder: 4, defaultWidth: 190 }),
    field("updated_at", "datetime", false, true, true, { label: "Updated", semanticRole: "updated_at", defaultVisible: true, defaultOrder: 5, defaultWidth: 190 }),
    field("tenant_id", "uuid", false, false, false, { label: "Tenant", defaultVisible: false, defaultOrder: 20 }),
    field("module_id", "uuid", true, false, false, { label: "Module", defaultVisible: false, defaultOrder: 21 }),
  ]),
  operations: Object.freeze({ read: Object.freeze({ code: "read", permissionCode: "studio.metadata.contract.view" }),import:Object.freeze({code:"import",permissionCode:"studio.metadata.contract.view"}) }),
  listPresentation: Object.freeze({ schemaVersion: 1, title: "Entity Catalog", description: "Governed system and tenant Entity identities available to this Studio context.", identityField: "entity_code", defaultState: Object.freeze({ filters: Object.freeze([]), sort: Object.freeze([{ field: "entity_code", direction: "asc" as const }]), columns: Object.freeze(["entity_code", "entity_class", "ownership_model", "status", "created_at", "updated_at"]), density: "comfortable" as const, mode: "table" as const }), supportedModes: Object.freeze(["table" as const, "compact" as const]), search: Object.freeze({ minimumQueryLength: 1 }), limits: Object.freeze({ defaultPageSize: 10, allowedPageSizes: Object.freeze([10, 25, 50, 100]), maxSortLevels: 3, countMode: "exact" as const }),dataOperations:Object.freeze({importAdapterKey:"studio.metadata_entity.draft.v1",importOperations:Object.freeze(["create","update","upsert","replace"]as const),importOperationPermissions:Object.freeze({create:Object.freeze(["studio.metadata.contract.import"]),update:Object.freeze(["studio.metadata.contract.import"]),upsert:Object.freeze(["studio.metadata.contract.import"]),replace:Object.freeze(["studio.metadata.contract.import"])}),importFormats:Object.freeze(["json"]as const),importMaxRows:1000,importMaxFileBytes:26214400,allowTemplateDownload:true,draftOnly:true}) }),
});

/** Adds administrative read models without publishing a fake Studio CRUD operation. */
export function createStudioCatalogMetadataReader(delegate: MetadataReader): MetadataReader {
  return Object.freeze({
    getEntityDescriptor(context: Parameters<MetadataReader["getEntityDescriptor"]>[0], entityCode: string) {
      if (context.planeKey === "studio" && entityCode === "metadata_entity") return Promise.resolve(metadataEntityDescriptor);
      return delegate.getEntityDescriptor(context, entityCode);
    },
  });
}

function field(key: string, type: "uuid" | "string" | "enum" | "datetime", required: boolean, filterable: boolean, sortable: boolean, list: NonNullable<EntityRuntimeDescriptor["fields"][number]["list"]>): EntityRuntimeDescriptor["fields"][number] { return Object.freeze({ key, storagePath: key, type, required, writableOn: Object.freeze(key==="entity_code"?["create","patch"]as const:[]), filterable, sortable, searchable: key === "entity_code", list: Object.freeze(list) }); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export { metadataEntityDescriptor };
