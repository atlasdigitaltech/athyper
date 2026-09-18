"use client";
import { ManagementWorkspace, ManagementNavigation, PageHeader } from "@athyper/platform-shell";
import { Button } from "@athyper/platform-ui";
import { Building2Icon } from "@athyper/platform-icons";
import { BankDirectoryManage, type PublishedDirectory } from "./bank-directory-manage";
import { useApiClient, usePermissions, readBrowserCsrfToken } from "@athyper/platform-shell-app-foundation";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDefinitionCommandKeys } from "./definition-client";
type Revision = {
  id: string;
  created_at: string;
  created_by: string;
  content_hash: string;
  input_json: unknown;
  payload: unknown;
  decision?: string;
  reason?: string;
  publication_release_id?: string;
  validation_report: {
    valid: boolean;
    additions: string[];
    changes: string[];
    retirements: string[];
    issues: {
      code: string;
      record: string;
      message: string;
      candidates?: string[];
    }[];
  };
};
type Reconciliation = {
  expected: { releaseId: string; version: number; hash: string } | null;
  checkedAt: string;
  planes: {
    plane: string;
    state: string;
    version?: number;
    hash?: string;
    missingReleases?: string[];
    mismatchedReleases?: string[];
  }[];
  deliveries: {
    id: string;
    target_plane: string;
    status: string;
    attempt_no: number;
    failure_code?: string;
    acknowledged_at?: string;
  }[];
};
type ReferenceReport = {
  planes: {
    plane: string;
    available: boolean;
    report: null | {
      pending: number;
      unresolved: number;
      resolved: number;
      results: { state: string; reason?: string; releaseId: string }[];
    };
  }[];
};
const root = "/api/studio/bank-directory";
const list = createOperation<{ revisions: Revision[]; directory?: PublishedDirectory | null }>({
  method: "GET",
  path: root,
});
const reconcile = createOperation<Reconciliation>({
  method: "GET",
  path: `${root}/reconcile`,
});
const save = createOperation<Revision, unknown>({
  method: "POST",
  path: `${root}/import`,
  idempotency: "required",
});
const review = createOperation<
  unknown,
  { decision: "approved" | "rejected"; reason: string }
>({
  method: "POST",
  path: ({ id }) => `${root}/${encodePathSegment(String(id))}/review`,
  idempotency: "required",
});
const get = createOperation<Revision>({
  method: "GET",
  path: ({ id }) => `${root}/${encodePathSegment(String(id))}`,
});
const resume = createOperation<unknown, Record<string, never>>({
  method: "POST",
  path: ({ id }) => `${root}/${encodePathSegment(String(id))}/resume`,
  idempotency: "required",
});
const checkReferences = createOperation<
  ReferenceReport,
  { references: unknown }
