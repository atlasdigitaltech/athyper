"use client";

import { useEffect, useMemo, useReducer, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  CircleDot,
  FlaskConical,
  GitBranch,
  History,
  Hash,
  KeyRound,
  Link2,
  ListFilter,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Input } from "@athyper/platform-ui";
import type {
  MetaEntityDiagnostic,
  MetaEntityCreateCommand,
  MetaEntityPhase2Graph,
  MetaEntityStudioSection,
  MetaEntityStudioSnapshot,
} from "@athyper/meta-entity-authoring-contracts";
import {
  createMetaEntityStudioState,
  isEditableChangeSet,
  reduceMetaEntityStudioState,
  selectActiveEntity,
  selectDiagnosticsBySeverity,
  selectVisibleEntities,
} from "@athyper/meta-entity-runtime";
import { KeysPanel, SearchPanel } from "./binding-panels";
import { selectClassName } from "./editor-controls";
import { FieldsPanel } from "./fields-panel";
import { OverviewPanel } from "./overview-panel";
import { RelationsPanel } from "./relations-panel";
import { LifecyclePanel } from "./lifecycle-panel";
import { SurfacesPanel } from "./surfaces-panel";
import { OperationsPanel } from "./operations-panel";
import { NumberingPanel } from "./numbering-panel";
import { FlowsPanel, OperationCompositionPanel, PoliciesPanel, TestsPanel } from "./phase4-panels";
import { CreateEntityDialog } from "./create-entity-dialog";
import {
  ActivityPanel,
  HistoryPanel,
  WorkflowPanel,
  type MetaEntityReleaseAction,
  type MetaEntityReleaseDraft,
  type MetaEntityTransitionAction,
} from "./workflow-panels";

const sections: ReadonlyArray<{ id: MetaEntityStudioSection; label: string; icon: typeof Settings2 }> = [
  { id: "overview", label: "Overview", icon: Settings2 },
  { id: "fields", label: "Fields", icon: Boxes },
  { id: "keys", label: "Keys", icon: KeyRound },
  { id: "search", label: "Search", icon: ListFilter },
  { id: "relations", label: "Relations", icon: Link2 },
  { id: "surfaces", label: "Surfaces", icon: LayoutTemplate },
  { id: "operations", label: "Operations", icon: Play },
  { id: "flows", label: "Flows", icon: GitBranch },
  { id: "policies", label: "Policies", icon: ShieldCheck },
  { id: "lifecycle", label: "Lifecycle", icon: GitBranch },
  { id: "numbering", label: "Numbering", icon: Hash },
  { id: "tests", label: "Tests", icon: FlaskConical },
  { id: "history", label: "History", icon: History },
  { id: "activity", label: "Activity", icon: CircleDot },
];

export type MetaEntityStudioRequestState = "idle" | "loading" | "saving" | "validating" | "testing" | "numbering-testing" | "creating" | "acting" | "comparing" | "error" | "conflict";

export interface MetaEntityStudioProps {
  snapshot: MetaEntityStudioSnapshot;
  requestState?: MetaEntityStudioRequestState;
  message?: string | null;
  dirty?: boolean;
  changedPaths?: readonly string[] | null;
  onCreateEntity?: (command: MetaEntityCreateCommand) => void;
  onSelectEntity?: (entityId: string) => void;
  onSelectChangeSet?: (changeSetId: string) => void;
  onGraphChange?: (graph: MetaEntityPhase2Graph) => void;
  onSave?: () => void;
  onValidate?: () => void;
  onRunContractTests?: () => void;
  onPreviewNumbering?: (bindingId: string, input: { nextValue: number; occurredAt: string; scopeKey?: string | null; fiscalYear?: string | null }) => void;
  onCheckpoint?: (compatibility: "backward_compatible" | "forward_compatible" | "full" | "breaking") => void;
  onTransition?: (action: MetaEntityTransitionAction, reason?: string) => void;
  onRelease?: (action: MetaEntityReleaseAction, draft: MetaEntityReleaseDraft) => void;
  onDiff?: (leftRevisionId: string, rightRevisionId: string) => void;
  onReload?: () => void;
}

