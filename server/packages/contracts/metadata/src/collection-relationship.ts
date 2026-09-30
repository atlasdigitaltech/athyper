/** Registered storage vocabulary. Metadata selects references; it cannot supply SQL. */
export const documentCollectionRegistry = Object.freeze({
  entity_case: {
    schema: "document", object: "entity_case", idField: "id", tenantField: "tenant_id",
    subjectFields: { subject_entity: "entity_code" },
    scopeFields: {
      "current_snapshot.organization": {
        schema: "snapshot", object: "entity_snapshot", tenantField: "tenant_id",
        sourceField: "current_snapshot_id", targetField: "snapshot_id",
        column: "payload_json", jsonKey: "operatingOrganizationId",
      },
    },
  },
} as const);

export interface CollectionRelationshipV1 {
  readonly schemaVersion: 1;
  readonly sourceRef: "entity_case";
  readonly subject: { readonly fieldRef: "subject_entity"; readonly value: string };
  readonly scope: { readonly fieldRef: "current_snapshot.organization"; readonly contextRef: "operatingOrganizationId" };
}

export const DOCUMENT_RELATIONSHIP_RESOLVER = "platform.document_relationship.v1";

export function parseCollectionRelationship(raw: unknown, storage?: {readonly schema:string;readonly object:string;readonly tenantField?:string;readonly idField:string}): CollectionRelationshipV1 {
  const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Invalid collection relationship");return value as Record<string,unknown>;};
  const exact=(value:Record<string,unknown>,keys:readonly string[])=>{if(Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError("Unknown collection relationship property");};
  const value=object(raw),subject=object(value.subject),scope=object(value.scope);
  exact(value,["schemaVersion","sourceRef","subject","scope"]);exact(subject,["fieldRef","value"]);exact(scope,["fieldRef","contextRef"]);
  if(value.schemaVersion!==1 || value.sourceRef!=="entity_case")throw new TypeError("Unregistered collection source or version");
  const source=documentCollectionRegistry[value.sourceRef];
  if(subject.fieldRef!=="subject_entity" || typeof subject.value!=="string" || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(subject.value) || subject.value.length>160)throw new TypeError("Invalid registered subject binding");
  if(scope.fieldRef!=="current_snapshot.organization" || scope.contextRef!=="operatingOrganizationId")throw new TypeError("Unregistered collection scope binding");
  if(storage && (storage.schema!==source.schema || storage.object!==source.object || storage.tenantField!==source.tenantField || storage.idField!==source.idField))throw new TypeError("Collection relationship storage mismatch");
  return Object.freeze({schemaVersion:1,sourceRef:value.sourceRef,subject:Object.freeze({fieldRef:subject.fieldRef,value:subject.value}),scope:Object.freeze({fieldRef:scope.fieldRef,contextRef:scope.contextRef})});
}
