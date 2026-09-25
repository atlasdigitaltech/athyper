"use client";
import { useMemo, useRef, useState } from "react";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import {
  readBrowserCsrfToken,
  useApiClient,
  usePermissions,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import type { PartnerRequest, RequestView } from "./client";
import {useChangedRuntimeResources} from "./changed-runtime-resources";

const read = createOperation<RequestView>({
  method: "GET",
  path: ({ id }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(id)}/view`,
});
const create = createOperation<
  { request: PartnerRequest },
  Record<string, unknown>
>({
  method: "POST",
  path: "/api/neon/business-partner-cases",
  idempotency: "required",
});
const commands = Object.fromEntries(
  ["validate", "submit", "decisions", "materialize"].map((action) => [
    action,
    createOperation<unknown, Record<string, unknown>>({
      method: "POST",
      path: ({ id }) =>
        `/api/neon/business-partner-cases/${encodePathSegment(id)}/${action}`,
      idempotency: "required",
    }),
  ]),
);

/** Reset all drafts and receipts when the authenticated tenant/principal changes. */
export function CorePartnerRegistration() {
  const identity = useSessionIdentity();
  return (
    <RegistrationWorkspace
      key={JSON.stringify(identity)}
      principalId={identity.scope?.principalId}
    />
  );
}
function RegistrationWorkspace({ principalId }: { principalId?: string }) {
  const invalidateChangedRuntimeResources = useChangedRuntimeResources();
  const http = useApiClient(),
    permissions = usePermissions();
  const allowed = (action: string) =>
    permissions.has(`neon.business_partner_registration.${action}`);
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [country, setCountry] = useState("MY");
  const [category, setCategory] = useState<"organization" | "person">("organization");
  const [personId, setPersonId] = useState("");
  const canLinkPerson = permissions.has("neon.relationship.business_partner_person.read");
  const [caseId, setCaseId] = useState(""),
    [view, setView] = useState<RequestView>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [reason, setReason] = useState("");
  const keys = useRef(new Map<string, string>());
  const keyFor = (payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = `core-registration-${crypto.randomUUID()}`;
      keys.current.set(fingerprint, key);
    }
    return key;
  };
  const load = async (id: string) => {
    const next = await http.request(read, { params: { id } });
    if (
      next.request.kind !== "new_partner" ||
      next.request.requestedRole ||
      next.request.companyCodeId ||
      next.request.operatingOrganizationId
    )
      throw Error(
        "This screen accepts only tenant-level core registration cases.",
      );
    setView(next);
    return next;
  };
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Operation failed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  };
  const request = view?.request;
  const task = useMemo(
    () =>
      view?.workflow?.stages
        .filter((stage) => stage.status === "active")
        .flatMap((stage) => stage.workItems)
        .find(
          (item) =>
            item.status === "open" && item.ownerPrincipalId === principalId,
        ),
    [view, principalId],
  );
  const command = (action: string, body: Record<string, unknown>) =>
    run(async () => {
      if (!request) return;
      const idempotencyKey = keyFor({ id: request.id, action, body });
      const receipt = await http.request(commands[action]!, {
        params: { id: request.id },
        body: { ...body, idempotencyKey },
        idempotencyKey,
      });
      const result = receipt as {changedResources?:unknown;request?:PartnerRequest};
      invalidateChangedRuntimeResources(result?.changedResources, result?.request?.materializedBusinessPartnerId ?? request.targetBusinessPartnerId ?? request.materializedBusinessPartnerId);
      const next = await load(request.id);
      invalidateChangedRuntimeResources(undefined, next.request.materializedBusinessPartnerId ?? next.request.targetBusinessPartnerId);
    });
  return (
    <main aria-busy={busy} className="bp-core-registration">
      <h1>Register a business partner</h1>
      <p>
        Capture partner identity at tenant level. Registration does not grant
        supplier/customer qualification or company usage. Declare UNSPSC
        commodities after registration; category mapping is optional.
      </p>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy}>
        <legend>Resume or review a registration</legend>
        <label>
          Case ID{" "}
          <input
            value={caseId}
            onChange={(e) => {
              setCaseId(e.target.value);
              setView(undefined);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!allowed("read") || !caseId.trim()}
          onClick={() => void run(() => load(caseId.trim()))}
        >
          Load registration
        </button>
      </fieldset>
      {!request && allowed("create") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const body = {
                kind: "new_partner",
                source: { kind: "manual" },
                registrationMode: "direct",
                proposedPayload: {
                  name: name.trim(),
                  ...(code.trim() ? { businessPartnerCode: code.trim() } : {}),
                  partnerCategory: category,
                  ownershipClass: "external",
                  ...(category === "person" ? {personId: personId.trim()} : {registrationCountryCode: country.trim().toUpperCase()}),
                },
              };
              const idempotencyKey = keyFor(body);
              const result = await http.request(create, {
                body: { ...body, idempotencyKey },
                idempotencyKey,
              });
              setCaseId(result.request.id);
              await load(result.request.id);
            });
          }}
        >
          <fieldset disabled={busy}>
            <legend>New business partner</legend>
            <label>
              Partner category{" "}
              <select value={category} onChange={e=>setCategory(e.target.value as "organization" | "person")}>
                <option value="organization">Organization</option>
                {canLinkPerson && <option value="person">Person</option>}
              </select>
            </label>
            <label>
              {category === "organization" ? "Legal name" : "Display name"}{" "}
              <input
                required
                maxLength={320}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Partner code{" "}
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {category === "person" ? <label>
              Existing tenant-local person ID{" "}
              <input required value={personId} onChange={e=>setPersonId(e.target.value)}
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" />
              <span>Use an existing authorized person reference; this does not create a person or employment.</span>
            </label> : <label>
              Registration country (ISO code){" "}
              <input
                required
                pattern="[A-Za-z]{2}"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </label>}
            <button type="submit">Create registration draft</button>
          </fieldset>
        </form>
      )}
      {request && (
        <section aria-label="Registration case">
          <h2>{String(request.proposedPayload.name ?? request.requestNo)}</h2>
          <p>
            Case: {request.id} · Status: {request.status} · Version:{" "}
            {request.rowVersion}
          </p>
          <p>Share this case ID with the independent registration approver.</p>
          <button
            disabled={busy}
            onClick={() => void run(() => load(request.id))}
          >
            Refresh registration
          </button>
          {view?.validationFindings.map((finding, i) => (
            <p key={i}>
              {finding.severity}: {finding.messageCode}
            </p>
          ))}
          {["draft", "validation_failed"].includes(request.status) && (
            <>
              <button
                disabled={busy || !allowed("validate")}
                onClick={() =>
                  void command("validate", {
                    expectedVersion: request.rowVersion,
                  })
                }
              >
                Validate registration
              </button>
              <button
                disabled={busy || !allowed("submit")}
                onClick={() =>
                  void command("submit", {
                    expectedVersion: request.rowVersion,
                  })
                }
              >
                Submit for independent approval
              </button>
            </>
          )}
          {task && allowed("decide") && (
            <fieldset disabled={busy}>
              <legend>Independent review</legend>
              <label>
                Review reason{" "}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {(["approve", "return", "reject"] as const).map((decision) => (
                <button
                  key={decision}
                  disabled={!reason.trim()}
                  onClick={() =>
                    void command("decisions", {
                      workflowRequestId: view!.workflow!.requestId,
                      workItemId: task.id,
                      expectedRequestVersion: request.rowVersion,
                      expectedWorkItemVersion: task.rowVersion,
                      decision,
                      reason: reason.trim(),
                    })
                  }
                >
                  {decision} registration
                </button>
              ))}
            </fieldset>
          )}
          {request.status === "approved" && (
            <button
              disabled={busy || !allowed("materialize")}
              onClick={() =>
                void command("materialize", {
                  expectedVersion: request.rowVersion,
                })
              }
            >
              Materialize approved partner
            </button>
          )}
          {request.materializedBusinessPartnerId && (
            <p role="status">
              Registered partner: {request.materializedBusinessPartnerId}. No
              commercial role or company assignment was requested.
            </p>
          )}
        </section>
      )}
      <form
        method="post"
        action="/api/auth/step-up/start?returnTo=%2Fmdg%2Fbusiness-partner%2Fregister"
      >
        <input
          type="hidden"
          name="csrfToken"
          value={readBrowserCsrfToken() ?? ""}
        />
        <p>
          Submission, decisions and materialization require current MFA. Save
          your case ID before refreshing your session.
        </p>
        <button type="submit">Refresh MFA</button>
      </form>
    </main>
  );
}
