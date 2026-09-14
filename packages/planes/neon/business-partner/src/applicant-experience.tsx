"use client";

import { createHttpClient } from "@athyper/platform-api-client";
import {
  createSupplierApplicantClient,
  type SupplierApplicantStatus,
} from "./applicant-client";
export type { SupplierApplicantStatus } from "./applicant-client";
import { readBrowserCsrfToken } from "@athyper/platform-shell-app-foundation";
import { Button, Card, Input, Label } from "@athyper/platform-ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";

export const SUPPLIER_APPLICANT_STATES = Object.freeze([
  "accept",
  "draft",
  "uploading",
  "returned",
  "validation_failed",
  "pending_approval",
  "complete",
  "unauthorized",
  "error",
] as const);

export function applicantPresentation(status: string) {
  if (status === "returned")
    return {
      state: "returned",
      title: "Changes requested",
      detail:
        "Review the validation feedback, update your proposal, and submit it again.",
    } as const;
  if (status === "validation_failed")
    return {
      state: "validation_failed",
      title: "Validation needs attention",
      detail:
        "Correct the highlighted application data before submitting again.",
    } as const;
  if (["submitted", "pending_approval", "in_review"].includes(status))
    return {
      state: "pending_approval",
      title: "Application submitted",
      detail: "Your proposal is awaiting independent review in Neon.",
    } as const;
  if (
    [
      "approved",
      "applying",
      "materializing",
      "applied",
      "materialized",
    ].includes(status)
  )
    return {
      state: "complete",
      title: "Review complete",
      detail: "The receiving organization has completed its governed decision.",
    } as const;
  return {
    state: "draft",
    title: "Application in progress",
    detail:
      "Your changes remain a proposal until an independent Neon approver accepts them.",
  } as const;
}
export function projectApplicantPayload(
  payload: Readonly<Record<string, unknown>>,
) {
  return {
    name: String(payload["name"] ?? ""),
    registrationNumber: String(payload["registrationNumber"] ?? ""),
  };
}

export function SupplierApplicantExperience({
  initialRequestId,
}: {
  readonly initialRequestId?: string;
}) {
  const api = useMemo(
    () =>
      createSupplierApplicantClient(
        createHttpClient({ csrfToken: readBrowserCsrfToken }),
      ),
    [],
  );
  const [request, setRequest] = useState<SupplierApplicantStatus>(),
    [requestId, setRequestId] = useState(initialRequestId ?? ""),
    [token, setToken] = useState(""),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [registrationNumber, setRegistrationNumber] = useState(""),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string>();
  useEffect(() => {
    const fragment = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const fragmentToken = fragment.get("token");
    if (fragmentToken) {
      setToken(fragmentToken);
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    const saved =
      initialRequestId ??
      sessionStorage.getItem("athyper.bp.supplier-application.request");
    if (saved) setRequestId(saved);
  }, [initialRequestId]);
  useEffect(() => {
    if (!requestId) return;
    void refresh(requestId);
  }, [requestId]);
  async function refresh(id = requestId) {
    try {
      const value = await api.status(id);
      setRequest(value);
      const payload = projectApplicantPayload(value.editablePayload);
      setName(payload.name);
      setRegistrationNumber(payload.registrationNumber);
      setMessage(undefined);
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      const key = `supplier-accept-${crypto.randomUUID()}`;
      const result = await api.accept({
        token,
        inviteeEmail: email,
        requestIdempotencyKey: key,
        proposedPayload: payload(name, registrationNumber),
      });
      sessionStorage.setItem(
        "athyper.bp.supplier-application.request",
        result.request.id,
      );
      setToken("");
      setRequestId(result.request.id);
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveCorrection() {
    if (!request) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await api.correction(request.requestId, {
        expectedVersion: request.rowVersion,
        proposedPayload: payload(name, registrationNumber),
      });
      await refresh();
      setMessage("Correction saved.");
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!request || !file) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await api.upload(request.requestId, file);
      setFile(undefined);
      setMessage("Evidence uploaded and linked to this application only.");
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!request) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const value = await api.submit(request.requestId, {
        expectedVersion: request.rowVersion,
        idempotencyKey: `supplier-submit-${crypto.randomUUID()}`,
      });
      setRequest(value);
      setMessage(
        value.status === "validation_failed"
          ? "Validation found items to correct."
          : "Application submitted for independent review.",
      );
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!requestId)
    return (
      <main className="bp-applicant">
        <Card>
          <h1>Supplier application</h1>
          <p>
            Use the invitation issued by the receiving organization. Your access
            is limited to this application.
          </p>
          <form onSubmit={accept}>
            <Label htmlFor="invitation-token">Invitation token</Label>
            <Input
              id="invitation-token"
              type="password"
              autoComplete="one-time-code"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
            <Label htmlFor="invitee-email">Invited email</Label>
            <Input
              id="invitee-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Label htmlFor="supplier-legal-name">Registered name</Label>
            <Input
              id="supplier-legal-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Label htmlFor="supplier-registration-number">
              Registration number
            </Label>
            <Input
              id="supplier-registration-number"
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value)}
            />
            {message ? <p role="alert">{message}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Accepting…" : "Accept invitation and continue"}
            </Button>
          </form>
        </Card>
      </main>
    );
  const presentation = applicantPresentation(request?.status ?? "draft"),
    editable = Boolean(
      request &&
      ["draft", "returned", "validation_failed"].includes(request.status),
    );
  return (
    <main className="bp-applicant">
      <Card>
        <p>Supplier application · {request?.requestNo ?? "Loading…"}</p>
        <h1>{presentation.title}</h1>
        <p>{presentation.detail}</p>
        {request ? (
          <>
            <dl>
              <dt>Status</dt>
              <dd>{request.status.replaceAll("_", " ")}</dd>
              <dt>Access</dt>
              <dd>This application only</dd>
            </dl>
            {editable ? (
              <>
                <Label htmlFor="applicant-legal-name">Registered name</Label>
                <Input
                  id="applicant-legal-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Label htmlFor="applicant-registration-number">
                  Registration number
                </Label>
                <Input
                  id="applicant-registration-number"
                  value={registrationNumber}
                  onChange={(event) =>
                    setRegistrationNumber(event.target.value)
                  }
                />
                {request.status === "returned" ? (
                  <Button
                    type="button"
                    onClick={saveCorrection}
                    disabled={busy}
                  >
                    Save correction
                  </Button>
                ) : null}
                <fieldset>
                  <legend>Supporting evidence</legend>
                  <Input
                    aria-label="Supporting evidence file"
                    type="file"
                    onChange={(event) => setFile(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    onClick={upload}
                    disabled={busy || !file}
                  >
                    {busy ? "Working…" : "Upload protected evidence"}
                  </Button>
                </fieldset>
                <Button type="button" onClick={submit} disabled={busy}>
                  Validate and submit proposal
                </Button>
              </>
            ) : null}
            <Button type="button" onClick={() => refresh()} disabled={busy}>
              Refresh status
            </Button>
          </>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </Card>
    </main>
  );
}

function payload(name: string, registrationNumber: string) {
  return {
    name: name.trim(),
    ...(registrationNumber.trim()
      ? { registrationNumber: registrationNumber.trim() }
      : {}),
  };
}

function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "The application could not be updated.";
}
