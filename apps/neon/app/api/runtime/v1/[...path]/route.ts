// {GET|POST|PUT|PATCH|DELETE} /api/runtime/v1/[...path] — BFF catchall relay to runtime /api/runtime/v1/*.
// Next.js normally matches specific route files before this catchall, so the typed v1 handlers
// (entities/[entity], entities/[entity]/[id], lookups, bindings, etc.) take precedence.
// This catches everything else — sub-resources without dedicated BFF handlers
// (action-dispatcher, lines, distributions, versions, etc.)
// forward straight to the runtime under their canonical URL.
import { type NextRequest, NextResponse } from "next/server";
import type { RelayParams } from "@athyper/bff-relay";
import { makeModuleRelay } from "@/lib/server/make-module-relay";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { rejectPublicLedgerMutation } from "@/lib/server/meta-entity-mutation-gates";
import { GET as getFieldOptions } from "../entities/[entity]/fields/[field]/options/route";
import { GET as getRelationRecords } from "../entities/[entity]/relations/[relation]/records/[parent_id]/route";
import { POST as postDraftInitiate } from "../entities/[entity]/draft/initiate/route";
import { POST as postDraftPromote } from "../entities/[entity]/[id]/draft/promote/route";
import { POST as postDraftDiscard } from "../entities/[entity]/[id]/draft/discard/route";
import { POST as postEditSections } from "../entities/[entity]/[id]/edit/sections/route";
import { GET as getEditCore } from "../entities/[entity]/[id]/edit/core/route";
import { GET as getEditEvents } from "../entities/[entity]/[id]/edit/events/route";
import { POST as postEditOpen } from "../entities/[entity]/[id]/edit/open/route";
import { POST as postEditHydrate } from "../entities/[entity]/[id]/edit/hydrate/route";
import { POST as postEditPreflight } from "../entities/[entity]/[id]/edit/preflight/route";
import { POST as postEditResolveChange } from "../entities/[entity]/[id]/edit/resolve-change/route";
import { POST as postEditDiscard, DELETE as deleteEditDiscard } from "../entities/[entity]/[id]/edit/discard/route";
import { POST as postEditAddress } from "../entities/[entity]/[id]/edit/address/route";
import { POST as postEditFieldOptions } from "../entities/[entity]/[id]/edit/field-options/batch/route";
import { POST as postEditSubmit } from "../entities/[entity]/[id]/edit/submit/route";
import { POST as postEditSectionDiscard } from "../entities/[entity]/[id]/edit/sections/[section]/discard/route";
import { POST as postEditRowDiscard } from "../entities/[entity]/[id]/edit/rows/[collection]/[rowId]/discard/route";
import { POST as postRevertToBaseline } from "../entities/[entity]/[id]/edit/revert-to-baseline/route";

const relay = makeModuleRelay("runtime/v1", {
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match", "X-Document-Edit-Workspace"],
});

export async function PUT(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  const boundary = await rejectGenericEntityMutation(path);
  if (boundary) return boundary;
  return relay.PUT(request, { params: Promise.resolve({ path }) });
}

export async function PATCH(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  const boundary = await rejectGenericEntityMutation(path);
  if (boundary) return boundary;
  return relay.PATCH(request, { params: Promise.resolve({ path }) });
}

