"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldCheckIcon } from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";
import { createOperation } from "@athyper/platform-api-client";
import {
  readBrowserCsrfToken,
  useApiClient,
} from "@athyper/platform-shell-app-foundation";
import {
  display,
  inspectionRead,
  record,
  releaseList,
  rows,
  type Inspection,
  type Json,
} from "./workbench-model";
import { useCompositionEvidence } from "./composition-evidence";
import { differences } from "./workbench-edit-model";
import { matchingActivation } from "./publication-proof";
import { PublicationProof } from "./publication-proof-view";
export function WorkbenchPublication({
  inspection,
  onSaved,
  onSelect,
  canAct,
  onBusyChange,
}: {
  inspection: Inspection;
  onSaved: (value: Inspection) => void;
  onSelect: (value: string) => void;
  canAct: () => boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { recordCheck } = useCompositionEvidence();
  const http = useApiClient(),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [uncertainPublish, setUncertainPublish] = useState(false),
    [message, setMessage] = useState(""),
    [report, setReport] = useState<Json>(),
    [reviewed, setReviewed] = useState(false),
    [targets, setTargets] = useState(["neon"]),
    [tracking, setTracking] = useState<Json>(),
    [trackingError, setTrackingError] = useState(""),
    [poll, setPoll] = useState(0);
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);
  useEffect(() => {
    setReviewed(false);
    setReport(undefined);
  }, [inspection.id, inspection.version, inspection.status]);
  useEffect(() => {
    if (inspection.source !== "release") return;
    const abort = new AbortController();
    setTracking(undefined);
    setTrackingError("");
    void http
      .request(
        createOperation<Json>({
          method: "GET",
          path: `/meta-entity-authoring/inspection/releases/${encodeURIComponent(inspection.id)}/activation`,
        }),
        { signal: abort.signal },
      )
      .then((result) => {
        if (abort.signal.aborted) return;
        if (
          result.releaseId !== inspection.id ||
          result.contractHash !== inspection.hash
        )
          throw Error(
            "Activation response does not match the selected source release",
          );
        setTracking(result);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setTrackingError(errorText(error));
      });
    return () => abort.abort();
  }, [http, inspection.id, inspection.hash, inspection.source, poll]);
  async function action(name: string) {
    if (lock.current || blocked) return;
    if (!canAct()) {
      setMessage(
        "Save or discard local edits before running publication actions.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      const result = await http.request(
        createOperation<Json, Json>({
          method: "POST",
          path: `/meta-entity-authoring/change-sets/${encodeURIComponent(inspection.id)}/${name}`,
        }),
        {
          body: {
            expectedRevision: Number(inspection.version),
            ...(name === "publish" ? { targetPlanes: targets } : {}),
          },
        },
      );
      if (!mounted.current) return;
      if (name === "publish") {
        const release = record(result.release);
        if (typeof release.id !== "string")
          throw Error("Publication returned no source release ID");
        const stored = await http.request(
          inspectionRead("release", release.id),
          {},
        );
        if (!mounted.current) return;
        if (
          stored.changeSetId !== inspection.id ||
          !stored.hash ||
          stored.hash !== record(result.artifact).contractHash ||
          stored.targets.slice().sort().join() !== targets.slice().sort().join()
        )
          throw Error(
            "Published release coordinates do not match this change set, signed contract and targets",
          );
        onBusyChange(false);
        onSelect(`release:${stored.id}`);
        return;
      }
      const current = await http.request(
        inspectionRead("draft", inspection.id),
        {},
      );
      if (!mounted.current) return;
      if (
        (name === "validate" || name === "test") &&
        result.changeSetId === inspection.id &&
        String(result.checkedRevision) === inspection.version &&
        current.version === inspection.version &&
        !differences(current.data, inspection.data).length
      ) {
        recordCheck({
          kind: name,
          source: `draft:${inspection.id}`,
          revision: inspection.version,
          graph: current.data,
          observedAt: new Date().toISOString(),
          report: result,
        });
      }
      onSaved(current);
      setReport(result);
      setMessage(
        name === "reject"
          ? "Revision rejected. Open a successor draft to make corrections."
          : name === "approve"
            ? "Approval recorded. Publication is a separate action."
            : name === "submit"
              ? "Submitted for independent review. The reviewer must use their own authenticated account."
              : `${name === "validate" ? "Validation" : "Contract test"} response received. Inspect the results below.`,
      );
    } catch (error) {
      if (mounted.current) {
        setBlocked(true);
        if (name === "publish") setUncertainPublish(true);
        setMessage(
          `${errorText(error)} Reload the saved version before another command. If publication timed out, inspect published releases before attempting it again.`,
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  async function reload() {
    if (lock.current || !canAct()) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const current = await http.request(
        inspectionRead("draft", inspection.id),
        {},
      );
      if (mounted.current) {
        if (uncertainPublish) {
          const list = await http.request(releaseList, {});
          if (!Array.isArray(list))
            throw Error("Could not read durable publication records");
          const releases = rows(list).filter(
            (r) => r.changeSetId === inspection.id,
          );
          if (releases.length === 1 && typeof releases[0]?.id === "string") {
            const published = await http.request(
              inspectionRead("release", releases[0].id),
              {},
            );
            if (!mounted.current) return;
            if (published.changeSetId !== inspection.id || !published.hash)
              throw Error("Could not reconcile the durable release");
            onBusyChange(false);
            onSelect(`release:${published.id}`);
            return;
          }
          if (releases.length || current.status !== "approved")
            throw Error(
              "Publication outcome remains uncertain. Inspect durable releases before retrying.",
            );
          setUncertainPublish(false);
        }
        onSaved(current);
        setBlocked(false);
        setMessage(
          "Saved version reloaded. Check its state and existing releases before continuing.",
        );
      }
    } catch (error) {
      if (mounted.current) setMessage(errorText(error));
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  if (inspection.source === "bundle")
    return (
      <section>
        <h3>Publication</h3>
        <p>
          This panel publishes native entity working drafts. Bundle authoring
          and approval remain in the separate publication tools.
        </p>
      </section>
    );
  if (inspection.source === "release")
    return (
      <section
        className="bp-publication"
        aria-label="Target activation tracking"
      >
        <h3>Target activation tracking</h3>
        <dl>
          <dt>Source release ID</dt>
          <dd>{inspection.id}</dd>
          <dt>Contract hash</dt>
          <dd>{inspection.hash ?? "Unavailable"}</dd>
          <dt>Source change set</dt>
          <dd>{inspection.changeSetId ?? "Unavailable"}</dd>
        </dl>
        <p>
          Published source release {inspection.version}. Delivery may still be
          pending.
        </p>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setPoll((n) => n + 1)}
        >
          Check target activation
        </Button>
        {trackingError ? (
          <p role="alert">Activation unverified: {trackingError}</p>
        ) : !tracking ? (
          <p role="status">Reading target activation evidence…</p>
        ) : (
          <>
            <p>
              Observed: {display(tracking.observedAt)} · Tenant:{" "}
              {display(tracking.tenantId)}
            </p>
            <p>Publication key: {display(tracking.publicationKey)}</p>
            {rows(tracking.targets).map((target) => (
              <div key={String(target.plane)} className="bp-target-status">
                <h4>
                  {display(target.plane)} ·{" "}
                  {target.state === "active" &&
                  !matchingActivation(inspection, tracking, target)
                    ? "unverified"
                    : display(target.state)}
                </h4>
                {matchingActivation(inspection, tracking, target) ? (
                  <p>
                    Confirmed active: the target activation head selects this
                    release and its contract hashes match.
                  </p>
                ) : (
                  <p>
                    {display(
                      target.reason ??
                        (target.state === "active"
                          ? "Activation evidence is incomplete or does not match this release."
                          : target.state === "different_release"
                            ? "A different release is currently active."
                            : "This release is not confirmed active."),
                    )}
                  </p>
                )}
                {target.releaseId ? (
                  <p>
                    Active source release: {display(target.releaseId)} · Applied
                    release: {display(target.appliedReleaseId)}
                  </p>
                ) : null}
                {target.descriptorHash ? (
                  <details>
                    <summary>Activation evidence</summary>
                    <pre>{JSON.stringify(target, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ))}
            {!rows(tracking.targets).length ? (
              <p>No target evidence returned.</p>
            ) : null}
          </>
        )}
        <h4>Verify the change in Neon</h4>
        <p>
          Target activation and visible UI behavior are separate checks. Open a
          new request using an authorized Neon account and verify the changed
          label or layout. Existing requests may retain their pinned version.
        </p>
        <p>
          <a
            href="https://neon.dev.athyper.test/mdg/business-partner/new"
            target="_blank"
            rel="noreferrer"
          >
            Open Neon development request form
          </a>
        </p>
        <PublicationProof
          key={inspection.id}
          inspection={inspection}
          tracking={tracking}
        />
      </section>
    );
  const status = inspection.status;
  return (
    <section className="bp-publication" aria-label="Saved draft publication">
      <h3>Approve and publish saved revision {inspection.version}</h3>
      <p>
        Current state: {status}. Actions use the saved graph, not unsaved
        controls. Server permissions, MFA, and independent-review rules apply.
      </p>
      <dl>
        <dt>Change set</dt>
        <dd>{inspection.id}</dd>
        <dt>Author</dt>
        <dd>{inspection.createdBy ?? "Not supplied"}</dd>
        <dt>Submitted by</dt>
        <dd>{inspection.submittedBy ?? "Not yet submitted"}</dd>
        <dt>Reviewed / approved by</dt>
        <dd>
          {inspection.approvedBy ?? inspection.reviewedBy ?? "Not yet reviewed"}
        </dd>
      </dl>
      <p>
        Approval applies to this saved revision. Target planes are chosen at
        publication; the current backend does not bind target selection to the
        reviewer acknowledgement.
      </p>
      <div className="bp-editor-actions">
        {status === "draft" ? (
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked}
              onClick={() => void action("validate")}
            >
              Validate saved draft
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked}
              onClick={() => void action("test")}
            >
              Run contract tests
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked}
              onClick={() => void action("submit")}
            >
              Submit for independent review
            </Button>
          </>
        ) : null}
        {status === "in_review" ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                disabled={busy}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed the selected saved revision and approve it.
            </label>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked || !reviewed}
              onClick={() => void action("approve")}
            >
              Approve saved revision
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked}
              onClick={() => void action("reject")}
            >
              Reject saved revision
            </Button>
          </>
        ) : null}
        {status === "approved" ? (
          <>
            <fieldset disabled={busy || blocked}>
              <legend>Publish to</legend>
              {["neon", "mesh"].map((plane) => (
                <label key={plane}>
                  <input
                    type="checkbox"
                    checked={targets.includes(plane)}
                    onChange={(e) =>
                      setTargets((current) =>
                        e.target.checked
                          ? [...current, plane]
                          : current.filter((p) => p !== plane),
                      )
                    }
                  />
                  {plane}
                </label>
              ))}
            </fieldset>
            <Button
              variant="secondary"
              type="button"
              disabled={busy || blocked || !targets.length}
              onClick={() => void action("publish")}
            >
              Publish approved revision
            </Button>
          </>
        ) : null}
        <Button
          variant="secondary"
          type="button"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload publication state
        </Button>
      </div>
      {status !== "published" ? (
        <PublicationStepUp busy={busy} canAct={canAct} />
      ) : null}
      {status === "published" ? (
        <p>
          Select this change set’s published release above to track its target
          activation.
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {report ? (
        <details open>
          <summary>Last action result</summary>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
function errorText(error: unknown) {
  const status = record(error).status;
  const code = String(record(record(error).problem).code ?? "");
  if (code.includes("REVIEWER_SEPARATION"))
    return "An independent reviewer must approve this revision using their own account.";
  if (code.includes("MFA") || code.includes("ASSURANCE"))
    return "Complete the required sign-in assurance step, then reload publication state.";
  if (status === 401)
    return "The session expired. Sign in again, then reload publication state.";
  return status === 403
    ? "Permission, assurance, or independent-review requirements were not satisfied."
    : status === 409
      ? "The saved revision or lifecycle state changed."
      : error instanceof Error
        ? error.message
        : "The operation is unavailable.";
}

export function PublicationStepUp({
  compact = false,
  busy = false,
  canAct,
}: {
  busy?: boolean;
  compact?: boolean;
  canAct: () => boolean;
}) {
  const [verifiedUntil, setVerifiedUntil] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const session = response.ok ? await response.json() : undefined;
        if (disposed) return;
        const until =
          session?.state === "authenticated" &&
          session?.assurance === "elevated"
            ? Date.parse(session.elevationExpiresAt)
            : 0;
        clearTimeout(expiry);
        setVerifiedUntil(
          Number.isFinite(until) && until > Date.now() ? until : 0,
        );
        if (until > Date.now())
          expiry = setTimeout(
            () => setVerifiedUntil(0),
            Math.min(until - Date.now(), 2147483647),
          );
      } catch {
        if (!disposed) setVerifiedUntil(0);
      }
    }
    void check();
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(expiry);
      window.removeEventListener("focus", check);
    };
  }, []);
  const [message, setMessage] = useState("");
  const [returnTo, setReturnTo] = useState("/mdg/business-partner/publication");
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
  });
  return (
    <section
      aria-label="Publication sign-in"
      className={compact ? "studio-identity-status" : undefined}
    >
      {verifiedUntil > Date.now() ? (
        <p role="status">
          {compact ? (
            <>
              <ShieldCheckIcon aria-hidden="true" size={16} /> Identity verified
            </>
          ) : (
            "Identity verified. Additional verification will be requested when required."
          )}
        </p>
      ) : (
        <form
          method="post"
          action={`/api/auth/step-up/start?returnTo=${encodeURIComponent(returnTo)}`}
          onSubmit={(event) => {
            if (busy || !canAct()) {
              event.preventDefault();
              setMessage(
                "Save or discard local edits before verifying your identity.",
              );
              return;
            }
            event.currentTarget.action = `/api/auth/step-up/start?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            const csrf = readBrowserCsrfToken();
            if (!csrf) {
              event.preventDefault();
              setMessage("Refresh Studio before starting MFA verification.");
              return;
            }
            (
              event.currentTarget.elements.namedItem(
                "csrfToken",
              ) as HTMLInputElement
            ).value = csrf;
          }}
        >
          <input type="hidden" name="csrfToken" defaultValue="" />
          <p className={compact ? "a-visually-hidden" : undefined}>
            Sensitive actions require verified MFA. If an action requests
            verification, verify your identity and retry.
          </p>
          <Button
            type="submit"
            variant={compact ? "ghost" : "secondary"}
            disabled={busy}
            title="Verify your identity when an action requires MFA. Your configuration stays unchanged."
          >
            {compact ? <ShieldCheckIcon aria-hidden="true" size={16} /> : null}
            Verify with MFA
          </Button>
        </form>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
