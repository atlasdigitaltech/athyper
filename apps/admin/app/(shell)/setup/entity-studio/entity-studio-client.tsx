"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_META_ENTITY_STUDIO_SNAPSHOT,
  type MetaEntityCreateCommand,
  type MetaEntityDiagnostic,
  type MetaEntityPhase2Graph,
  type MetaEntityStudioSnapshot,
} from "@athyper/meta-entity-authoring-contracts";
import {
  createMetaEntityAuthoringClient,
  graphFromStudioSnapshot,
  MetaEntityApiError,
} from "@athyper/meta-entity-runtime";
import {
  MetaEntityStudio,
  type MetaEntityReleaseAction,
  type MetaEntityReleaseDraft,
  type MetaEntityStudioRequestState,
  type MetaEntityTransitionAction,
} from "@athyper/meta-entity-studio-ui";

function apiMessage(error: unknown): string {
  if (error instanceof MetaEntityApiError) return error.message;
  return error instanceof Error ? error.message : "The Meta Entity Studio request failed.";
}

function diagnosticsFrom(error: unknown): readonly MetaEntityDiagnostic[] {
  if (!(error instanceof MetaEntityApiError) || !Array.isArray(error.detail)) return [];
  return error.detail.filter((item): item is MetaEntityDiagnostic => Boolean(
    item && typeof item === "object" && "code" in item && "severity" in item && "message" in item && "section" in item,
  ));
}

