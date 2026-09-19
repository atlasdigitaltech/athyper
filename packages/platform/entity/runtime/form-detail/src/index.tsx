"use client";
import { parseEntityRecordPresentation, resolveRecordHeader } from "@athyper/contract-platform-entity-runtime";
import { EntityRecordHeader } from "./record-header";
import { useEffect, useState, type FormEvent } from "react";
import type { EntityDetailDescriptorV1, EntityFormDescriptorV1, EntityRecordV1, EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { useContextDepartureGuard, PageFrame, PageHeader, PageWorkspace, useRecordPage, useAtlasBusinessContextPublisher } from "@athyper/platform-shell";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { Button, Card, Checkbox, Input, Label, Select } from "@athyper/platform-ui";

export function EntityFormRuntime({ entityCode, recordId, onCommitted }: { readonly entityCode: string; readonly recordId?: string; readonly onCommitted?: (recordId: string) => void }) {
  const client = useApiClient(), mode = recordId ? "edit" : "create";
  const [descriptor, setDescriptor] = useState<EntityFormDescriptorV1>(), [record, setRecord] = useState<EntityRecordV1>(), [values, setValues] = useState<Record<string, unknown>>({}), [status, setStatus] = useState("Loading published metadata…"), [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; setStatus("Loading published metadata…"); Promise.all([entityDescriptorClient.form(client, entityCode, mode), recordId ? entityDescriptorClient.record(client, entityCode, recordId) : Promise.resolve(undefined)]).then(([nextDescriptor, nextRecord]) => { if (!active) return; setDescriptor(nextDescriptor); setRecord(nextRecord); setValues(nextRecord ? Object.fromEntries(nextDescriptor.fields.map((field) => [field.key, nextRecord.values[field.key] ?? ""])) : {}); setStatus(""); }).catch((error) => active && setStatus(safeError(error))); return () => { active = false; }; }, [client, entityCode, mode, recordId]);
  useAtlasBusinessContextPublisher(recordId ? {kind:"record",entityCode,recordId,dirty:record?.id===recordId && !!descriptor && descriptor.fields.some(field=>JSON.stringify(values[field.key]??"")!==JSON.stringify(record.values[field.key]??"")),savedRevision:record?.id!==recordId||record?.version===undefined?undefined:String(record.version)}:undefined);
  useContextDepartureGuard({ dirty: !!descriptor && descriptor.fields.some(field => JSON.stringify(values[field.key] ?? "") !== JSON.stringify(record?.values[field.key] ?? "")), busy: saving });
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!descriptor) return; setSaving(true); setStatus(""); try { const input = Object.fromEntries(descriptor.fields.filter((field) => !field.readOnly).flatMap((field) => values[field.key] === "" && !field.required ? [] : [[field.key, normalize(values[field.key], field)]])); const key = `entity-${descriptor.pageKind}-${crypto.randomUUID()}`; const receipt = recordId ? await entityDescriptorClient.patch(client, entityCode, recordId, input, record?.version ?? 0, key) : await entityDescriptorClient.create(client, entityCode, input, key); setStatus(`${descriptor.entity.label} saved.`); onCommitted?.(receipt.recordId); } catch (error) { setStatus(safeError(error)); } finally { setSaving(false); } };
  if (!descriptor) return <PageFrame><PageHeader level="collection" context="Published metadata" title={humanize(entityCode)}/><Card><p role="status">{status}</p></Card></PageFrame>;
  return <PageFrame><PageHeader level="collection" context={`${descriptor.entity.label} · ${descriptor.pageKind === "create" ? "Create" : "Edit"}`} title={descriptor.title} description={descriptor.description} metadata={<span>Release {descriptor.revision.release}</span>}/><form onSubmit={submit}><Card>{descriptor.fields.map((field) => <Field key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}/>)}</Card><div><Button type="submit" loading={saving}>{descriptor.submit.label}</Button></div><p role="status">{status}</p></form></PageFrame>;
}

