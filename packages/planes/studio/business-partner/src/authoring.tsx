"use client";

import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useMemo, useRef, useState } from "react";
import {
  createBusinessPartnerDefinitionClient,
  createDefinitionCommandKeys,
  type DefinitionPlane,
  type DefinitionPublication,
  type DefinitionRevision,
} from "./definition-client";
import {
  createBusinessPartnerDefinitionSimulationClient,
  type DefinitionSimulation,
} from "./operations";
import { SupplierRequestFormDesigner } from "./supplier-request-form-designer";
import { BusinessPartnerWorkflowDesigner } from "./workflow-designer";

const sections = [
  "requestSchemas",
  "fieldPolicies",
  "validationDeclarations",
  "duplicateRules",
  "formDescriptors",
  "viewDescriptors",
  "mappingContracts",
  "workflowDefinitions",
  "evidencePolicies",
  "readinessGates",
  "reasonCodeCatalog",
  "meshSafeSchemas",
  "compatibilityRules",
  "sourceContractHashes",
] as const;
const initialBundle = JSON.stringify(
  {
    schema: "athyper.business-partner-definition-bundle.v1",
    bundleCode: "business_partner.onboarding",
    semanticVersion: "1.0.0",
    ...Object.fromEntries(
      sections.map((key) => [key, key === "validationDeclarations" ? [] : {}]),
    ),
  },
  null,
  2,
);

