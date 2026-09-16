"use client";
import { TaskRuleControls } from "./task-rule-controls";
import { useRef, useState } from "react";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { exampleTaskEditPolicy, type Draft, type Revision } from "./task-edit-policy-example";
const baselines = createOperation<{ id: string; scope: object; release_id: string | null; publication: { manifests: { profile: { code: string }; tasks: { code: string; executionKind: string; informationPolicy?: object; escalationPolicy?: object; caseAuthority?: object }[] }[] } }[]>({method:"GET",path:"/api/studio/supplier-task-rule-baselines"});
const author = createOperation<Revision, Draft>({ method: "POST", path: "/api/studio/task-edit-policies", idempotency: "required" });
const read = createOperation<Revision>({ method: "GET", path: ({ id }) => `/api/studio/task-edit-policies/${encodeURIComponent(id)}` });
const publish = createOperation<Revision, object>({ method: "POST", path: ({ id }) => `/api/studio/task-edit-policies/${encodeURIComponent(id)}/publish`, idempotency: "required" });
export function TaskEditPolicyAuthoring() {
  const http = useApiClient(), [draft, setDraft] = useState(() => JSON.stringify(exampleTaskEditPolicy, null, 2));
  const [revision, setRevision] = useState<Revision>(), [id, setId] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<{ action: string; fingerprint: string; key: string } | undefined>(undefined), lock = useRef(false);
  const [baselineList, setBaselineList] = useState<Awaited<ReturnType<typeof loadBaselines>>>([]);
  async function loadBaselines() { return http.request(baselines, {}); }
  async function discoverBaselines() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { setBaselineList(await loadBaselines()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Baselines unavailable"); }
    finally { lock.current = false; setBusy(false); }
  }
  function bindBaseline(id: string) {
    const base = baselineList.find(b => b.id === id); if (!base) return;
    try {
      const current: Draft = JSON.parse(draft);
      setDraft(JSON.stringify({ ...current, processBinding: { basePublicationId: base.id, expectedReleaseId: base.release_id,
        tasks: base.publication.manifests.flatMap(m => m.tasks.filter(t => ["review","approval"].includes(t.executionKind)).map(t => ({ profile: m.profile.code, code: t.code,
          informationPolicy: t.informationPolicy ?? { schema: "athyper.task-information-policy/1", clockMode: "bounded_pause", responseHours: 48 }, ...(t.escalationPolicy ? {escalationPolicy:t.escalationPolicy}:{}), ...(t.caseAuthority ? {caseAuthority:t.caseAuthority}:{}) }))) } }, null, 2));
    } catch { setError("Correct the draft JSON before binding a process."); }
  }
  async function command(action: "author" | "read" | "publish") {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const body: Draft = action === "author" ? JSON.parse(draft) : exampleTaskEditPolicy, fingerprint = JSON.stringify(action === "author" ? body : { id });
      if (!pending.current || pending.current.action !== action || pending.current.fingerprint !== fingerprint) pending.current = { action, fingerprint, key: crypto.randomUUID() };
      const result = action === "read" ? await http.request(read, { params: { id } }) : action === "author" ? await http.request(author, { body, idempotencyKey: pending.current.key }) : await http.request(publish, { params: { id }, body: {}, idempotencyKey: pending.current.key });
      setRevision(result); setId(result.definition.id); pending.current = undefined;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Policy operation failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section aria-labelledby="task-edit-policy-heading">
    <h2 id="task-edit-policy-heading">Supplier task edit rules</h2>
    <p>Author an immutable policy revision, prove its positive, negative, overlap and missing-fact fixtures, then have an independent checker publish it. New process manifests must explicitly pin the published revision.</p>
    <p>All changed fields need coverage. Deny wins. Business data requires return, save and explicit resubmission for full re-review. The example covers only the website field; its example protection denies changes for Enhanced requests.</p>
    <button type="button" disabled={busy} onClick={() => void discoverBaselines()}>Load published process scopes</button>
    {baselineList.length ? <label>Process scope<select aria-label="Process scope" disabled={busy} defaultValue="" onChange={event => bindBaseline(event.target.value)}><option value="">Select a process scope</option>{baselineList.map(b => <option key={b.id} value={b.id}>{JSON.stringify(b.scope)}</option>)}</select></label> : null}
    <p>Binding a scope includes its three profile catalogs in the proposal. Review each task's information, supervisor and case-action controls before submitting. Publication applies to future submissions; accepted attempts retain their prior rules.</p>
    <TaskRuleControls draft={draft} disabled={busy} onChange={setDraft} />
    <label>Policy and qualification fixtures<textarea aria-label="Policy and qualification fixtures" rows={22} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} /></label>
    <button type="button" disabled={busy} onClick={() => void command("author")}>Validate and submit policy for approval</button>
    <label>Policy revision ID<input aria-label="Policy revision ID" value={id} disabled={busy} onChange={event => setId(event.target.value)} /></label>
    <button type="button" disabled={busy || !id} onClick={() => void command("read")}>Load policy revision</button>
    {revision ? <div>
      <p role="status">Revision {revision.definition.versionNo} · {revision.status} · {revision.hash}</p>
      {revision.release ? <p>Task rules released for new submissions at {revision.release.activated_at}.</p> : null}
      <p>{revision.results.filter(r => r.passed).length} passing test results recorded. Publishing does not change an accepted attempt.</p>
      <button type="button" disabled={busy || revision.status !== "pending_approval" || id !== revision.definition.id} onClick={() => void command("publish")}>Publish as independent checker</button>
      <details><summary>Published rule and test evidence</summary><pre>{JSON.stringify(revision, null, 2)}</pre></details>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