export async function POST(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  const draftInitiateParams = parseDraftInitiatePath(path);
  if (draftInitiateParams) {
    return postDraftInitiate(request, { params: Promise.resolve(draftInitiateParams) });
  }

  const draftRecordParams = parseDraftRecordPath(path);
  if (draftRecordParams?.action === "promote") {
    return postDraftPromote(request, { params: Promise.resolve(draftRecordParams.params) });
  }
  if (draftRecordParams?.action === "discard") {
    return postDraftDiscard(request, { params: Promise.resolve(draftRecordParams.params) });
  }

  const editSectionsParams = parseEditSectionsPath(path);
  if (editSectionsParams) {
    return postEditSections(request, { params: Promise.resolve(editSectionsParams) });
  }

  const editParams = parseEditOperationPath(path);
  if (editParams) {
    const context = { params: Promise.resolve(editParams.params) };
    if (editParams.operation === "open") return postEditOpen(request, context);
    if (editParams.operation === "hydrate") return postEditHydrate(request, context);
    if (editParams.operation === "preflight") return postEditPreflight(request, context);
    if (editParams.operation === "resolve-change") return postEditResolveChange(request, context);
    if (editParams.operation === "discard") return postEditDiscard(request, context);
    if (editParams.operation === "address") return postEditAddress(request, context);
  }

  const fieldOptionsParams = parseEditFieldOptionsPath(path);
  if (fieldOptionsParams) {
    return postEditFieldOptions(request, { params: Promise.resolve(fieldOptionsParams) });
  }

  const sectionDiscardParams = parseEditSectionDiscardPath(path);
  if (sectionDiscardParams) {
    return postEditSectionDiscard(request, { params: Promise.resolve(sectionDiscardParams) });
  }

  const rowDiscardParams = parseEditRowDiscardPath(path);
  if (rowDiscardParams) {
    return postEditRowDiscard(request, { params: Promise.resolve(rowDiscardParams) });
  }

  const editSubmitParams = parseEditSubmitPath(path);
  if (editSubmitParams) {
    return postEditSubmit(request, { params: Promise.resolve(editSubmitParams) });
  }

  const revertParams = parseEditRevertToBaselinePath(path);
  if (revertParams) {
    return postRevertToBaseline(request, { params: Promise.resolve(revertParams) });
  }

  const boundary = await rejectGenericEntityMutation(path);
  if (boundary) return boundary;
  return relay.POST(request, { params: Promise.resolve({ path }) });
}

export async function GET(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  const fieldOptionsParams = parseFieldOptionsPath(path);
  if (fieldOptionsParams) {
    return getFieldOptions(request, { params: Promise.resolve(fieldOptionsParams) });
  }

  const relationParams = parseRelationRecordsPath(path);
  if (relationParams) {
    return getRelationRecords(request, { params: Promise.resolve(relationParams) });
  }
  const editEventsParams = parseEditEventsPath(path);
  if (editEventsParams) {
    return getEditEvents(request, { params: Promise.resolve(editEventsParams) });
  }
  const editCoreParams = parseEditCorePath(path);
  if (editCoreParams) {
    return getEditCore(request, { params: Promise.resolve(editCoreParams) });
  }
  return relay.GET(request, { params: Promise.resolve({ path }) });
}

export async function DELETE(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  const editParams = parseEditOperationPath(path);
  if (editParams?.operation === "discard") {
    return deleteEditDiscard();
  }
  const boundary = await rejectGenericEntityMutation(path);
  if (boundary) return boundary;
  return relay.DELETE(request, { params: Promise.resolve({ path }) });
}

/**
 * The catchall relay must not reopen a generic write path below the typed
 * entity route. Workspace-owned document relations may only change through
 * the signed /edit/submit facade, which is dispatched above before this
 * guard can run.
 */
async function rejectGenericEntityMutation(path: readonly string[]): Promise<NextResponse | null> {
  const [entities, rawEntity, recordId] = path;
  if (entities !== "entities" || !rawEntity || !recordId) return null;

  const entityCode = rawEntity.trim().replace(/-/g, "_");
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) return null;
  const ledgerRejection = rejectPublicLedgerMutation(descriptor.renderer);
  if (ledgerRejection) return ledgerRejection;
  if (descriptor.renderer !== "document") return null;

  return NextResponse.json(
    {
      error: "DOCUMENT_WORKSPACE_REQUIRED",
      message: "Document records and workspace-owned child relations must be changed through the document workspace.",
    },
    {
      status: 409,
      headers: {
        "Cache-Control": "no-store",
        "X-Document-Edit-Security": "workspace-required",
      },
    },
  );
}

function parseFieldOptionsPath(
  path: readonly string[],
): { entity: string; field: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, fields, field, options] = path;
  if (entities !== "entities" || fields !== "fields" || options !== "options") return null;
  if (!entity || !field) return null;
  return { entity, field };
}

