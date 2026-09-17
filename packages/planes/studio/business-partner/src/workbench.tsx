"use client";
import { Badge } from "@athyper/platform-ui";
import { VersionContext } from "./version-context";
import { CompositionEvidenceProvider } from "./composition-evidence";
import {
  createContext,
  useCallback,
  useRef,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  choices,
  display,
  draftList,
  inspectionRead,
  operationTrace,
  record,
  releaseList,
  rows,
  type Choice,
  type Inspection,
  type InspectionSource,
  type Json,
} from "./workbench-model";

import { PermissionExplorer } from "./composition-configuration-controls";
import {
  CompositionWorkspace,
  type CompositionSelection,
} from "./composition-workspace";
import {
  CompositionReview,
  type CompositionPreview,
} from "./composition-review";
import { CompositionNavigation } from "./composition-navigation";
import { CompositionEditor } from "./composition-editor";
import {
  PublicationStepUp,
  WorkbenchPublication,
} from "./workbench-publication";
import { WorkbenchEditor } from "./workbench-editor";

interface State {
  renderCompositionPreview?: CompositionPreview;
  onCompositionSaved?: (inspection: Inspection) => void;
  onCompositionGuard?: (dirty: boolean, busy: boolean) => void;
  compositionLocked?: boolean;
  compositionSelection?: CompositionSelection;
  onCompositionSelect?: (value: CompositionSelection) => void;
  inspection?: Inspection;
  loading: boolean;
  error?: string;
}
const Context = createContext<State>({ loading: false });
export function BusinessPartnerWorkbench({
  selection,
  onSelect,
  children,
  renderPreview,
  renderCompositionPreview,
  compositionMode = false,
  renderContextHeader,
  selectedObject,
  onObjectSelect,
}: {
  renderCompositionPreview?: CompositionPreview;
  compositionMode?: boolean;
  renderContextHeader?: (controls: ReactNode, status: ReactNode) => ReactNode;
  selectedObject?: string;
  onObjectSelect?: (node: string) => void;
  selection: string;
  onSelect: (selection: string) => void;
  children: ReactNode;
  renderPreview?: (graph: Json, revision: string) => ReactNode;
}) {
  const [compositionSelection, onCompositionSelect] =
    useState<CompositionSelection>();
  const http = useApiClient();
  const guard = useRef({ dirty: false, busy: false });
  const publicationLock = useRef(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const onPublicationBusy = useCallback((busy: boolean) => {
    publicationLock.current = busy;
    setPublicationBusy(busy);
  }, []);
  const onGuardChange = useCallback((dirty: boolean, busy: boolean) => {
    guard.current = { dirty, busy };
  }, []);
  const mayLeave = () =>
    !publicationLock.current &&
    !guard.current.busy &&
    (!guard.current.dirty ||
      window.confirm("Discard unsaved configuration changes?"));
  const select = (value: string) => {
    if (mayLeave()) onSelect(value);
  };
  const onSaved = (inspection: Inspection) =>
    setState({ loading: false, inspection });
  const [catalog, setCatalog] = useState<Choice[]>([]),
    [catalogErrors, setCatalogErrors] = useState<string[]>([]),
    [catalogBusy, setCatalogBusy] = useState(true);
  const [state, setState] = useState<State>({ loading: false }),
    [attempt, setAttempt] = useState(0),
    [bundleId, setBundleId] = useState("");
  const preloaded = useRef<Inspection | undefined>(undefined);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [loadedSelection, setLoadedSelection] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    setCatalogBusy(true);
    setCatalog([]);
    setCatalogErrors([]);
    void Promise.allSettled([
      http
        .request(releaseList, { signal: abort.signal })
        .then((v) => choices(v, "release")),
      http
        .request(draftList, { signal: abort.signal })
        .then((v) => choices(v, "draft")),
    ]).then((results) => {
      if (abort.signal.aborted) return;
      setCatalog(
        results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      );
      setCatalogErrors(
        results.flatMap((r, i) =>
          r.status === "rejected"
            ? [
                `${i === 0 ? "Published releases" : "Change sets"}: ${message(r.reason)}`,
              ]
            : [],
        ),
      );
      setCatalogBusy(false);
    });
    return () => abort.abort();
  }, [http, attempt, catalogRefresh]);
  useEffect(() => {
    const abort = new AbortController();
    if (
      preloaded.current &&
      `${preloaded.current.source}:${preloaded.current.id}` === selection
    ) {
      setLoadedSelection(selection);
      setState({ loading: false, inspection: preloaded.current });
      preloaded.current = undefined;
      return () => abort.abort();
    }
    preloaded.current = undefined;
    setLoadedSelection("");
    setState({ loading: Boolean(selection) });
    if (!selection) return () => abort.abort();
    const separator = selection.indexOf(":"),
      source = selection.slice(0, separator),
      id = selection.slice(separator + 1);
    if (!["release", "draft", "bundle"].includes(source) || !isId(id)) {
      setState({
        loading: false,
        error:
          "Invalid definition selection. Choose a stored release or change set.",
      });
      return () => abort.abort();
    }
    void http
      .request(inspectionRead(source as InspectionSource, id), {
        signal: abort.signal,
      })
      .then((inspection) => {
        if (!abort.signal.aborted) {
          setLoadedSelection(selection);
          setState({ loading: false, inspection });
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({ loading: false, error: message(error) });
      });
    return () => abort.abort();
  }, [http, selection, attempt]);
  // Never render the previous selection while a navigation-triggered read starts.
  const visible =
    state.inspection && loadedSelection !== selection
      ? { loading: Boolean(selection) }
      : state;
  const selected = visible.inspection;
  async function openVersion(key: string, signal: AbortSignal) {
    const separator = key.indexOf(":"),
      source = key.slice(0, separator),
      id = key.slice(separator + 1);
    if (!["draft", "release", "bundle"].includes(source) || !isId(id))
      throw Error("Invalid version selection.");
    if (publicationLock.current || guard.current.busy)
      throw Error("Wait for the current operation to finish.");
    const next = await http.request(
      inspectionRead(source as InspectionSource, id),
      { signal },
    );
    if (signal.aborted || !mayLeave()) return false;
    preloaded.current = next;
    onSelect(key);
    return true;
  }
  const draftLauncher =
    selected?.changeSetId &&
    (selected.source === "release" || selected.status === "published") ? (
      <fieldset
        className="studio-draft-launcher__guard"
        disabled={publicationBusy}
      >
        <WorkbenchEditor
          compact
          key={`${selected.source}:${selected.id}:${attempt}`}
          inspection={selected}
          onSelect={select}
          onGuardChange={onGuardChange}
          onSaved={onSaved}
        />
      </fieldset>
    ) : (
      <button
        type="button"
        className="a-button a-button--secondary"
        disabled
        title={
          selected?.status === "draft"
            ? "A working draft is already open. Multiple drafts are not supported yet."
            : "Select a published release to open or create its entity’s working draft."
        }
      >
        + New draft
      </button>
    );
  const configurationStatus = selected ? (
    <Badge>
      {selected.source === "draft" && selected.status === "draft"
        ? "Editable draft"
        : selected.status === "approved"
          ? "Approved · Read-only"
          : selected.status === "in_review"
            ? "In review · Read-only"
            : "Read-only configuration"}
    </Badge>
  ) : null;
  const versionControls = (
    <div className="studio-version-bar">
      <PublicationStepUp
        compact
        busy={publicationBusy}
        canAct={() => !guard.current.dirty && !guard.current.busy}
      />
      <VersionContext
        showStatus={!renderContextHeader}
        selection={selection}
        inspection={selected}
        catalog={catalog}
        loading={catalogBusy}
        errors={catalogErrors}
        onRefresh={() => setCatalogRefresh((n) => n + 1)}
        onOpen={openVersion}
      />
      {draftLauncher}
      {!renderContextHeader ? (
        <a
          href={`/mdg/business-partner/publication?inspect=${encodeURIComponent(selection)}`}
        >
          Publication →
        </a>
      ) : null}
    </div>
  );
  return (
    <CompositionEvidenceProvider>
      <Context.Provider
        value={{
          ...visible,
          renderCompositionPreview,
          onCompositionSaved: onSaved,
          onCompositionGuard: onGuardChange,
          compositionLocked: publicationBusy,
          compositionSelection: selectedObject
            ? {
                source: selection,
                node: selectedObject,
                reveal:
                  compositionSelection?.source === selection &&
                  compositionSelection.node === selectedObject
                    ? compositionSelection.reveal
                    : undefined,
              }
            : compositionSelection,
          onCompositionSelect: (value) => {
            onCompositionSelect(value);
            onObjectSelect?.(value.node);
          },
        }}
      >
        {compositionMode && renderContextHeader
          ? renderContextHeader(versionControls, configurationStatus)
          : null}
        <section
          className={`bp-workbench ${compositionMode ? "bp-workbench--compact" : ""} ${compositionMode && renderContextHeader ? "bp-workbench--header-context" : ""}`}
          aria-label="Stored Business Partner configuration"
        >
          {compositionMode && !renderContextHeader ? versionControls : null}
          <div hidden={compositionMode}>
            <div className="bp-workbench-heading">
              <div>
                <h2>Configuration workbench</h2>
                <p>
                  Inspect a stored definition across all tabs. Inspection makes
                  no changes.
                </p>
              </div>
              <button
                type="button"
                className="a-button a-button--secondary"
                onClick={() => {
                  if (mayLeave()) setAttempt((n) => n + 1);
                }}
              >
                Refresh stored data
              </button>
            </div>
            <label className="bp-workbench-selector">
              Stored version
              <select
                value={selection.startsWith("bundle:") ? "" : selection}
                onChange={(event) => select(event.target.value)}
                disabled={catalogBusy}
              >
                <option value="">
                  {catalogBusy
                    ? "Loading stored versions…"
                    : "Select a published release or change set"}
                </option>
                {selection &&
                !selection.startsWith("bundle:") &&
                !catalog.some((c) => `${c.source}:${c.id}` === selection) ? (
                  <option value={selection}>
                    Selected version · {selection}
                  </option>
                ) : null}
                {(["release", "draft"] as const).map((source) => (
                  <optgroup
                    key={source}
                    label={
                      source === "release"
                        ? "Published source releases"
                        : "Change sets (not release snapshots)"
                    }
                  >
                    {catalog
                      .filter((c) => c.source === source)
                      .map((c) => (
                        <option
                          key={`${source}:${c.id}`}
                          value={`${source}:${c.id}`}
                        >
                          {c.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {!catalogBusy && !catalog.length && !catalogErrors.length ? (
              <p>
                No Business Partner definitions were returned. The catalog lists
                up to 100 recent entries; a selected version can also be opened
                by its saved URL.
              </p>
            ) : null}
            {catalogErrors.map((error) => (
              <p role="alert" key={error}>
                {error}
              </p>
            ))}
            <details
              className="bp-workbench-version-details"
              open={compositionMode ? undefined : true}
            >
              <summary>Version details</summary>
              <details>
                <summary>Inspect a Business Partner bundle revision</summary>
                <p>
                  Bundles contain separate validation, matching, and workflow
                  declarations. Enter a known revision ID; this does not
                  identify an active deployment.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (isId(bundleId.trim()))
                      select(`bundle:${bundleId.trim()}`);
                  }}
                >
                  <label>
                    Bundle revision ID
                    <input
                      value={bundleId}
                      onChange={(event) => setBundleId(event.target.value)}
                      placeholder="Revision UUID"
                    />
                  </label>
                  <button
                    className="a-button a-button--secondary"
                    disabled={!isId(bundleId.trim())}
                  >
                    Load stored bundle
                  </button>
                </form>
              </details>
              {visible.loading ? (
                <p role="status">Loading selected configuration…</p>
              ) : visible.error ? (
                <p role="alert">{visible.error}</p>
              ) : selected ? (
                <>
                  <dl className="bp-workbench-facts">
                    <div>
                      <dt>Source</dt>
                      <dd>
                        {selected.source === "release"
                          ? "Native entity release"
                          : selected.source === "draft"
                            ? "Native entity change set"
                            : "Business Partner bundle"}
                      </dd>
                    </div>
                    <div>
                      <dt>Version</dt>
                      <dd>{selected.version}</dd>
                    </div>
                    <div>
                      <dt>State</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>Target planes declared</dt>
                      <dd>
                        {selected.targets.join(", ") ||
                          "Not supplied by this source"}
                      </dd>
                    </div>
                  </dl>
                  <details>
                    <summary>Source identifiers</summary>
                    <p>
                      Selected ID: <code>{selected.id}</code>
                    </p>
                    {selected.hash ? (
                      <p>
                        Stored hash: <code>{selected.hash}</code>
                      </p>
                    ) : null}
                    {selected.publishedAt ? (
                      <p>Published: {selected.publishedAt}</p>
                    ) : null}
                  </details>
                  <p>
                    <strong>
                      Source publication is not target activation.
                    </strong>{" "}
                    Use target activation tracking below for a published
                    release.
                  </p>
                </>
              ) : (
                <p>
                  Select a version to inspect its actual configuration. No
                  example definition is substituted.
                </p>
              )}
            </details>
          </div>
          {compositionMode && visible.loading ? (
            <p role="status">Loading selected configuration…</p>
          ) : null}
          {compositionMode && visible.error ? (
            <p role="alert">{visible.error}</p>
          ) : null}
          {selected && !compositionMode ? (
            <fieldset
              disabled={publicationBusy}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              <WorkbenchEditor
                key={`${selected.source}:${selected.id}:${attempt}`}
                inspection={selected}
                onSelect={select}
                onGuardChange={onGuardChange}
                onSaved={onSaved}
                renderPreview={renderPreview}
              />
            </fieldset>
          ) : null}
          {!selected && !compositionMode ? (
            <PublicationStepUp
              busy={publicationBusy}
              canAct={() => !guard.current.dirty && !guard.current.busy}
            />
          ) : null}
          {selected && !compositionMode ? (
            <WorkbenchPublication
              key={`${selected.source}:${selected.id}:${attempt}`}
              inspection={selected}
              onSaved={onSaved}
              onSelect={select}
              canAct={() => !guard.current.dirty && !guard.current.busy}
              onBusyChange={onPublicationBusy}
            />
          ) : null}
        </section>
        {children}
      </Context.Provider>
    </CompositionEvidenceProvider>
  );
}
function isId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function message(error: unknown) {
  const status = record(error).status;
  const code = String(record(record(error).problem).code ?? "");
  if (code === "MFA_REQUIRED")
    return "MFA verification is required to read these versions. Verify your identity, then refresh the list.";
  return status === 403
    ? "Access denied. The server did not authorize this read; check the account’s permissions and authentication requirements."
    : status === 404
      ? "The selected stored definition was not found."
      : error instanceof Error
        ? error.message
        : "Stored configuration is unavailable. Retry the read.";
}
export type WorkbenchTab =
  | "overview"
  | "model"
  | "validation"
  | "matching"
  | "workflows"
  | "operations"
  | "publication"
  | "ai-experience";
export function BusinessPartnerInspection({ tab }: { tab: WorkbenchTab }) {
  const {
    inspection,
    loading,
    error,
    compositionSelection,
    onCompositionSelect,
    onCompositionSaved,
    onCompositionGuard,
    compositionLocked,
    renderCompositionPreview,
  } = useContext(Context);
  if (!inspection || loading || error)
    return (
      <section className="bp-inspection bp-inspection--empty">
        {!loading && !error ? <h2>Choose a version to explore</h2> : null}
        <p>
          {loading
            ? "Waiting for the selected configuration…"
            : error
              ? "Configuration cannot be displayed until the read succeeds."
              : "Use Choose version to open a draft or published release, then compose, preview and review changes here."}
        </p>
      </section>
    );
  const d = inspection.data,
    bundle = inspection.source === "bundle";
  return (
    <section
      className={`bp-inspection ${!bundle && ["model", "validation", "workflows"].includes(tab) ? "bp-inspection--workspace" : ""}`}
      aria-label={`${tab} stored configuration`}
    >
      <p
        className="bp-inspection-source"
        hidden={!bundle && ["model", "validation", "workflows"].includes(tab)}
      >
        Source: {inspection.source} · version {inspection.version} ·{" "}
        {inspection.id}
      </p>
      {tab === "overview" ? (
        <>
          <h2>Selected configuration</h2>
          <div className="bp-workbench-facts">
            {(bundle
              ? [
                  "requestSchemas",
                  "validationDeclarations",
                  "duplicateRules",
                  "formDescriptors",
                  "workflowDefinitions",
                ]
              : [
                  "fields",
                  "relations",
                  "surfaces",
                  "operations",
                  "operationPermissions",
                ]
            ).map((key) => (
              <div key={key}>
                <strong>{title(key)}</strong>
                <p>
                  {Array.isArray(d[key])
                    ? (d[key] as unknown[]).length
                    : Object.keys(record(d[key])).length}{" "}
                  entries
                </p>
              </div>
            ))}
          </div>
          <Data
            title="Entity / bundle identity"
            value={
              bundle
                ? {
                    bundleCode: d.bundleCode,
                    semanticVersion: d.semanticVersion,
                  }
                : d.entity
            }
          />
          <p>
            Counts describe this source only. Publication does not assign
            permissions to users.
          </p>
        </>
      ) : null}
      {tab === "model" ||
      (["validation", "workflows"].includes(tab) && !bundle) ? (
        bundle ? (
          <>
            <Data title="Request schemas" value={d.requestSchemas} />
            <Data title="Form descriptors" value={d.formDescriptors} />
            <Data title="View descriptors" value={d.viewDescriptors} />
            <Data title="Mapping contracts" value={d.mappingContracts} />
          </>
        ) : inspection.source === "draft" &&
          inspection.status === "draft" &&
          onCompositionSaved &&
          onCompositionGuard ? (
          <CompositionNavigation key={`${inspection.source}:${inspection.id}`}>
            <CompositionEditor
              key={`${inspection.source}:${inspection.id}`}
              inspection={inspection}
              selection={compositionSelection}
              onSelect={onCompositionSelect}
              onSaved={onCompositionSaved}
              onGuardChange={onCompositionGuard}
              locked={compositionLocked}
              renderPreview={renderCompositionPreview}
            />
          </CompositionNavigation>
        ) : (
          <CompositionNavigation key={`${inspection.source}:${inspection.id}`}>
            <CompositionWorkspace
              inspection={inspection}
              selection={compositionSelection}
              onSelect={onCompositionSelect}
            />
            <CompositionReview
              baseline={inspection}
              saved={inspection}
              working={inspection.data}
              selection={compositionSelection}
              onSelect={onCompositionSelect}
              renderPreview={renderCompositionPreview}
            />
          </CompositionNavigation>
        )
      ) : null}
      {tab === "validation" ? (
        bundle ? (
          <>
            <Data
              title="Validation declarations"
              value={d.validationDeclarations}
            />
            <Data title="Field policies" value={d.fieldPolicies} />
            <Data title="Readiness gates" value={d.readinessGates} />
            <p>
              Stored declarations are not test results or proof of runtime
              execution.
            </p>
          </>
        ) : (
          <>
            <Table
              title="Field validation"
              entries={rows(d.fields).filter(
                (f) => f.validationSpec !== undefined,
              )}
              columns={["fieldKey", "validationSpec"]}
            />
            <Data title="Operation rules" value={d.operationRules} />
            <Data title="Policy bindings" value={d.policyBindings} />
            <Data title="Field policy bindings" value={d.fieldPolicyBindings} />
            <Data title="Contract test declarations" value={d.tests} />
            <p>
              External policy content and test outcomes are not included in this
              graph read.
            </p>
          </>
        )
      ) : null}
      {tab === "matching" ? (
        bundle ? (
          <>
            <Data title="Duplicate rules" value={d.duplicateRules} />
            <p>
              These are stored matching declarations. No matching simulation has
              been run.
            </p>
          </>
        ) : (
          <>
            <p>
              Duplicate matching rules belong to the separate Business Partner
              bundle. Load its known revision above to inspect them. Search
              definitions below are not duplicate-matching rules.
            </p>
            <Data title="Search profiles" value={d.searchProfiles} />
            <Data title="Search fields" value={d.searchFields} />
            <Data title="Identity keys" value={d.keys} />
          </>
        )
      ) : null}
      {tab === "workflows" ? (
        bundle ? (
          <>
            <Data title="Workflow definitions" value={d.workflowDefinitions} />
            <Data title="Evidence policies" value={d.evidencePolicies} />
            <Data title="Readiness gates" value={d.readinessGates} />
            <p>
              Task-edit policies and case contracts have independent revisions.
              This bundle does not establish their current activation.
            </p>
          </>
        ) : (
          <>
            <Data title="Flows" value={d.flows} />
            <Data title="Flow steps" value={d.flowSteps} />
            <Data title="Lifecycle bindings" value={d.lifecycleBindings} />
            <Data
              title="Lifecycle operation bindings"
              value={d.lifecycleOperationBindings}
            />
            <p>
              Operational journey definitions belong to the separate Business
              Partner bundle.
            </p>
          </>
        )
      ) : null}
      {tab === "operations" ? (
        <>
          {bundle ? (
            <p>
              Surface-to-permission bindings belong to a native entity release.
              Select one above to inspect them.
            </p>
          ) : (
            <>
              <PermissionExplorer graph={d} />
              <Table
                title="Surface → operation → permission → scope"
                entries={operationTrace(d)}
                columns={[
                  "operation",
                  "surfaces",
                  "plane",
                  "permission",
                  "scopes",
                  "handler",
                  "status",
                ]}
              />
              <p>
                Bindings describe required access, not the current user's
                grants. Empty scope declarations do not imply unrestricted
                access. Headless operations do not require a UI placement.
              </p>
            </>
          )}
          <h3>Supporting-document API dependency</h3>
          <p>
            Source-code dependency, separate from the selected release: the
            attachment widget stages, finalizes, and reads attachment status.
            These APIs independently require attachment create/finalize/read
            authorization. Business Partner create access alone does not grant
            uploads.
          </p>
        </>
      ) : null}
      {tab === "publication" ? (
        <>
          <h2>Selected source publication evidence</h2>
          <p>
            {inspection.source === "release"
              ? `Stored source release ${inspection.version} was published at ${inspection.publishedAt}.`
              : "The selected revision is not evidence of a published and active target release."}
          </p>
          <p>
            Use target activation tracking in the shared workbench above for
            native releases. Separate bundle authoring tools below maintain
            their own revision selection; they do not automatically publish this
            inspected source.
          </p>
        </>
      ) : null}
      {tab === "ai-experience" ? (
        <p>
          Atlas experience has an independent draft and release. Its editor
          below is not pinned to this inspected Business Partner definition.
        </p>
      ) : null}
      <details>
        <summary>Complete stored source (read-only)</summary>
        <pre>{JSON.stringify(d, null, 2)}</pre>
      </details>
    </section>
  );
}
function title(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
function Data({ title: heading, value }: { title: string; value: unknown }) {
  if (value === undefined)
    return (
      <section>
        <h3>{heading}</h3>
        <p>Not supplied by this stored source.</p>
      </section>
    );
  const entries = Array.isArray(value)
    ? value.map(
        (v, i) =>
          [
            display(
              record(v).fieldKey ??
                record(v).ruleKey ??
                record(v).flowKey ??
                record(v).bindingKey ??
                record(v).key ??
                i + 1,
            ),
            v,
          ] as const,
      )
    : Object.entries(record(value));
  return (
    <section>
      <h3>
        {heading} <small>({entries.length})</small>
      </h3>
      {entries.length ? (
        entries.map(([key, item], i) => (
          <details key={`${key}-${i}`}>
            <summary>{key}</summary>
            <pre>{JSON.stringify(item, null, 2)}</pre>
          </details>
        ))
      ) : (
        <p>No entries declared in this stored source.</p>
      )}
    </section>
  );
}
function Table({
  title: heading,
  entries,
  columns,
}: {
  title: string;
  entries: Json[];
  columns: string[];
}) {
  return (
    <section>
      <h3>
        {heading} <small>({entries.length})</small>
      </h3>
      {entries.length ? (
        <div className="bp-inspection-table">
          <table>
            <thead>
              <tr>
                {columns.map((key) => (
                  <th key={key} scope="col">
                    {title(key)}
                  </th>
                ))}
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row, i) => (
                <tr key={`${display(row.id)}-${i}`}>
                  {columns.map((key) => (
                    <td key={key}>{display(row[key])}</td>
                  ))}
                  <td>
                    <details>
                      <summary>Inspect</summary>
                      <pre>{JSON.stringify(row, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No entries declared in this stored source.</p>
      )}
    </section>
  );
}