function ChangeSetBadge({ status }: { status: string }) {
  const variant = status === "approved" || status === "published" ? "success" : status === "rejected" ? "destructive" : status === "in_review" ? "info" : "secondary";
  return <Badge variant={variant}>{status.replace("_", " ")}</Badge>;
}

function EmptyEntityState({ onCreateEntity, loading, message, onReload }: { onCreateEntity?: () => void; loading: boolean; message?: string | null; onReload?: () => void }) {
  return (
    <section className="flex min-h-screen items-center justify-center bg-background p-6" aria-labelledby="empty-entity-title">
      <div className="w-full max-w-xl rounded-xl border border-dashed border-border bg-card p-8 text-center text-card-foreground shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">{loading ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <Boxes className="size-6" aria-hidden />}</div>
        <h1 id="empty-entity-title" className="mt-4 text-xl font-semibold text-foreground">{loading ? "Loading Entity Studio" : "Entity Studio"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message ?? (loading ? "Loading the canonical catalog and class profiles." : "No canonical Entity definitions are visible in this authorization scope.")}</p>
        <div className="mt-6 flex justify-center gap-2"><Button variant="outline" onClick={onReload} disabled={!onReload || loading}><RefreshCw className="size-4" aria-hidden />Retry</Button><Button onClick={onCreateEntity} disabled={!onCreateEntity || loading}><Plus className="size-4" aria-hidden />Create Entity</Button></div>
      </div>
    </section>
  );
}

function EntityNavigator({ query, entities, activeEntityId, onQuery, onSelect, onCreateEntity, disabled }: { query: string; entities: ReturnType<typeof selectVisibleEntities>; activeEntityId: string | null; onQuery: (query: string) => void; onSelect: (entityId: string) => void; onCreateEntity?: () => void; disabled: boolean }) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-card text-card-foreground" aria-label="Entity navigator">
      <div className="border-b border-border p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Entities</p><p className="text-xs text-muted-foreground">Canonical definitions</p></div><Button variant="ghost" size="iconSm" aria-label="Create Entity" onClick={onCreateEntity} disabled={!onCreateEntity || disabled}><Plus className="size-4" aria-hidden /></Button></div><label className="relative mt-3 block"><span className="sr-only">Search Entities</span><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => onQuery(event.target.value)} placeholder="Search Entities" className="pl-9" /></label></div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">{entities.map((entity) => { const active = entity.id === activeEntityId; return <button key={entity.id} type="button" disabled={disabled} onClick={() => onSelect(entity.id)} aria-current={active ? "page" : undefined} className={active ? "w-full rounded-lg border border-border bg-accent px-3 py-2 text-left text-accent-foreground" : "w-full rounded-lg border border-transparent px-3 py-2 text-left text-foreground transition-colors hover:bg-muted disabled:opacity-50"}><span className="block truncate text-sm font-medium">{entity.entityCode}</span><span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{entity.moduleCode}</span><span>{entity.currentReleaseNo == null ? "Unpublished" : `Release ${entity.currentReleaseNo}`}</span></span></button>; })}{!entities.length && <p className="p-4 text-center text-sm text-muted-foreground">No matching Entities.</p>}</div>
    </aside>
  );
}

