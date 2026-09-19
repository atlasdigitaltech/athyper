"use client";
import { createContext, useContext, type ReactNode, useState } from "react";
import { Badge } from "@athyper/platform-ui";
import { differences } from "./workbench-edit-model";
import { display, type Inspection, type Json } from "./workbench-model";
export interface CheckEvidence {
  kind: "validate" | "test" | "save";
  source: string;
  revision: string;
  graph: Json;
  observedAt: string;
  report: Json;
}
const EvidenceContext = createContext<{
  checks: CheckEvidence[];
  recordCheck: (check: CheckEvidence) => void;
}>({ checks: [], recordCheck: () => {} });
export function CompositionEvidenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [checks, setChecks] = useState<CheckEvidence[]>([]);
  return (
    <EvidenceContext.Provider
      value={{
        checks,
        recordCheck: (check) =>
          setChecks((previous) => [
            ...previous.filter(
              (c) => c.source !== check.source || c.kind !== check.kind,
            ),
            check,
          ]),
      }}
    >
      {children}
    </EvidenceContext.Provider>
  );
}
export const useCompositionEvidence = () => useContext(EvidenceContext);
export function evidenceState(
  check: CheckEvidence | undefined,
  inspection: Inspection,
  graph: Json,
) {
  if (!check) return "Not observed in this session";
  if (
    check.source !== `${inspection.source}:${inspection.id}` ||
    check.revision !== inspection.version ||
    differences(check.graph, graph).length
  )
    return "Outdated for this configuration";
  if (check.kind === "save") return "Save and reread verified";
  if (check.kind === "validate")
    return Array.isArray(check.report.issues)
      ? check.report.issues.length
        ? "Findings returned"
        : "Passed"
      : "Unverified response";
  return check.report.passed === true && Array.isArray(check.report.results)
    ? check.report.results.length
      ? "Passed"
      : "No tests configured"
    : check.report.passed === false
      ? "Failed"
      : "Unverified response";
}
export function CompositionEvidence({
  inspection,
  graph,
  localFindings,
}: {
  inspection: Inspection;
  graph: Json;
  localFindings: number;
}) {
  const { checks } = useCompositionEvidence();
  return (
    <section aria-label="Configuration evidence" className="studio-evidence">
      <h3>Evidence and status</h3>
      <p>
        Candidate: {inspection.source} · revision {inspection.version} ·{" "}
        {inspection.status}. Results below apply only to their recorded
        configuration.
      </p>
      <dl>
        <div>
          <dt>Local composition checks</dt>
          <dd>
            {localFindings
              ? `${localFindings} structural findings — inspect the linked objects below.`
              : "No structural reference findings."}{" "}
            This does not establish backend validity.
          </dd>
        </div>
        {["validate", "test", "save"].map((kind) => {
          const check = checks.find(
            (c) =>
              c.kind === kind &&
              c.source === `${inspection.source}:${inspection.id}`,
          );
          return (
            <div key={kind}>
              <dt>
                {kind === "validate"
                  ? "Backend validation"
                  : kind === "test"
                    ? "Backend contract tests"
                    : "Save preservation"}
              </dt>
              <dd>
                <Badge>{evidenceState(check, inspection, graph)}</Badge>
                {check && (
                  <details>
                    <summary>
                      Evidence details · revision {check.revision}
                    </summary>
                    <p>Response observed {check.observedAt}</p>
                    {check.report.contractHash ? (
                      <p>Contract hash: {display(check.report.contractHash)}</p>
                    ) : null}
                    <pre>{display(check.report)}</pre>
                  </details>
                )}
              </dd>
            </div>
          );
        })}
        <div>
          <dt>Runtime activation</dt>
          <dd>
            Not verified by this preview. Use publication target tracking for
            the exact released configuration.
          </dd>
        </div>
      </dl>
      <p>
        Run backend validation and contract tests using the saved-draft actions.
        Session evidence is cleared when this workspace reloads.
      </p>
    </section>
  );
}