export function EntityDetailRuntime({ entityCode, recordId, editHref }: { readonly entityCode: string; readonly recordId: string; readonly editHref?: string }) {
  useRecordPage();
  const client = useApiClient(), identity = useSessionIdentity();
  const [loaded, setLoaded] = useState<{ key: string; descriptor: EntityDetailDescriptorV1; record: EntityRecordV1 }>();
  const [status, setStatus] = useState("Loading record…"), [activeSection, setActiveSection] = useState("overview");
  const key = `${identity.scope?.tenantId}:${identity.scope?.principalId}:${identity.scope?.authEpoch}:${entityCode}:${recordId}`;
  useEffect(() => {
    let active = true; setStatus("Loading record…"); setActiveSection("overview");
    Promise.all([entityDescriptorClient.detail(client, entityCode, recordId), entityDescriptorClient.record(client, entityCode, recordId)])
      .then(([descriptor, record]) => { if (active) { setLoaded({ key, descriptor, record }); setStatus(""); } })
      .catch(error => { if (active) setStatus(safeError(error)); });
    return () => { active = false; };
  }, [client, entityCode, recordId, key]);
  useAtlasBusinessContextPublisher({kind:"record",entityCode,recordId,section:activeSection,dirty:false,savedRevision:loaded?.key===key&&loaded.record.version!==undefined?String(loaded.record.version):undefined});
  if (!loaded || loaded.key !== key) return <PageWorkspace header={{ level: "collection", title: humanize(entityCode) }}><Card><p role="status">{status}</p></Card></PageWorkspace>;
  const { descriptor, record } = loaded;
  const presentation = descriptor.presentation ?? parseEntityRecordPresentation({ schemaVersion: 1, titleField: descriptor.titleField, sections: [{ key: "overview", label: "Overview", fields: descriptor.fields.map(field => field.key) }], actions: [{ key: "edit", label: "Edit", operationKey: "patch", placement: "primary" }] });
  const section = presentation.sections.find(item => item.key === activeSection) ?? presentation.sections[0];
  const header = resolveRecordHeader(presentation, record.values, { entityLabel: descriptor.entity.label, fallbackTitle: descriptor.entity.label,
    labels: Object.fromEntries(descriptor.fields.map(field => [field.key, field.label])),
    actions: presentation.actions.flatMap(action => action.operationKey === "patch" && editHref && descriptor.actions.some(item => item.kind === "edit") ? [{ key: action.key, label: action.label, placement: action.placement, href: editHref }] : []),
  });
  const fields = section ? descriptor.fields.filter(field => section.fields.includes(field.key)) : descriptor.fields;
  return <PageWorkspace width="wide" status={status ? <p role="status">{status}</p> : null} header={<EntityRecordHeader header={header} activeSection={section?.key} onSelectSection={setActiveSection}
    technicalDetails={<dl><div><dt>Record ID</dt><dd>{record.id}</dd></div><div><dt>Release</dt><dd>{descriptor.revision.release}</dd></div>{record.version === undefined ? null : <div><dt>Version</dt><dd>{record.version}</dd></div>}</dl>}/>}
    >
    <Card className="a-record-detail-content"><h2>{section?.label ?? "Details"}</h2><dl className="a-record-detail-fields">{fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{display(record.values[field.key])}</dd></div>)}</dl></Card>
  </PageWorkspace>;
}

function Field({ field, value, onChange }: { readonly field: EntitySurfaceFieldV1; readonly value: unknown; readonly onChange: (value: unknown) => void }) { const id = `entity-field-${field.key}`; if (field.kind === "boolean") return <Label htmlFor={id}><Checkbox id={id} checked={value === true} disabled={field.readOnly} onChange={(event) => onChange(event.currentTarget.checked)}/>{field.label}</Label>; if (field.options?.length) return <Label htmlFor={id}><span>{field.label}</span><Select id={id} value={String(value ?? "")} required={field.required} disabled={field.readOnly} onChange={(event) => onChange(event.currentTarget.value)}><option value="">Select…</option>{field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</Select></Label>; return <Label htmlFor={id}><span>{field.label}</span><Input id={id} value={String(value ?? "")} required={field.required} readOnly={field.readOnly} type={inputType(field.kind)} onChange={(event) => onChange(event.currentTarget.value)}/></Label>; }
function inputType(kind: EntitySurfaceFieldV1["kind"]): "text" | "number" | "date" | "datetime-local" { if (["integer", "decimal", "money"].includes(kind)) return "number"; if (kind === "date") return "date"; if (kind === "datetime") return "datetime-local"; return "text"; }
function normalize(value: unknown, field: EntitySurfaceFieldV1): unknown { if (["integer", "decimal", "money"].includes(field.kind) && typeof value === "string") return Number(value); return value; }
function display(value: unknown): string { if (value === null || value === undefined || value === "") return "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function humanize(value: string): string { return value.replace(/[_.-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function safeError(error: unknown): string { return error instanceof Error && error.message ? error.message : "The governed entity surface is unavailable."; }
export { EntityRecordHeader } from "./record-header";

export { EntityRecord360Panel, EntityRecord360ModeNavigation, type Record360Section } from "./record-360-panel";

export { RelatedRecord, RelatedSectionError, PostalAddress, AddressSummary, ContactSummary, postalAddressLines, detailValue, safeChannelHref } from "./related-record";

export { EntityRecordAction, type EntityActionHandlers, type RecordAction } from "./record-action";

export * from "./intake";
export * from "./intake-surface";
export * from "./intake-classification";

export * from "./entity-lookup";
export * from "./reference-lookup";
export * from "./data-surface";
export { useDataValidation, type DisplayIssue } from "./data-validation";

export { CollectionSection, AddressesSection, ContactsSection, BankAccountsSection, CertificationsSection, SupportingDocumentsSection } from "./collection-section";

export {EntityFormLayout} from "./form-layout";
export {EntitySectionNavigation, useEntitySectionScroll, type EntitySectionItem} from "./section-navigation";
export { EntitySectionWorkspace } from "./section-workspace";
