"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
import {
  CONTRACT_OWNER_SECTIONS,
  dirtyPathsByOwner,
  issuesByPath,
  rebaseContract,
  resolveRebaseConflict,
  type ContractIssue,
  type ContractSectionKey,
  type JsonRecord,
} from "./contract-state";
import { AdvancedJsonEditor, StructuredContractEditor } from "./StructuredContractEditor";
import type { EntityDetail } from "./types";

type WorkspaceTab = ContractSectionKey | "review" | "advanced";

interface ContractEnvelope extends JsonRecord {
  contract?: unknown;
  contractHash?: unknown;
  lockVersion?: unknown;
  versionStatus?: unknown;
  permissions?: unknown;
  diagnostics?: unknown;
  artifacts?: unknown;
  diff?: unknown;
}

interface ConflictState {
  serverDocument: JsonRecord;
  serverHash: string;
  serverLockVersion: number;
  localDocument: JsonRecord;
  rebasedDocument: JsonRecord;
  paths: string[];
}

const OWNER_LABELS: Record<ContractSectionKey, { label: string; description: string }> = {
  catalog: { label: "Catalog", description: "Identity, classification, module, labels, plane eligibility and status." },
  runtime: { label: "Version contract", description: "Runtime/API switches, storage, identity, search, capabilities, concurrency and indexes." },
  version_contract: { label: "Legacy runtime", description: "Compatibility owner shown only while upgrading v2.0 documents." },
  fields: { label: "Fields", description: "Field semantics, type-specific configuration, defaults and query capabilities." },
  relations: { label: "Relations", description: "Entity/field references, relation resolution, deletion and mutation ownership." },
  surfaces: { label: "Surfaces", description: "Renderer, layout, security, grouping, density and field bindings." },
  operations: { label: "Operations", description: "Permissions, placement, handler, confirmation, execution and plane filters." },
  lifecycle: { label: "Lifecycle", description: "Binding, states, transitions, capability masks, gates, hooks and timers." },
  numbering: { label: "Numbering", description: "Multiple configurations, ordered segments, scope, reset and confirmation." },
  policy: { label: "Policy", description: "Baseline, tenant overlay, field security, access, retention, audit, filter and cache." },
  flows: { label: "Flows", description: "Flow headers, steps, sections, field bindings, conditions, permissions and operations." },
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function responseHash(response: Response, body: ContractEnvelope): string {
  return typeof body.contractHash === "string"
    ? body.contractHash
    : response.headers.get("ETag")?.replaceAll('"', "") ?? "";
}

function responseLock(response: Response, body: ContractEnvelope): number {
  return Number(body.lockVersion ?? response.headers.get("X-Contract-Lock-Version") ?? 0);
}

async function errorBody(response: Response): Promise<ContractEnvelope> {
  return await response.json().catch(() => ({})) as ContractEnvelope;
}

function diagnosticIssues(value: unknown): ContractIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const issue = item as JsonRecord;
    return [{
      path: typeof issue.path === "string"
        ? issue.path
        : Array.isArray(issue.path) ? `/${issue.path.join("/")}` : "/",
      code: typeof issue.code === "string" ? issue.code : undefined,
      message: String(issue.message ?? "Contract validation failed."),
      severity: issue.severity === "warning" || issue.severity === "info" ? issue.severity : "error",
    }];
  });
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : value === null || value === undefined ? 0 : 1;
}