>({ method: "POST", path: `${root}/references` });
const initial = JSON.stringify(
  {
    schema: "athyper.bank-directory-import/1",
    sources: [],
    payload: {
      institutions: [],
      branches: [],
      identifiers: [],
      sourceRecords: [],
    },
  },
  null,
  2,
);
export function BankDirectoryWorkspace() {
  const [tab,setTab]=useState("manage");
  const [importOpen,setImportOpen]=useState(false);
  const [directory,setDirectory]=useState<PublishedDirectory|null>(null);
  useEffect(()=>{const sync=()=>{const value=new URL(window.location.href).searchParams.get("tab");setTab(value==="overview"||value==="review"?value:"manage")};sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync)},[]);
  const navigate=(href:string)=>{window.history.pushState(null,"",href);setTab(new URL(href,window.location.href).searchParams.get("tab")??"manage");};
  const openImport=()=>{navigate("?tab=manage");setImportOpen(true);};
  const permissions = usePermissions();
  const canAuthor = permissions.has("studio.bank_directory.author");
  const canReview = permissions.has("studio.bank_directory.publish");
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [references, setReferences] = useState("[]"),
    [referenceReport, setReferenceReport] = useState<ReferenceReport>();
  const http = useApiClient(),
    keys = useMemo(() => createDefinitionCommandKeys(), [http]);
  const [draft, setDraft] = useState(initial),
    [revisions, setRevisions] = useState<Revision[]>([]),
    [selected, setSelected] = useState<Revision>(),
    [status, setStatus] = useState<Reconciliation>(),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function refresh() {
    const [r, s] = await Promise.all([
      http.request(list),
      http.request(reconcile),
    ]);
    setRevisions(r.revisions);
    setDirectory(r.directory??null);
    setStatus(s);
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Directory operation failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(refresh);
  }, [http]);
  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    const body = { decision, reason: reason.trim() };
    await http.request(review, {
      params: { id: selected.id },
      body,
      idempotencyKey: keys(`review:${selected.id}`, body),
    });
    setNotice(
      decision === "approved"
        ? "Approved. Signed publication and delivery have been queued. Refresh to see activation results."
        : "Revision rejected. Load it as a new draft to make corrections.",
    );
    setSelected(undefined);
    setReason("");
    setConfirmed(false);
    await refresh();
  }
  return (
    <ManagementWorkspace header={<PageHeader level="collection" title="Bank directory" description="Governed bank institutions, branches and routing identifiers." icon={<Building2Icon/>} actions={canAuthor?<Button onClick={openImport}>Import bank data</Button>:undefined}/>} navigation={<ManagementNavigation label="Bank directory sections" currentKey={tab} items={[{key:"overview",label:"Overview",href:"?tab=overview"},{key:"manage",label:"Manage",href:"?tab=manage"},{key:"review",label:"Review & Approval",href:"?tab=review",count:revisions.filter(r=>!r.decision).length}]} onNavigate={navigate}/>} status={<div className="bank-directory__sync" role="status"><span>{status?.expected?`Release ${status.expected.version} · ${status.planes.length===3&&status.planes.every(p=>p.state==="current")?"Up to date across all three planes":"Publication needs attention"}`:busy?"Checking publication status…":"No published release"}</span><Button variant="secondary" disabled={busy} onClick={()=>void run(refresh)}>Refresh status</Button></div>}>
    <div className="bank-directory" aria-busy={busy}>
      <div hidden={tab!=="manage"}><BankDirectoryManage directory={directory} loading={busy} onImport={openImport} canAuthor={canAuthor}/></div>
      <p hidden={tab!=="overview"} className="bank-directory__intro">
        One governed directory for Studio, NEON and MESH. Published releases are
        immutable; corrections create a new release.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section hidden={tab!=="overview"} aria-labelledby="directory-activation">
        <h2 id="directory-activation">Publication and activation</h2>
        <button disabled={busy} onClick={() => void run(refresh)}>
          Refresh status
        </button>
        <p>
          {status?.expected
            ? `Expected release ${status.expected.version} · ${status.expected.releaseId}`
            : "No published release recorded."}
        </p>
        {status?.expected && (
          <p style={{ overflowWrap: "anywhere" }}>
            Directory hash: {status.expected.hash}
          </p>
        )}
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th>Plane</th>
              <th>State</th>
              <th>Installed version</th>
              <th>Directory hash</th>
            </tr>
          </thead>
          <tbody>
            {status?.planes.map((p) => (
              <tr key={p.plane}>
                <td>{p.plane.toUpperCase()}</td>
                <td>
                  {p.state.replaceAll("_", " ")}
                  {p.missingReleases?.length
                    ? ` · ${p.missingReleases.length} missing releases`
                    : ""}
                  {p.mismatchedReleases?.length
                    ? ` · ${p.mismatchedReleases.length} hash conflicts`
                    : ""}
                </td>
                <td>{p.version ?? "—"}</td>
                <td style={{ overflowWrap: "anywhere", maxWidth: 280 }}>
                  {p.hash ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Missing versions remain pending. A hash mismatch requires
          investigation. A failed installation preserves the previous active
          directory.
        </p>
        {!!status?.deliveries.length && (
          <details>
            <summary>Delivery attempts and activation receipts</summary>
            <table>
              <thead>
                <tr>
                  <th>Plane</th>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Failure</th>
                  <th>Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {status.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.target_plane}</td>
                    <td>{d.attempt_no}</td>
                    <td>{d.status}</td>
                    <td>{d.failure_code ?? "—"}</td>
                    <td>{d.acknowledged_at ?? "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
      <section hidden={tab!=="review"} aria-labelledby="directory-review">
        <h2 id="directory-review">Review revisions</h2>
        <p>Select a saved revision to inspect its changes and record a decision.</p>
        {!revisions.length && <p>{busy ? "Loading revisions…" : "No revisions yet. Import a source file below to get started."}</p>}
        <ul className="bank-directory__revisions">
          {revisions.map((r) => (
            <li key={r.id}>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const full = await http.request(get, {
                      params: { id: r.id },
                    });
                    setSelected(full);
                    setConfirmed(false);
                    setReason(full.reason ?? "");
                  })
                }
              >
                {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                {r.decision ??
                  (r.validation_report.valid
                    ? "Ready for review"
                    : "Needs correction")}
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="bank-directory__review">
            <details><summary>Revision details</summary><p>Revision: {selected.id}</p><p>Author ID: {selected.created_by}</p></details>
            <p>
              {selected.validation_report.additions.length} additions ·{" "}
              {selected.validation_report.changes.length} changes ·{" "}
              {selected.validation_report.retirements.length} retirements
            </p>
            <details>
              <summary>
                Review normalized change IDs and source evidence
              </summary>
              <pre style={{ overflow: "auto", maxHeight: 360 }}>
                {JSON.stringify(
                  {
                    report: selected.validation_report,
                    source: selected.input_json,
                    normalizedPayload: selected.payload,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <ul>
              {selected.validation_report.issues.map((i, n) => (
                <li key={n}>
                  {i.code}: {i.message} ({i.record})
                  {i.candidates?.length
                    ? ` — candidate identities: ${i.candidates.join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
            <button
              disabled={busy}
              onClick={() => {
                openImport();
                setDraftGeneration((g) => g + 1);
                setDraft(JSON.stringify(selected.input_json, null, 2));
                setSelected(undefined);
                setConfirmed(false);
              }}
            >
              Load as new draft
            </button>
            <p>
              Resolve ambiguous source identities in the draft’s resolutions
              map, then validate again. Approval requires a different reviewer
              and an elevated session.
            </p>
            {!canReview ? <p className="bank-directory__guidance">Your role can prepare revisions but cannot approve or reject them. A directory reviewer must sign in to record the decision.</p> : <form method="post" action="/api/auth/step-up/start?returnTo=%2Fmdg%2Fbank-directory">
              <input type="hidden" name="csrfToken" value={readBrowserCsrfToken() ?? ""} />
              <p>Approval requires an independent reviewer and MFA. Enter a reason and confirm your review to enable approval.</p>
              <button type="submit">Verify with MFA</button>
            </form>}
            <label>
              Review reason (required)
              <textarea
                value={reason}
                maxLength={2000}
                disabled={busy || !canReview || !!selected.decision}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || !canReview || !!selected.decision}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I have reviewed the changes, source provenance and retirements.
            </label>
            <button className="bank-directory__primary"
              disabled={
                busy ||
                !canReview ||
                !!selected.decision ||
                !selected.validation_report.valid ||
                !reason.trim() ||
                !confirmed
              }
              onClick={() => void run(() => decide("approved"))}
            >
              Approve and publish
            </button>{" "}
            <button
              disabled={busy || !canReview || !!selected.decision || !reason.trim()}
              onClick={() => void run(() => decide("rejected"))}
            >
              Reject revision
            </button>
            {selected.decision === "approved" && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await http.request(resume, {
                      params: { id: selected.id },
                      body: {},
                      idempotencyKey: keys(
                        `resume:${selected.id}`,
                        status?.checkedAt,
                      ),
                    });
                    setNotice(
                      "Publication resumed using the same approved release.",
                    );
                    await refresh();
                  })
                }
              >
                Resume publication
              </button>
            )}
            {selected.decision && (
              <p>
                Review recorded: {selected.decision}. This revision cannot be
                edited.
              </p>
            )}
          </div>
        )}
      </section>
      <section hidden={tab!=="manage"||!importOpen||!canAuthor} aria-labelledby="directory-import">
        <h2 id="directory-import">Import and validate</h2>
        <p>
          Load normalized source JSON with provenance. Omitted records stay in
          the directory. Retirements must be explicit.
        </p>
        <label>
          Source file{" "}
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy || !canAuthor}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void run(async () => {
                  if (file.size > 256 * 1024)
                    throw new Error("Use a source batch smaller than 256 KB.");
                  setDraft(await file.text());
                  setSelected(undefined);
                  setConfirmed(false);
                });
            }}
          />
        </label>
        <label style={{ display: "block" }}>
          Source draft
          <textarea
            aria-label="Bank directory source JSON"
            rows={9}
            value={draft}
            disabled={busy || !canAuthor}
            onChange={(e) => {
              setDraft(e.target.value);
              setSelected(undefined);
              setConfirmed(false);
            }}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
          />
        </label>
        <button className="bank-directory__primary"
          disabled={busy || !canAuthor}
          onClick={() =>
            void run(async () => {
              const source: unknown = JSON.parse(draft);
              const r = await http.request(save, {
                body: source,
                idempotencyKey: keys(
                  `import:${draftGeneration}:${status?.expected?.releaseId ?? "initial"}`,
                  source,
                ),
              });
              setSelected(r);
              navigate("?tab=review");
              setImportOpen(false);
              setConfirmed(false);
              setReason("");
              await refresh();
              setNotice(
                r.validation_report.valid
                  ? "Validation passed. An independent reviewer can now approve this revision."
                  : "Validation has issues. Correct the draft and validate a new revision.",
              );
            })
          }
        >
          Validate and save revision
        </button>
      </section>
      <details hidden={tab!=="overview"} className="bank-directory__diagnostics">
        <summary>Check received directory references</summary>
        <p>
          Check exact release, institution and optional branch IDs from a
          received disclosure against every plane.
        </p>
        <label>
          References
          <textarea
            rows={4}
            value={references}
            onChange={(e) => {
              setReferences(e.target.value);
              setReferenceReport(undefined);
            }}
            disabled={busy}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
            placeholder='[{"releaseId":"…","institutionId":"…"}]'
          />
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setReferenceReport(
                await http.request(checkReferences, {
                  body: { references: JSON.parse(references) },
                }),
              ),
            )
          }
        >
          Check references
        </button>
        {referenceReport?.planes.map((p) => (
          <div key={p.plane}>
            <h3>{p.plane.toUpperCase()}</h3>
            {p.available && p.report ? (
              <>
                <p>
                  {p.report.resolved} resolved · {p.report.pending} pending ·{" "}
                  {p.report.unresolved} unresolved
                </p>
                <ul>
                  {p.report.results.map((r, i) => (
                    <li key={i}>
                      {r.releaseId}: {r.state}
                      {r.reason ? ` — ${r.reason.replaceAll("_", " ")}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Plane unavailable. References remain pending.</p>
            )}
          </div>
        ))}
      </details>
    </div>
    </ManagementWorkspace>
  );
}