export function BusinessPartnerAuthoringWorkspace() {
  const http = useApiClient();
  const client = useMemo(
    () => createBusinessPartnerDefinitionClient(http),
    [http],
  );
  const simulator = useMemo(
    () => createBusinessPartnerDefinitionSimulationClient(http),
    [http],
  );
  const keys = useMemo(() => createDefinitionCommandKeys(), [http]);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [bundle, setBundle] = useState(initialBundle);
  const [planes, setPlanes] = useState<DefinitionPlane[]>([
    "studio",
    "neon",
    "mesh",
  ]);
  const [comparison, setComparison] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [revision, setRevision] = useState<DefinitionRevision>();
  const [simulation, setSimulation] = useState<DefinitionSimulation>();
  const [saved, setSaved] = useState<DefinitionRevision>();
  const [publication, setPublication] = useState<DefinitionPublication>();
  const [confirmed, setConfirmed] = useState(false);
  const [minimumRuntimeVersion, setMinimumRuntimeVersion] = useState("");

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Definition command failed.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function invalidateDraft() {
    setSimulation(undefined);
    setSaved(undefined);
  }
  function draft() {
    if (!planes.length) throw new Error("Select at least one target consumer.");
    return { bundle: JSON.parse(bundle) as unknown, targetPlanes: planes };
  }
  function editSection(key: string, value: string) {
    try {
      const parsed = JSON.parse(bundle) as Record<string, unknown>;
      parsed[key] = JSON.parse(value);
      setBundle(JSON.stringify(parsed, null, 2));
      invalidateDraft();
      setError(undefined);
    } catch {
      setError(`Enter valid JSON for ${key} before applying the section.`);
    }
  }
  function editSupplierRequestForm(value:Record<string,unknown>){const parsed=JSON.parse(bundle)as Record<string,unknown>,forms=parsed.formDescriptors&&typeof parsed.formDescriptors==="object"&&!Array.isArray(parsed.formDescriptors)?parsed.formDescriptors as Record<string,unknown>:{};parsed.formDescriptors={...forms,supplierRequest:value};setBundle(JSON.stringify(parsed,null,2));invalidateDraft();setError(undefined);}
  function editWorkflows(value:Record<string,unknown>){const parsed=JSON.parse(bundle)as Record<string,unknown>;parsed.workflowDefinitions=value;setBundle(JSON.stringify(parsed,null,2));invalidateDraft();setError(undefined);}
  let parsed: Record<string, unknown> | undefined;
  try {
    const value: unknown = JSON.parse(bundle);
    if (value && typeof value === "object" && !Array.isArray(value))
      parsed = value as Record<string, unknown>;
  } catch {
    /* The editor retains incomplete JSON until corrected. */
  }

  return (
    <div className="athyper-governance-list">
      <section aria-labelledby="definition-authoring-heading">
        <h2 id="definition-authoring-heading">Author definition revision</h2>
        <p>
          Edit schemas, rules, forms and journeys as one immutable bundle.
          Import a reviewed bundle or copy a loaded revision, then advance its
          semantic version. Source contract hashes must come from the applicable
          contracts.
        </p>
        <fieldset disabled={busy}>
          <legend>Proposed definition</legend>
          <label>
            Definition bundle JSON
            <textarea
              rows={18}
              value={bundle}
              spellCheck={false}
              onChange={(event) => {
                setBundle(event.target.value);
                invalidateDraft();
              }}
            />
          </label>
          {parsed ? (
            <><SupplierRequestFormDesigner value={(parsed.formDescriptors as Record<string,unknown>|undefined)?.supplierRequest} onChange={editSupplierRequestForm}/><BusinessPartnerWorkflowDesigner value={parsed.workflowDefinitions} onChange={editWorkflows}/><details>
              <summary>Edit definition sections</summary>
              {sections.map((key) => (
                <DefinitionSection
                  key={`${key}:${bundle}`}
                  name={key}
                  value={JSON.stringify(
                    parsed?.[key] ??
                      (key === "validationDeclarations" ? [] : {}),
                    null,
                    2,
                  )}
                  apply={(value) => editSection(key, value)}
                />
              ))}
            </details></>
          ) : null}
          <fieldset>
            <legend>Target consumers</legend>
            {(["studio", "neon", "mesh"] as const).map((plane) => (
              <label key={plane}>
                <input
                  type="checkbox"
                  checked={planes.includes(plane)}
                  onChange={(event) => {
                    setPlanes(
                      event.target.checked
                        ? [...planes, plane]
                        : planes.filter((item) => item !== plane),
                    );
                    invalidateDraft();
                  }}
                />
                {plane.toUpperCase()}
              </label>
            ))}
          </fieldset>
          <label>
            Comparison revision ID (optional)
            <input
              value={comparison}
              onChange={(event) => {
                setComparison(event.target.value);
                invalidateDraft();
              }}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              void run(async () => {
                setSimulation(undefined);
                const body = draft();
                setSimulation(
                  await simulator.simulate({
                    ...body,
                    ...(comparison.trim()
                      ? { againstRevisionId: comparison.trim() }
                      : {}),
                  }),
                );
              })
            }
          >
            Simulate proposed revision
          </button>
          <button
            type="button"
            disabled={!simulation || !!saved}
            onClick={() =>
              void run(async () => {
                const body = draft();
                setSaved(await client.author(body, keys("author", body)));
              })
            }
          >
            Save immutable revision
          </button>
        </fieldset>
        {simulation ? (
          <div role="status">
            <p>
              Compatible: {simulation.bundleCode} {simulation.semanticVersion}.
              Simulation does not authorize publication.
            </p>
            <ul>
              {simulation.planes.map((item) => (
                <li key={item.plane}>
                  {item.plane.toUpperCase()} · Source hash:{" "}
                  {item.sourceBundleHash} · Compiled hash:{" "}
                  {item.compiledBundleHash}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {saved ? (
          <div role="status">
            <p>Saved revision: {saved.id}</p>
            <p>Bundle hash: {saved.bundleHash}</p>
            <p>
              Share this revision ID with an independent checker for approval.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="definition-approval-heading">
        <h2 id="definition-approval-heading">Review and approve release</h2>
        <p>
          Load the immutable revision and review its author, consumers and
          content. The server requires publish permission and rejects approval
          by the revision author.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              setRevision(undefined);
              setPublication(undefined);
              setConfirmed(false);
              setRevision(await client.get(revisionId.trim()));
            });
          }}
        >
          <label>
            Revision ID
            <input
              required
              disabled={busy}
              value={revisionId}
              onChange={(event) => {
                setRevisionId(event.target.value);
                setRevision(undefined);
                setConfirmed(false);
                setPublication(undefined);
              }}
            />
          </label>
          <button disabled={busy} type="submit">
            Load revision for review
          </button>
        </form>
        {revision ? (
          <div>
            <dl>
              <dt>Revision</dt>
              <dd>{revision.id}</dd>
              <dt>Definition</dt>
              <dd>
                {revision.bundleCode} {revision.semanticVersion}
              </dd>
              <dt>Author</dt>
              <dd>{revision.createdBy}</dd>
              <dt>Created</dt>
              <dd>{revision.createdAt}</dd>
              <dt>Source hash</dt>
              <dd>{revision.bundleHash}</dd>
              <dt>Consumers</dt>
              <dd>{revision.targetPlanes.join(", ")}</dd>
            </dl>
            <details>
              <summary>Review immutable definition content</summary>
              <pre>{JSON.stringify(revision.bundle, null, 2)}</pre>
            </details>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBundle(JSON.stringify(revision.bundle, null, 2));
                setPlanes([...revision.targetPlanes]);
                setComparison(revision.id);
                invalidateDraft();
              }}
            >
              Copy into new draft
            </button>
            <fieldset disabled={busy || !!publication}>
              <legend>Release approval</legend>
              <label>
                Minimum runtime version (optional)
                <input
                  value={minimumRuntimeVersion}
                  onChange={(event) => {
                    setMinimumRuntimeVersion(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I reviewed this immutable revision and approve queuing its
                release.
              </label>
              <button
                type="button"
                disabled={!confirmed}
                onClick={() =>
                  void run(async () => {
                    const body = minimumRuntimeVersion.trim()
                      ? { minimumRuntimeVersion: minimumRuntimeVersion.trim() }
                      : {};
                    setPublication(
                      await client.publish(
                        revision.id,
                        body,
                        keys("publish", { revisionId: revision.id, ...body }),
                      ),
                    );
                  })
                }
              >
                Approve and queue release
              </button>
            </fieldset>
          </div>
        ) : null}
        {publication ? (
          <div role="status">
            <p>
              Release {publication.release.releaseNo}: {publication.release.id}{" "}
              · {publication.release.status}
            </p>
            <p>Compilation job: {publication.jobId}</p>
            <p>
              Approval has been queued. Deployment and consumer adoption require
              separate publication evidence in Operations &amp; Proof.
            </p>
          </div>
        ) : null}
      </section>
      <div aria-live="polite">
        {busy ? <p role="status">Processing definition command…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </div>
  );
}

function DefinitionSection({
  name,
  value,
  apply,
}: {
  readonly name: string;
  readonly value: string;
  readonly apply: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <details>
      <summary>{name}</summary>
      <label>
        {name} JSON
        <textarea
          rows={8}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => apply(text)}>
        Apply {name}
      </button>
    </details>
  );
}