export function MetaEntityContractWorkspace({ entity }: { entity: EntityDetail }) {
  const [versionId, setVersionId] = useState(entity.version_id ?? null);
  const [status, setStatus] = useState(entity.version_status ?? null);
  const [base, setBase] = useState<JsonRecord | null>(null);
  const [working, setWorking] = useState<JsonRecord | null>(null);
  const [baseHash, setBaseHash] = useState("");
  const [lockVersion, setLockVersion] = useState(0);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<ContractIssue[]>([]);
  const [compilePreview, setCompilePreview] = useState<unknown>(null);
  const [diffPreview, setDiffPreview] = useState<unknown>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("catalog");
  const firstLoad = useRef(true);

  const dirtyByOwner = useMemo(
    () => base && working ? dirtyPathsByOwner(base, working) : {},
    [base, working],
  );
  const dirtyOwners = useMemo(
    () => CONTRACT_OWNER_SECTIONS.filter((owner) => (dirtyByOwner[owner]?.length ?? 0) > 0),
    [dirtyByOwner],
  );
  const dirty = dirtyOwners.length > 0;
  const issueIndex = useMemo(() => issuesByPath(issues), [issues]);
  const can = useCallback((permission: string) => permissions.has(permission), [permissions]);
  const editable = status === "DRAFT" && can("metadata.contract.edit");

  const adoptEnvelope = useCallback((response: Response, envelope: ContractEnvelope) => {
    const document = record(envelope.contract);
    setBase(document);
    setWorking(document);
    setBaseHash(responseHash(response, envelope));
    setLockVersion(responseLock(response, envelope));
    setStatus(typeof envelope.versionStatus === "string" ? envelope.versionStatus : null);
    setPermissions(new Set(Array.isArray(envelope.permissions)
      ? envelope.permissions.filter((value): value is string => typeof value === "string")
      : []));
    setIssues(diagnosticIssues(envelope.diagnostics));
    setConflict(null);
  }, []);

  const load = useCallback(async (selectedVersionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await csrfFetch(
        `/api/relay/metadata/studio/entity-versions/${selectedVersionId}/contract-v2.1`,
      );
      const envelope = await errorBody(response);
      if (!response.ok) throw new Error(String(envelope.message ?? `Unable to load contract (${response.status}).`));
      setVersionId(selectedVersionId);
      adoptEnvelope(response, envelope);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [adoptEnvelope]);

  useEffect(() => {
    if (!firstLoad.current) return;
    firstLoad.current = false;
    const resolve = async () => {
      const code = entity.entity_code ?? entity.name;
      const response = await csrfFetch(`/api/relay/metadata/studio/entities/${encodeURIComponent(code)}/versions`);
      if (response.ok) {
        const versions = await response.json() as Array<{ id?: string; status?: string }>;
        const active = versions.find((version) => version.status === "DRAFT" || version.status === "IN_REVIEW");
        if (active?.id) return load(active.id);
      }
      if (entity.version_id) return load(entity.version_id);
      setLoading(false);
      setError("This entity has no contract version.");
    };
    void resolve();
  }, [entity.entity_code, entity.name, entity.version_id, load]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const linkGuard = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented) return;
      const link = (event.target as Element | null)?.closest("a[href]");
      if (link && !window.confirm("Discard unsaved Meta Entity Contract changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkGuard, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", linkGuard, true);
    };
  }, [dirty]);

  useEffect(() => {
    const owner = window.location.hash.slice(1) as WorkspaceTab;
    if (owner === "review" || owner === "advanced"
        || CONTRACT_OWNER_SECTIONS.includes(owner as ContractSectionKey)) {
      setActiveTab(owner);
    }
  }, []);

  async function openDraft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await csrfFetch("/api/relay/metadata/studio/contracts/v2.1/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_code: entity.entity_code ?? entity.name,
          base_version_id: versionId,
          change_type: "behavioral",
          change_summary: "Meta Entity Studio workspace edit",
        }),
      });
      const body = await errorBody(response);
      if (!response.ok) throw new Error(String(body.message ?? "Unable to create DRAFT."));
      const id = String(body.versionId ?? "");
      if (!id) throw new Error("Draft response did not include versionId.");
      await load(id);
      setNotice("DRAFT opened. All tabs now share this working document.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!versionId || !working) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await csrfFetch(
        `/api/relay/metadata/studio/entity-versions/${versionId}/contract-v2.1/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "If-Match": `"${baseHash}"`,
            "X-Contract-Lock-Version": String(lockVersion),
          },
          body: JSON.stringify(working),
        },
      );
      const body = await errorBody(response);
      const nextIssues = diagnosticIssues(body.diagnostics);
      setIssues(nextIssues);
      setCompilePreview(body.artifacts ?? null);
      if (!response.ok || body.valid === false) {
        setError(String(body.message ?? `${nextIssues.length} contract issues require attention.`));
        return false;
      }
      setNotice("Schema, semantic, reference, database and compile preflight passed.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function acceptConflict(response: Response, body: ContractEnvelope): Promise<boolean> {
    if (response.status !== 409 && response.status !== 412) return false;
    const serverDocument = record(body.currentDocument ?? body.contract);
    if (!Object.keys(serverDocument).length) {
      setError("The draft changed in another session. Reload before saving.");
      return true;
    }
    const result = rebaseContract(base ?? {}, working ?? {}, serverDocument);
    const nextHash = String(body.currentHash ?? body.contractHash ?? responseHash(response, body));
    const nextLock = Number(body.currentLockVersion ?? body.lockVersion ?? responseLock(response, body));
    if (!result.conflicts.length) {
      setBase(serverDocument);
      setWorking(result.document);
      setBaseHash(nextHash);
      setLockVersion(nextLock);
      setNotice("Another session changed different paths. Your edits were automatically rebased; save again.");
    } else {
      setConflict({
        serverDocument,
        serverHash: nextHash,
        serverLockVersion: nextLock,
        localDocument: working ?? {},
        rebasedDocument: result.document,
        paths: result.conflicts,
      });
      setError("Another session changed overlapping properties. Resolve each path before saving.");
    }
    return true;
  }

  async function save() {
    if (!versionId || !working || !base || !editable || !dirtyOwners.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let currentBase = base;
    let currentWorking = working;
    let currentHash = baseHash;
    let currentLock = lockVersion;
    try {
      for (const owner of dirtyOwners) {
        const response = await csrfFetch(
          `/api/relay/metadata/studio/entity-versions/${versionId}/contract-v2.1/${owner}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "If-Match": `"${currentHash}"`,
              "X-Contract-Lock-Version": String(currentLock),
              "Idempotency-Key": `workspace:${versionId}:${owner}:${currentHash}`,
            },
            body: JSON.stringify({
              value: currentWorking[owner],
              base_contract: currentBase,
            }),
          },
        );
        const body = await errorBody(response);
        if (!response.ok) {
          if (await acceptConflict(response, body)) return;
          setIssues(diagnosticIssues(body.diagnostics ?? body.issues));
          throw new Error(String(body.message ?? `Unable to save ${owner} (${response.status}).`));
        }
        const savedDocument = record(body.contract);
        const remaining = rebaseContract(currentBase, currentWorking, savedDocument);
        currentBase = savedDocument;
        currentWorking = remaining.document;
        currentHash = responseHash(response, body);
        currentLock = responseLock(response, body);
      }
      const reload = await csrfFetch(`/api/relay/metadata/studio/entity-versions/${versionId}/contract-v2.1`);
      const reloaded = await errorBody(reload);
      if (!reload.ok) throw new Error("Saved, but verification reload failed.");
      if (responseHash(reload, reloaded) !== currentHash) {
        throw new Error("Saved contract hash did not match the verification reload.");
      }
      adoptEnvelope(reload, reloaded);
      setNotice("All changed owners saved. Reload preserved the exact canonical Contract hash.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "submit" | "approve" | "reject") {
    if (!versionId || dirty) return;
    setBusy(true);
    setError(null);
    try {
      const response = await csrfFetch(
        `/api/relay/metadata/studio/entity-versions/${versionId}/contract-v2.1/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "If-Match": `"${baseHash}"`,
            "X-Contract-Lock-Version": String(lockVersion),
            "Idempotency-Key": `${action}:${versionId}:${baseHash}`,
          },
          body: JSON.stringify(action === "reject" ? { reason: "Returned from Meta Entity Studio review." } : {}),
        },
      );
      const body = await errorBody(response);
      if (!response.ok) {
        if (await acceptConflict(response, body)) return;
        throw new Error(String(body.message ?? `${action} failed.`));
      }
      await load(versionId);
      setNotice(action === "submit" ? "Submitted for independent review." : action === "approve"
        ? "Approved and atomically published for Admin, Neon and Mesh."
        : "Returned to DRAFT with review diagnostics.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function buildReview() {
    if (!base || !working) return;
    setBusy(true);
    try {
      const response = await csrfFetch("/api/relay/metadata/studio/contracts/v2.1/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before: base, after: working }),
      });
      const body = await errorBody(response);
      setDiffPreview(body.diff ?? body);
      await validate();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <WorkPanel title="Meta Entity Contract Workspace"><p className="text-sm text-muted-foreground">Loading the canonical contract…</p></WorkPanel>;

  const visibleOwners = CONTRACT_OWNER_SECTIONS.filter((owner) =>
    owner !== "version_contract" && working && owner in working);

  return (
    <div className="space-y-4">
      <WorkPanel
        title="Meta Entity Contract Workspace"
        description="One version, one ETag and one validation pipeline across every owner tab."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status === "DRAFT" ? "secondary" : "outline"}>{status ?? "NO VERSION"}</Badge>
            {dirty && <Badge variant="outline">{dirtyOwners.length} dirty owners</Badge>}
            {!editable && status !== "IN_REVIEW" && can("metadata.contract.draft.create")
              && <Button size="sm" onClick={() => void openDraft()} disabled={busy}>Open DRAFT</Button>}
            {editable && <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>Save changes</Button>}
            <Button size="sm" variant="outline" onClick={() => void validate()} disabled={busy || !working}>Validate</Button>
            {editable && can("metadata.contract.submit")
              && <Button size="sm" variant="outline" onClick={() => void transition("submit")} disabled={busy || dirty}>Submit</Button>}
            {status === "IN_REVIEW" && can("metadata.contract.review")
              && <Button size="sm" variant="outline" onClick={() => void transition("reject")} disabled={busy}>Reject</Button>}
            {status === "IN_REVIEW" && can("metadata.contract.review") && can("metadata.contract.publish")
              && <Button size="sm" onClick={() => void transition("approve")} disabled={busy}>Approve & publish</Button>}
          </div>
        }
      >
        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
          <span>Entity: {entity.entity_code ?? entity.name}</span>
          <span>Version: {versionId ?? "—"}</span>
          <span>ETag: {baseHash ? baseHash.slice(0, 12) : "—"}</span>
          <span>Lock: {lockVersion}</span>
        </div>
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {status !== "DRAFT" && <p className="mt-3 text-sm text-muted-foreground">This version is immutable. Open a DRAFT to edit.</p>}
      </WorkPanel>

      {conflict && (
        <WorkPanel title="Resolve overlapping changes" description="Choose your local value or the latest server value for every overlapping path.">
          <div className="space-y-2">
            {conflict.paths.map((path) => (
              <div key={path} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <code className="text-xs">{path}</code>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConflict((current) => current ? {
                    ...current,
                    paths: current.paths.filter((item) => item !== path),
                  } : null)}>Use server</Button>
                  <Button size="sm" onClick={() => setConflict((current) => current ? {
                    ...current,
                    rebasedDocument: resolveRebaseConflict(current.rebasedDocument, current.localDocument, path, "local"),
                    paths: current.paths.filter((item) => item !== path),
                  } : null)}>Keep mine</Button>
                </div>
              </div>
            ))}
            {!conflict.paths.length && <Button onClick={() => {
              setBase(conflict.serverDocument);
              setWorking(conflict.rebasedDocument);
              setBaseHash(conflict.serverHash);
              setLockVersion(conflict.serverLockVersion);
              setConflict(null);
              setError(null);
              setNotice("Conflict choices applied. Review and save the rebased document.");
            }}>Apply conflict choices</Button>}
          </div>
        </WorkPanel>
      )}

      {working && (
        <Tabs value={activeTab} onValueChange={(value) => {
          const tab = value as WorkspaceTab;
          setActiveTab(tab);
          window.history.replaceState(null, "", `#${tab}`);
        }}>
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
            {visibleOwners.map((owner) => (
              <TabsTrigger key={owner} value={owner}>
                {OWNER_LABELS[owner].label}
                {(dirtyByOwner[owner]?.length ?? 0) > 0 ? " •" : ""}
              </TabsTrigger>
            ))}
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="advanced">Advanced JSON</TabsTrigger>
          </TabsList>

          {visibleOwners.map((owner) => (
            <TabsContent key={owner} value={owner}>
              <WorkPanel
                title={OWNER_LABELS[owner].label}
                description={OWNER_LABELS[owner].description}
                actions={<Badge variant="outline">{count(working[owner])} configured</Badge>}
              >
                <StructuredContractEditor
                  name={owner}
                  value={working[owner]}
                  path={[owner]}
                  disabled={!editable}
                  issues={issueIndex}
                  onChange={(value) => setWorking((current) => current ? { ...current, [owner]: value } : current)}
                />
              </WorkPanel>
            </TabsContent>
          ))}

          <TabsContent value="review">
            <div className="space-y-4">
              <WorkPanel
                title="Review and impact"
                description="Canonical owner diff, path-level diagnostics and compiled Admin/Neon/Mesh preview."
                actions={<Button size="sm" onClick={() => void buildReview()} disabled={busy}>Refresh review</Button>}
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Dirty owners</p><p className="text-sm">{dirtyOwners.join(", ") || "None"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Changed paths</p><p className="text-sm">{Object.values(dirtyByOwner).flat().length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Validation issues</p><p className="text-sm">{issues.length}</p></div>
                </div>
              </WorkPanel>
              {issues.length > 0 && (
                <WorkPanel title="Path-indexed issues">
                  <div className="space-y-2">
                    {issues.map((issue, index) => (
                      <div key={`${issue.path}-${index}`} className="rounded-md border p-3">
                        <code className="text-xs">{issue.path}</code>
                        <p className="text-sm">{issue.message}</p>
                      </div>
                    ))}
                  </div>
                </WorkPanel>
              )}
              <WorkPanel title="Owner diff">
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(diffPreview ?? dirtyByOwner, null, 2)}</pre>
              </WorkPanel>
              <WorkPanel title="Compiled preview">
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(compilePreview ?? { admin: "Run validation", neon: "Run validation", mesh: "Run validation" }, null, 2)}</pre>
              </WorkPanel>
            </div>
          </TabsContent>

          <TabsContent value="advanced">
            <WorkPanel title="Advanced JSON" description="This view edits the same working document and uses the same save, validation and concurrency pipeline.">
              <AdvancedJsonEditor value={working} disabled={!editable} onChange={(value) => setWorking(record(value))} />
            </WorkPanel>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
