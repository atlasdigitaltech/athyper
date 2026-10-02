"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { readBrowserCsrfToken } from "@athyper/platform-shell-app-foundation";
import { Button, ChoiceSelect, Dialog, DialogContent } from "@athyper/platform-ui";
import { ApiTransportError } from "@athyper/platform-api-client";
import { createProtectedValueAttempt } from "./record/protected-value-attempt";

function revealFailure(error: unknown): string {
  if (!(error instanceof ApiTransportError)) return "The reveal response could not be displayed. Please retry.";
  const code = error.problem?.code;
  const message = code === "BP_360_STEP_UP_REQUIRED"
    ? "Identity verification has expired. Refresh the page and verify your identity before revealing."
    : error.kind === "authentication" ? "Your session has expired. Sign in again."
    : error.kind === "authorization" ? "This reveal request was denied. Refresh the page to check your current access."
    : error.kind === "network" || error.kind === "timeout" || error.kind === "dependency" ? "The reveal service could not be reached. Please retry."
    : error.kind === "conflict" ? "This reveal request was already used. Please submit a new request."
    : "The reveal request failed. Please retry.";
  // Never render arbitrary server messages or response bodies containing protected values.
  return `${message}${error.requestId ? ` Reference: ${error.requestId}` : ""}`;
}

export type ProtectedValueRequest = (operation: string, id: string, purpose: string, signal: AbortSignal) => Promise<{ value: string; expiresAt: string }>;
const Context = createContext<ProtectedValueRequest | undefined>(undefined);
const ResetContext = createContext("");
export function ProtectedValueProvider({ request, resetKey = "", children }: { request: ProtectedValueRequest; resetKey?: string; children: ReactNode }) {
  return <Context.Provider value={request}><ResetContext.Provider value={resetKey}>{children}</ResetContext.Provider></Context.Provider>;
}
type ProtectedValueProps = { operation: string; id: string; allowed: boolean; verificationRequired?: boolean; masked: ReactNode; label?: string; purposes?: readonly {value:string; label:{defaultText:string}}[] };
/** Navigation resets only this sensitive leaf, never the surrounding workspace. */
export function ProtectedValue(props: ProtectedValueProps) {
  const resetKey = useContext(ResetContext);
  return <ProtectedValueContent key={resetKey} {...props} />;
}
/** Values remain component-local, expire and clear on unmount, hide, or failed retry. */
function ProtectedValueContent({ operation, id, allowed, verificationRequired, masked, label, purposes = [] }: ProtectedValueProps) {
  const request = useContext(Context);
  const [value, setValue] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const fieldRoot = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const restore = wasOpen.current && !confirm;
    wasOpen.current = confirm;
    if (!restore) return;
    const frame = requestAnimationFrame(() => fieldRoot.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirm]);
  const active = useRef<ReturnType<typeof createProtectedValueAttempt> | undefined>(undefined);
  const clear = () => { active.current?.cancel(); active.current = undefined; setValue(undefined); setConfirm(false); setBusy(false); };
  useEffect(() => { clear(); return clear; }, [id, operation, allowed, request]);
  useEffect(() => {
    // Only a short-lived UI intent is retained, never a value, purpose or authorization.
    try {
      const raw = sessionStorage.getItem("athyper.reveal.resume");
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (intent.id !== id || intent.operation !== operation) return;
      sessionStorage.removeItem("athyper.reveal.resume");
      if (intent.path === window.location.pathname + window.location.search && intent.expiresAt > Date.now() && (allowed || verificationRequired)) setConfirm(true);
    } catch { /* Malformed intent or unavailable storage cannot authorize reveal. */ }
  }, [id, operation, allowed, verificationRequired]);
  async function reveal() {
    if (!request || !allowed || !purposes.some(option => option.value === purpose) || !/^[a-z][a-z0-9_.-]{2,62}$/.test(purpose)) return;
    clear(); setConfirm(true); setBusy(true); setFailed(undefined);
    const attempt = createProtectedValueAttempt(); active.current = attempt;
    try {
      const result = await request(operation, id, purpose, attempt.controller.signal);
      if (attempt.controller.signal.aborted || active.current !== attempt) return;
      const remaining = Date.parse(result.expiresAt) - Date.now();
      if (typeof result.value !== "string" || !Number.isFinite(remaining) || remaining <= 0) throw Error("Invalid reveal");
      setValue(result.value); setBusy(false); setConfirm(false);
      // Clock skew must not reject a successful reveal. Never display beyond the
      // local 60-second maximum, even if the server clock is ahead of the browser.
      attempt.expireIn(Math.min(remaining, 60_000), clear);
    } catch (error) { if (!attempt.controller.signal.aborted) { clear(); setConfirm(true); setFailed(revealFailure(error)); } }
  }
  function verifyIdentity() {
    const csrf = readBrowserCsrfToken();
    if (!csrf) { setFailed("Identity verification could not start. Refresh the page and try again."); return; }
    try { sessionStorage.setItem("athyper.reveal.resume", JSON.stringify({id, operation, path:window.location.pathname + window.location.search, expiresAt:Date.now()+600_000})); } catch { /* Verification still works without UI persistence. */ }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/auth/step-up/start?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    const input = document.createElement("input");
    input.type = "hidden"; input.name = "csrfToken"; input.value = csrf;
    form.append(input); document.body.append(form); form.submit();
  }
  return <span ref={fieldRoot} className="a-protected-value">{allowed ? value ?? masked : masked}{request && (allowed || verificationRequired) && <>
    {value !== undefined ? <Button type="button" variant="ghost" onClick={() => clear()}>Hide</Button> : <Button type="button" variant="ghost" onClick={() => {setPurpose(""); setFailed(undefined); setConfirm(true);}}>Reveal</Button>}
    <Dialog open={confirm} onOpenChange={open => {if (!open) clear();}}>
      <DialogContent portal className="a-comment-action-dialog a-file-action-dialog" title={`Reveal ${label ?? "protected value"}`} description="This access is audited. The value will be visible for up to 60 seconds.">
        <form onSubmit={event => {event.preventDefault(); if (allowed) void reveal(); else verifyIdentity();}}>
          {allowed ? <label>Reason for access
            <ChoiceSelect autoFocus label="Reason for access" placeholder="Select a reason" value={purpose} disabled={busy} onChange={setPurpose}
              options={purposes.map(option => ({ value: option.value, label: option.label.defaultText }))}/>
          </label> : <p>Verify your identity to continue. You may be asked to set up an authenticator. Verification does not reveal the value automatically.</p>}
          {allowed && !purposes.length && <p role="alert">Reveal reasons are not configured. Contact your administrator.</p>}
          {failed && <p role="alert">{failed}</p>}
          <div className="a-comment-action-dialog__footer">
            <Button type="button" variant="secondary" onClick={clear}>Cancel</Button>
            <Button type="submit" disabled={busy || (allowed && !purposes.some(option => option.value === purpose))}>{busy ? "Revealing…" : allowed ? "Reveal value" : "Verify identity"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>}</span>;
}