function parseRelationRecordsPath(
  path: readonly string[],
): { entity: string; relation: string; parent_id: string } | null {
  if (path.length !== 6) return null;
  const [entities, entity, relations, relation, records, parentId] = path;
  if (entities !== "entities" || relations !== "relations" || records !== "records") return null;
  if (!entity || !relation || !parentId) return null;
  return { entity, relation, parent_id: parentId };
}

function parseDraftInitiatePath(
  path: readonly string[],
): { entity: string } | null {
  if (path.length !== 4) return null;
  const [entities, entity, draft, initiate] = path;
  if (entities !== "entities" || draft !== "draft" || initiate !== "initiate") return null;
  if (!entity) return null;
  return { entity };
}

function parseDraftRecordPath(
  path: readonly string[],
): { action: "promote" | "discard"; params: { entity: string; id: string } } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, draft, action] = path;
  if (entities !== "entities" || draft !== "draft") return null;
  if (!entity || !id || (action !== "promote" && action !== "discard")) return null;
  return { action, params: { entity, id } };
}

function parseEditSectionsPath(
  path: readonly string[],
): { entity: string; id: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, sections] = path;
  if (entities !== "entities" || edit !== "edit" || sections !== "sections") return null;
  if (!entity || !id) return null;
  return { entity, id };
}

type DocumentEditOperation = "open" | "hydrate" | "preflight" | "resolve-change" | "discard" | "address";

function parseEditOperationPath(
  path: readonly string[],
): { operation: DocumentEditOperation; params: { entity: string; id: string } } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, operation] = path;
  if (entities !== "entities" || edit !== "edit" || !entity || !id) return null;
  if (!operation || !(["open", "hydrate", "preflight", "resolve-change", "discard", "address"] as const).includes(operation as DocumentEditOperation)) {
    return null;
  }
  return { operation: operation as DocumentEditOperation, params: { entity, id } };
}

function parseEditCorePath(path: readonly string[]): { entity: string; id: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, core] = path;
  return entities === "entities" && edit === "edit" && core === "core" && entity && id
    ? { entity, id }
    : null;
}

function parseEditFieldOptionsPath(path: readonly string[]): { entity: string; id: string } | null {
  if (path.length !== 6) return null;
  const [entities, entity, id, edit, fieldOptions, batch] = path;
  return entities === "entities" && edit === "edit" && fieldOptions === "field-options" && batch === "batch" && entity && id
    ? { entity, id }
    : null;
}

function parseEditSectionDiscardPath(
  path: readonly string[],
): { entity: string; id: string; section: string } | null {
  if (path.length !== 7) return null;
  const [entities, entity, id, edit, sections, section, discard] = path;
  return entities === "entities" && edit === "edit" && sections === "sections" && discard === "discard" && entity && id && section
    ? { entity, id, section }
    : null;
}

function parseEditRowDiscardPath(
  path: readonly string[],
): { entity: string; id: string; collection: string; rowId: string } | null {
  if (path.length !== 8) return null;
  const [entities, entity, id, edit, rows, collection, rowId, discard] = path;
  return entities === "entities" && edit === "edit" && rows === "rows" && discard === "discard" && entity && id && collection && rowId
    ? { entity, id, collection, rowId }
    : null;
}

function parseEditEventsPath(
  path: readonly string[],
): { entity: string; id: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, events] = path;
  if (entities !== "entities" || edit !== "edit" || events !== "events") return null;
  if (!entity || !id) return null;
  return { entity, id };
}

function parseEditSubmitPath(
  path: readonly string[],
): { entity: string; id: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, submit] = path;
  if (entities !== "entities" || edit !== "edit" || submit !== "submit") return null;
  if (!entity || !id) return null;
  return { entity, id };
}

function parseEditRevertToBaselinePath(
  path: readonly string[],
): { entity: string; id: string } | null {
  if (path.length !== 5) return null;
  const [entities, entity, id, edit, operation] = path;
  if (entities !== "entities" || edit !== "edit" || operation !== "revert-to-baseline") return null;
  if (!entity || !id) return null;
  return { entity, id };
}