export function EntityStudioClient() {
  const client = useMemo(() => createMetaEntityAuthoringClient(
    (input, init) => fetch(input, init as RequestInit),
  ), []);
  const [snapshot, setSnapshot] = useState<MetaEntityStudioSnapshot>(EMPTY_META_ENTITY_STUDIO_SNAPSHOT);
  const [requestState, setRequestState] = useState<MetaEntityStudioRequestState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [changedPaths, setChangedPaths] = useState<readonly string[] | null>(null);

  const load = useCallback(async (entityId?: string | null, changeSetId?: string | null, signal?: AbortSignal) => {
    setRequestState("loading"); setMessage(null);
    try {
      const next = await client.loadStudio({ entityId, changeSetId, signal });
      setSnapshot(next); setDirty(false); setChangedPaths(null); setRequestState("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequestState("error"); setMessage(apiMessage(error));
    }
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    void load(null, null, controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectEntity = (entityId: string) => {
    if (dirty && !window.confirm("Discard unsaved Entity changes and open another Entity?")) return;
    void load(entityId);
  };
  const selectChangeSet = (changeSetId: string) => {
    if (dirty && !window.confirm("Discard unsaved Entity changes and open another change set?")) return;
    void load(snapshot.activeEntityId, changeSetId);
  };
  const updateGraph = (graph: MetaEntityPhase2Graph) => {
    setSnapshot((current) => ({ ...current, ...graph }));
    setDirty(true); setMessage(null); setRequestState("idle");
  };

  const persist = async (): Promise<MetaEntityStudioSnapshot | null> => {
    const changeSet = snapshot.activeChangeSet;
    const graph = graphFromStudioSnapshot(snapshot);
    if (!changeSet || !graph) return null;
    const result = await client.saveGraph(changeSet.id, changeSet.lockVersion, graph);
    const nextChangeSet = { ...changeSet, lockVersion: result.lockVersion };
    const next: MetaEntityStudioSnapshot = {
      ...snapshot,
      activeChangeSet: nextChangeSet,
      changeSets: snapshot.changeSets.map((candidate) => candidate.id === nextChangeSet.id ? nextChangeSet : candidate),
      runtimeProfile: result.graph.runtimeProfile,
      fields: result.graph.fields,
      keys: result.graph.keys,
      searchProfiles: result.graph.searchProfiles,
      relations: result.graph.relations,
      surfaces: result.graph.surfaces,
      operations: result.graph.operations,
      surfaceOperations: result.graph.surfaceOperations,
      operationRules: result.graph.operationRules,
      flows: result.graph.flows,
      policyBindings: result.graph.policyBindings,
      fieldPolicyBindings: result.graph.fieldPolicyBindings,
      testCases: result.graph.testCases,
      lifecycleBindings: result.graph.lifecycleBindings,
      lifecycleOperationBindings: result.graph.lifecycleOperationBindings,
      numberingBindings: result.graph.numberingBindings,
      diagnostics: result.diagnostics,
    };
    setSnapshot(next); setDirty(false);
    return next;
  };

  const save = async () => {
    setRequestState("saving"); setMessage(null);
    try {
      await persist(); setRequestState("idle"); setMessage("Changes saved with optimistic lock advancement.");
    } catch (error) {
      const diagnostics = diagnosticsFrom(error);
      if (diagnostics.length) setSnapshot((current) => ({ ...current, diagnostics }));
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const validate = async () => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("validating"); setMessage(null);
    try {
      const persisted = dirty ? await persist() : snapshot;
      const changeSetId = persisted?.activeChangeSet?.id ?? active.id;
      const result = await client.validate(changeSetId);
      setSnapshot((current) => ({ ...current, diagnostics: result.diagnostics }));
      setRequestState("idle"); setMessage(result.valid ? "The persisted Entity graph is valid." : "Validation found contract problems.");
    } catch (error) {
      const diagnostics = diagnosticsFrom(error);
      if (diagnostics.length) setSnapshot((current) => ({ ...current, diagnostics }));
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const reload = () => {
    if (dirty && !window.confirm("Discard unsaved Entity changes and reload the server version?")) return;
    void load(snapshot.activeEntityId, snapshot.activeChangeSet?.id);
  };

  const createEntity = async (command: MetaEntityCreateCommand) => {
    setRequestState("creating"); setMessage(null);
    try {
      const created = await client.createEntity(command);
      await load(created.id);
      setMessage(`Created ${created.moduleCode}.${created.entityCode} with an initial draft.`);
    } catch (error) {
      setRequestState("error"); setMessage(apiMessage(error));
    }
  };

  const checkpoint = async (compatibilityLevel: "backward_compatible" | "forward_compatible" | "full" | "breaking") => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("acting"); setMessage(null);
    try {
      const persisted = dirty ? await persist() : snapshot;
      const current = persisted?.activeChangeSet ?? active;
      const result = await client.checkpoint(current.id, {
        expectedLockVersion: current.lockVersion,
        compatibilityLevel,
      });
      await load(snapshot.activeEntityId, current.id);
      setMessage(`Checkpoint revision ${result.revisionNo} captured.`);
    } catch (error) {
      const diagnostics = diagnosticsFrom(error);
      if (diagnostics.length) setSnapshot((current) => ({ ...current, diagnostics }));
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const runContractTests = async () => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("testing"); setMessage(null);
    try {
      const persisted = dirty ? await persist() : snapshot;
      const current = persisted?.activeChangeSet ?? active;
      const run = await client.runContractTests(current.id, current.lockVersion);
      await load(snapshot.activeEntityId, current.id);
      setMessage(`Contract test run ${run.status}: ${run.passedCount}/${run.totalCount} assertions matched.`);
    } catch (error) {
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const previewNumbering = async (numberingBindingId: string, input: { nextValue: number; occurredAt: string; scopeKey?: string | null; fiscalYear?: string | null }) => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("numbering-testing"); setMessage(null);
    try {
      const persisted = dirty ? await persist() : snapshot;
      const current = persisted?.activeChangeSet ?? active;
      const artifact = await client.previewNumbering(current.id, {
        expectedLockVersion: current.lockVersion, numberingBindingId, ...input,
      });
      await load(snapshot.activeEntityId, current.id);
      setMessage(artifact.status === "passed"
        ? `Compiled numbering preview ${String(artifact.actualOutput.formattedNumber ?? "")} without advancing a counter.`
        : `Numbering preview failed: ${artifact.diagnostics.map((item) => item.message).join("; ")}`);
    } catch (error) {
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const transition = async (action: MetaEntityTransitionAction, reason?: string) => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("acting"); setMessage(null);
    try {
      const updated = await client.transition(active.id, action, {
        expectedLockVersion: active.lockVersion,
        reason: reason?.trim() || undefined,
      });
      await load(snapshot.activeEntityId, updated.id);
      setMessage(`Change set moved to ${updated.status.replace("_", " ")}.`);
    } catch (error) {
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const release = async (action: MetaEntityReleaseAction, draft: MetaEntityReleaseDraft) => {
    const active = snapshot.activeChangeSet;
    if (!active) return;
    setRequestState("acting"); setMessage(null);
    try {
      const result = await client.publish(active.id, action, {
        expectedLockVersion: active.lockVersion,
        revisionId: draft.revisionId,
        versionLabel: draft.versionLabel,
        rollbackOfReleaseId: draft.rollbackOfReleaseId,
        targetPlanes: draft.targetPlanes,
        minimumRuntimeVersion: draft.minimumRuntimeVersion,
        reason: draft.reason,
        ticketReference: draft.ticketReference,
      });
      await load(snapshot.activeEntityId, active.id);
      setMessage(`Release ${result.releaseNo} created successfully.`);
    } catch (error) {
      setRequestState(error instanceof MetaEntityApiError && error.status === 409 ? "conflict" : "error");
      setMessage(apiMessage(error));
    }
  };

  const compare = async (leftRevisionId: string, rightRevisionId: string) => {
    setRequestState("comparing"); setMessage(null);
    try {
      setChangedPaths(await client.diffRevisions(leftRevisionId, rightRevisionId));
      setRequestState("idle");
    } catch (error) {
      setRequestState("error"); setMessage(apiMessage(error));
    }
  };

  return <MetaEntityStudio snapshot={snapshot} requestState={requestState} message={message} dirty={dirty} changedPaths={changedPaths} onCreateEntity={(command) => void createEntity(command)} onSelectEntity={selectEntity} onSelectChangeSet={selectChangeSet} onGraphChange={updateGraph} onSave={() => void save()} onValidate={() => void validate()} onRunContractTests={() => void runContractTests()} onPreviewNumbering={(bindingId, input) => void previewNumbering(bindingId, input)} onCheckpoint={(compatibility) => void checkpoint(compatibility)} onTransition={(action, reason) => void transition(action, reason)} onRelease={(action, draft) => void release(action, draft)} onDiff={(left, right) => void compare(left, right)} onReload={reload} />;
}
