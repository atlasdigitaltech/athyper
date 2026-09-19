"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useCallback,
} from "react";
import {
  ApiTransportError,
  createOperation,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import type { DataInputHandlers } from "@athyper/platform-entity-form-detail";

const stage = createOperation<
  { attachmentId: string; uploadUrl: string },
  {
    attachmentId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }
>({ method: "POST", path: () => "/api/attachments/stage" });
const finalize = (id: string) =>
  createOperation<unknown, { contentType: string }>({
    method: "POST",
    path: () => `/api/attachments/${encodeURIComponent(id)}/finalize`,
  });
const status = (id: string) =>
  createOperation<{ status: string; fileName?: string }>({
    method: "GET",
    path: () => `/api/attachments/${encodeURIComponent(id)}/status`,
  });
const AttachmentChoices = createContext<{
  files: Readonly<Record<string, string>>;
  remember: (id: string, name: string) => void;
  report: (id: string, problem?: string) => void;
}>({ files: {}, remember: () => {}, report: () => {} });
export function RequestAttachmentScope({
  children,
  onReadinessChange,
}: {
  children: ReactNode;
  onReadinessChange?: (problems: readonly string[]) => void;
}) {
  const problems = useRef(new Map<string, string>());
  const report = useCallback(
    (id: string, problem?: string) => {
      if (problem) problems.current.set(id, problem);
      else problems.current.delete(id);
      onReadinessChange?.([...problems.current.values()]);
    },
    [onReadinessChange],
  );
  const [files, setFiles] = useState<Readonly<Record<string, string>>>({});
  return (
    <AttachmentChoices.Provider
      value={{
        files,
        report,
        remember: (id, name) =>
          setFiles((current) =>
            current[id] === name ? current : { ...current, [id]: name },
          ),
      }}
    >
      {children}
    </AttachmentChoices.Provider>
  );
}
/** Shared by each metadata-authored supporting-document item. */
export function RequestAttachmentField({
  field,
  value,
  onChange,
  id,
  name,
  disabled,
}: Parameters<DataInputHandlers[string]>[0]) {
  const http = useApiClient(),
    choices = useContext(AttachmentChoices);
  const labels = field.attachmentLabels!;
  if (!labels) throw Error("Published attachment labels required");
  const [busy, setBusy] = useState(false),
    [uploadDenied, setUploadDenied] = useState(false),
    [error, setError] = useState<string>(),
    [fileName, setFileName] = useState<string>();
  const generation = useRef(0);
  useEffect(() => {
    choices.report(id, busy ? labels.uploading : error);
  }, [id, busy, error, choices.report, labels.uploading]);
  useEffect(() => () => choices.report(id), [id, choices.report]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (typeof value !== "string" || !value) return;
    setBusy(true);
    const abort = new AbortController();
    http
      .request(status(value), { signal: abort.signal })
      .then((r) => {
        if (abort.signal.aborted) return;
        setError(undefined);
        setFileName(r.fileName);
        if (r.status !== "active") setError(labels.processing);
        else if (r.fileName) choices.remember(String(value), r.fileName);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(labels.unavailable);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [http, value]);
  async function upload(file: File) {
    const attempt = ++generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const contentType = file.type || "application/octet-stream";
      const staged = await http.request(stage, {
        body: {
          attachmentId: crypto.randomUUID(),
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        },
      });
      const response = await fetch(staged.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
        credentials: "omit",
      });
      if (!response.ok) throw Error(labels.uploadFailed);
      await http.request(finalize(staged.attachmentId), {
        body: { contentType },
      });
      const current = await http.request(status(staged.attachmentId), {});
      if (attempt !== generation.current) return;
      if (current.status !== "active") throw Error(labels.processing);
      setFileName(file.name);
      choices.remember(staged.attachmentId, file.name);
      onChange(staged.attachmentId);
    } catch (cause) {
      if (attempt === generation.current) {
        const denied =
          cause instanceof ApiTransportError && cause.status === 403;
        if (denied) setUploadDenied(true);
        setError(
          denied
            ? (labels.uploadNotAllowed ?? labels.unavailable)
            : cause instanceof Error
              ? cause.message
              : labels.uploadFailed,
        );
      }
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  return (
    <div className="a-supporting-document-field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      <input
        id={id}
        type="file"
        disabled={disabled || busy || uploadDenied}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
        aria-describedby={`${id}-status`}
      />
      {Object.keys(choices.files).length > 0 ? (
        <select
          aria-label={labels.selectExisting}
          disabled={disabled || busy}
          value={String(value ?? "")}
          onChange={(event) => {
            setError(undefined);
            setFileName(choices.files[event.target.value]);
            onChange(event.target.value);
          }}
        >
          <option value="">{labels.selectExisting}</option>
          {Object.entries(choices.files).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      ) : null}
      <input type="hidden" name={name} value={String(value ?? "")} />
      {value ? (
        <input
          readOnly
          aria-label={field.label}
          value={fileName ?? labels.attached}
        />
      ) : null}
      <p id={`${id}-status`} role={error ? "alert" : "status"}>
        {error ??
          (busy
            ? labels.uploading
            : value
              ? (fileName ?? labels.attached)
              : field.helpText)}
      </p>
    </div>
  );
}