function ProblemsPanel({ diagnostics, onOpen }: { diagnostics: readonly MetaEntityDiagnostic[]; onOpen: (diagnostic: MetaEntityDiagnostic) => void }) {
  return <section className="border-t border-border bg-card" aria-label="Validation problems"><div className="max-h-48 overflow-y-auto">{!diagnostics.length ? <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden />No validation problems.</div> : diagnostics.map((diagnostic) => <button type="button" key={diagnostic.id} onClick={() => onOpen(diagnostic)} className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted"><AlertCircle className={diagnostic.severity === "error" ? "mt-0.5 size-4 text-destructive" : "mt-0.5 size-4 text-warning"} aria-hidden /><span className="min-w-0"><span className="block font-mono text-xs text-muted-foreground">{diagnostic.code}</span><span className="mt-1 block text-sm text-foreground">{diagnostic.message}</span></span></button>)}</div></section>;
}

export function MetaEntityStudio({ snapshot, requestState = "idle", message, dirty = false, changedPaths = null, onCreateEntity, onSelectEntity, onSelectChangeSet, onGraphChange, onSave, onValidate, onRunContractTests, onPreviewNumbering, onCheckpoint, onTransition, onRelease, onDiff, onReload }: MetaEntityStudioProps) {
  const [state, dispatch] = useReducer(reduceMetaEntityStudioState, snapshot, createMetaEntityStudioState);
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => dispatch({ type: "replace_snapshot", snapshot }), [snapshot]);
  const entities = useMemo(() => selectVisibleEntities(state), [state]);
  const activeEntity = selectActiveEntity(state);
  const counts = selectDiagnosticsBySeverity(state.snapshot.diagnostics);
  const loading = requestState === "loading";
  const busy = loading || requestState === "saving" || requestState === "validating" || requestState === "testing" || requestState === "numbering-testing" || requestState === "creating" || requestState === "acting" || requestState === "comparing";
  const editable = state.snapshot.capabilities.author && isEditableChangeSet(state.snapshot.activeChangeSet) && Boolean(onGraphChange) && !busy;
  const graphChange = (patch: Partial<MetaEntityPhase2Graph>) => {
    const current = state.snapshot.runtimeProfile;
    if (!current || !onGraphChange) return;
    onGraphChange({ runtimeProfile: current, fields: state.snapshot.fields, keys: state.snapshot.keys, searchProfiles: state.snapshot.searchProfiles, relations: state.snapshot.relations, surfaces: state.snapshot.surfaces, operations: state.snapshot.operations, surfaceOperations: state.snapshot.surfaceOperations, operationRules: state.snapshot.operationRules, flows: state.snapshot.flows, policyBindings: state.snapshot.policyBindings, fieldPolicyBindings: state.snapshot.fieldPolicyBindings, testCases: state.snapshot.testCases, lifecycleBindings: state.snapshot.lifecycleBindings, lifecycleOperationBindings: state.snapshot.lifecycleOperationBindings, numberingBindings: state.snapshot.numberingBindings, ...patch });
  };

  if (!activeEntity && !state.snapshot.entities.length) return <><EmptyEntityState onCreateEntity={onCreateEntity && state.snapshot.capabilities.author ? () => setCreateOpen(true) : undefined} loading={loading} message={message} onReload={onReload} /><CreateEntityDialog open={createOpen} moduleCoordinates={state.snapshot.moduleCoordinates} classProfiles={state.snapshot.classProfiles} busy={busy} onOpenChange={setCreateOpen} onCreate={(command) => { setCreateOpen(false); onCreateEntity?.(command); }} /></>;
  const classProfile = state.snapshot.classProfiles.find((profile) => profile.entityClass === activeEntity?.entityClass) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3 text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-lg font-semibold">{activeEntity?.entityCode ?? "Entity Studio"}</h1>{activeEntity && <Badge variant="outline">{activeEntity.tenantId ? "Tenant" : "Global"}</Badge>}{state.snapshot.activeChangeSet && <ChangeSetBadge status={state.snapshot.activeChangeSet.status} />}{dirty && <Badge variant="warning">Unsaved</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{activeEntity?.moduleCode ?? "Canonical Meta Entity authoring"}{state.snapshot.activeChangeSet ? ` · ${state.snapshot.activeChangeSet.code}/${state.snapshot.activeChangeSet.branchCode} · lock ${state.snapshot.activeChangeSet.lockVersion}` : ""}</p></div>
          <div className="flex flex-wrap items-end gap-2">
            {state.snapshot.changeSets.length > 0 && <label className="grid gap-1 text-xs font-medium text-muted-foreground">Change set<select aria-label="Active change set" className={`${selectClassName} min-w-48`} disabled={busy} value={state.snapshot.activeChangeSet?.id ?? ""} onChange={(event) => onSelectChangeSet?.(event.target.value)}>{state.snapshot.changeSets.map((changeSet) => <option key={changeSet.id} value={changeSet.id}>{changeSet.code} · {changeSet.status.replace("_", " ")}</option>)}</select></label>}
            <Button variant="outline" size="sm" onClick={onReload} disabled={!onReload || busy}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden />Refresh</Button>
            <Button variant="outline" size="sm" onClick={onValidate} disabled={!onValidate || busy || !state.snapshot.activeChangeSet}><CheckCircle2 className="size-4" aria-hidden />Validate</Button>
            <Button size="sm" onClick={onSave} disabled={!onSave || busy || !dirty || !editable}><Save className="size-4" aria-hidden />{requestState === "saving" ? "Saving" : "Save changes"}</Button>
          </div>
        </div>
      </header>

      {(message || requestState === "conflict" || requestState === "error") && <div role={requestState === "error" || requestState === "conflict" ? "alert" : "status"} className={requestState === "error" || requestState === "conflict" ? "flex items-center gap-3 border-b border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive" : "flex items-center gap-3 border-b border-border bg-muted px-4 py-3 text-sm text-muted-foreground"}><AlertCircle className="size-4 shrink-0" aria-hidden /><span>{message}</span>{requestState === "conflict" && <Button className="ml-auto" variant="outline" size="sm" onClick={onReload}>Reload server version</Button>}</div>}
      {state.snapshot.activeChangeSet && !editable && <div className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">This change set is {state.snapshot.activeChangeSet.status.replace("_", " ")} and is displayed read-only. Select a draft or rejected change set to edit.</div>}
      {state.snapshot.activeChangeSet && <WorkflowPanel changeSet={state.snapshot.activeChangeSet} revisions={state.snapshot.revisions} releases={state.snapshot.releases} capabilities={state.snapshot.capabilities} tenantOwned={Boolean(activeEntity?.tenantId)} busy={busy} dirty={dirty} onTransition={onTransition} onRelease={onRelease} />}

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-3 xl:col-span-2"><EntityNavigator query={state.entityQuery} entities={entities} activeEntityId={state.snapshot.activeEntityId} onQuery={(query) => dispatch({ type: "search_entities", query })} onSelect={(entityId) => onSelectEntity?.(entityId)} onCreateEntity={onCreateEntity && state.snapshot.capabilities.author ? () => setCreateOpen(true) : undefined} disabled={busy} /></div>
        <main className="min-w-0 lg:col-span-9 xl:col-span-10">
          <nav className="flex overflow-x-auto border-b border-border bg-card px-3" aria-label="Entity authoring sections">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => dispatch({ type: "select_section", section: id })} aria-current={state.section === id ? "page" : undefined} className={state.section === id ? "flex shrink-0 items-center gap-2 border-b-2 border-primary px-3 py-3 text-sm font-medium text-foreground" : "flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-muted-foreground hover:text-foreground"}><Icon className="size-4" aria-hidden />{label}</button>)}</nav>
          <div className="p-4">
            {!state.snapshot.runtimeProfile ? <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">This change set has no Phase 2 graph.</div> : <>
              {state.section === "overview" && <OverviewPanel profile={state.snapshot.runtimeProfile} classProfile={classProfile} fields={state.snapshot.fields} editable={editable} onChange={(runtimeProfile) => graphChange({ runtimeProfile })} />}
              {state.section === "fields" && <FieldsPanel fields={state.snapshot.fields} selectedFieldId={state.selectedFieldId} editable={editable} onSelect={(fieldId) => dispatch({ type: "select_field", fieldId })} onOpenDependencies={(section, fieldId) => { dispatch({ type: "select_field", fieldId }); dispatch({ type: "select_section", section }); }} onChange={(fields) => graphChange({ fields })} />}
              {state.section === "keys" && <KeysPanel fields={state.snapshot.fields} keys={state.snapshot.keys} editable={editable} focusFieldId={state.selectedFieldId} onChange={(keys) => graphChange({ keys })} />}
              {state.section === "search" && <SearchPanel fields={state.snapshot.fields} profiles={state.snapshot.searchProfiles} editable={editable} focusFieldId={state.selectedFieldId} onChange={(searchProfiles) => graphChange({ searchProfiles })} />}
              {state.section === "relations" && activeEntity && <RelationsPanel sourceEntity={activeEntity} entities={state.snapshot.entities} fields={state.snapshot.fields} relations={state.snapshot.relations} editable={editable} focusFieldId={state.selectedFieldId} onChange={(relations) => graphChange({ relations })} />}
              {state.section === "surfaces" && <SurfacesPanel fields={state.snapshot.fields} surfaces={state.snapshot.surfaces} editable={editable} onChange={(surfaces) => graphChange({ surfaces })} />}
              {state.section === "operations" && <><OperationsPanel operations={state.snapshot.operations} surfaces={state.snapshot.surfaces} editable={editable} onChange={(operations) => graphChange({ operations })} /><OperationCompositionPanel operations={state.snapshot.operations} surfaces={state.snapshot.surfaces} placements={state.snapshot.surfaceOperations} rules={state.snapshot.operationRules} editable={editable} onPlacementsChange={(surfaceOperations) => graphChange({ surfaceOperations })} onRulesChange={(operationRules) => graphChange({ operationRules })} /></>}
              {state.section === "flows" && <FlowsPanel flows={state.snapshot.flows} surfaces={state.snapshot.surfaces} operations={state.snapshot.operations} editable={editable} onChange={(flows) => graphChange({ flows })} />}
              {state.section === "policies" && <PoliciesPanel bindings={state.snapshot.policyBindings} fieldBindings={state.snapshot.fieldPolicyBindings} policyDefinitions={state.snapshot.policyDefinitions} operations={state.snapshot.operations} fields={state.snapshot.fields} editable={editable} onBindingsChange={(policyBindings) => graphChange({ policyBindings })} onFieldBindingsChange={(fieldPolicyBindings) => graphChange({ fieldPolicyBindings })} />}
              {state.section === "lifecycle" && <LifecyclePanel bindings={state.snapshot.lifecycleBindings} operationBindings={state.snapshot.lifecycleOperationBindings} fields={state.snapshot.fields} operations={state.snapshot.operations} editable={editable} onBindingsChange={(lifecycleBindings) => graphChange({ lifecycleBindings })} onOperationBindingsChange={(lifecycleOperationBindings) => graphChange({ lifecycleOperationBindings })} />}
              {state.section === "numbering" && <NumberingPanel bindings={state.snapshot.numberingBindings} fields={state.snapshot.fields} operations={state.snapshot.operations} artifacts={state.snapshot.numberingTestArtifacts} editable={editable} testing={requestState === "numbering-testing"} onPreview={onPreviewNumbering} onChange={(numberingBindings) => graphChange({ numberingBindings })} />}
              {state.section === "tests" && <TestsPanel tests={state.snapshot.testCases} runs={state.snapshot.testRuns} results={state.snapshot.activeTestRunResults} operations={state.snapshot.operations} flows={state.snapshot.flows} editable={editable} running={requestState === "testing"} onRun={state.snapshot.capabilities.author ? onRunContractTests : undefined} onChange={(testCases) => graphChange({ testCases })} />}
              {state.section === "history" && <HistoryPanel revisions={state.snapshot.revisions} releases={state.snapshot.releases} mutable={Boolean(activeEntity?.tenantId) && editable && state.snapshot.capabilities.author} busy={busy} changedPaths={changedPaths} onCheckpoint={onCheckpoint} onDiff={onDiff} />}
              {state.section === "activity" && <ActivityPanel activity={state.snapshot.activity} />}
            </>}
          </div>
        </main>
      </div>

      <button type="button" onClick={() => dispatch({ type: "toggle_problems" })} aria-expanded={state.problemsOpen} className="flex items-center gap-3 border-t border-border bg-muted px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"><GitBranch className="size-4" aria-hidden />Problems<span className="ml-auto">{counts.error} errors · {counts.warning} warnings</span></button>
      {state.problemsOpen && <ProblemsPanel diagnostics={state.snapshot.diagnostics} onOpen={(diagnostic) => { dispatch({ type: "select_section", section: diagnostic.section }); if (diagnostic.section === "fields") dispatch({ type: "select_field", fieldId: diagnostic.objectId ?? null }); }} />}
      <CreateEntityDialog open={createOpen} moduleCoordinates={state.snapshot.moduleCoordinates} classProfiles={state.snapshot.classProfiles} busy={busy} onOpenChange={setCreateOpen} onCreate={(command) => { setCreateOpen(false); onCreateEntity?.(command); }} />
    </div>
  );
}
