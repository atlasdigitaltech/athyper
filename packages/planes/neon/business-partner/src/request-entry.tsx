"use client";

import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import {
  entityApplicationDescriptorOperation,
  entityListDescriptorOperation,
  entityListOperation,
  entityListQuery,
} from "@athyper/platform-api-client";
import {
  useApiClient,
  usePermissions,
} from "@athyper/platform-shell-app-foundation";
import { BusinessPartnerPageFrame } from "./page-frame";
import { Button, Card, Input, Label, Select } from "@athyper/platform-ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  EntityIntake,
  EntityIntakeSurface,
  type EntityLookupAdapters,
  intakeSurfaceValues,
  useEntityIntake,
} from "@athyper/platform-entity-form-detail";
import type {
  EntityIntakeFlowV1,
  EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";
import type { RequestView } from "./client";
import { NewBusinessPartnerRequest } from "./index";
import { NewCustomerRequest } from "./customer-request";
import {
  GovernedBusinessPartnerRoleExtension,
  type CommercialRole,
} from "./role-extension-experience";

type SearchResult = Awaited<
  ReturnType<NonNullable<typeof entityListOperation.parse>>
>;

export function BusinessPartnerRequestEntry({
  initialRole,
  initialRequest,
}: {
  readonly initialRequest?: RequestView;
  readonly initialRole?: CommercialRole;
}) {
  const http = useApiClient();
  const permissions = usePermissions();
  const [loaded, setLoaded] = useState<{
    flow: EntityIntakeFlowV1;
    surface?: EntityIntakeSurfaceV1;
    hash: string;
    hint?: string;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!permissions.has(initialRequest ? "neon.relationship.entity_case.update" : "neon.relationship.entity_case.create")) return;
    const controller = new AbortController();
    http
      .request(entityApplicationDescriptorOperation, {
        params: { entityCode: "business_partner" },
        signal: controller.signal,
      })
      .then((descriptor) => {
        const flow = descriptor.intakeFlows?.find(
          (f) => f.key === "request_intake",
        );
        if (!flow)
          throw Error(
            "The business partner intake flow has not been published.",
          );
        const surface = descriptor.intakeSurfaces?.find(
          (s) => s.key === flow.steps[0]?.surfaceKey,
        );
        if (
          surface &&
          !surface.sections.some((s) =>
            s.fields.some((f) => f.key === "requested_role"),
          )
        )
          throw Error(
            "The partner role surface is missing its requested_role binding.",
          );
        if (!controller.signal.aborted)
          setLoaded({
            flow,
            surface,
            hash: descriptor.revision.descriptorHash,
            hint: descriptor.intakeSurfaces?.find(s=>s.key==="intake_details")?.formLabels?.chooseRoleHint,
          });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Unable to load intake",
          );
      });
    return () => controller.abort();
  }, [http]);
  if (!permissions.has(initialRequest ? "neon.relationship.entity_case.update" : "neon.relationship.entity_case.create"))
    return (
      <p role="alert">
        You do not have permission to create business partner requests.
      </p>
    );
  if (!loaded)
    return (
      <p role={error ? "alert" : "status"}>
        {error ?? "Loading request steps…"}
      </p>
    );
  return (
    <EntityIntake
      key={loaded.hash}
      flow={loaded.flow}
      descriptorHash={loaded.hash}
      initialPresentation={{compact:true,context:loaded.hint}}
      initialCheckpoint={initialRequest ? {flowKey: loaded.flow.key, descriptorHash: loaded.hash, currentStep: "details", completed: ["partner"]} : undefined}
      cancelHref="/mdg/business-partner/manage"
    >
      {initialRequest ? <NewBusinessPartnerRequest initialRequest={initialRequest} /> : <BusinessPartnerRequestContent
        initialRole={initialRole}
        surface={loaded.surface}
      />}
    </EntityIntake>
  );
}
export function BusinessPartnerRequestContent({
  initialRole,
  surface,
}: {
  readonly initialRole?: CommercialRole;
  readonly surface?: EntityIntakeSurfaceV1;
}) {
  const intake = useEntityIntake();
  const [detailsDirty, setDetailsDirty] = useState(false);
  const http = useApiClient();
  const permissions = usePermissions();
  const [role, setRole] = useState<CommercialRole | "">(() => {
    const candidate = surface
      ? intakeSurfaceValues(surface, { requested_role: initialRole })
          .requested_role
      : initialRole;
    return candidate === "supplier" || candidate === "customer"
      ? candidate
      : "";
  });
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [target, setTarget] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);

  function resetSearch() {
    controller.current?.abort();
    setResult(undefined);
    setError(undefined);
    setBusy(false);
  }

  async function lookupPartners(query: string, signal: AbortSignal) {
      const params = { entityCode: "business_partner" };
      const descriptor = await http.request(entityListDescriptorOperation, {
        params,
        signal: signal,
      });
      if (query.trim().length < descriptor.surface.search.minimumQueryLength)
        throw new Error(
          `Enter at least ${descriptor.surface.search.minimumQueryLength} characters to search.`,
        );
      // Search across roles: an existing customer may be the supplier being onboarded.
      const found = await http.request(entityListOperation, {
        params,
        query: entityListQuery(
          { query, filters: [], sort: [], columns: [] },
          descriptor,
        ),
        signal: signal,
      });
      return found;
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    resetSearch();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    try {
      const found = await lookupPartners(query, request.signal);
      if (!request.signal.aborted) setResult(found);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to search business partners.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  if (!permissions.has("neon.relationship.entity_case.create"))
    return (
      <BusinessPartnerPageFrame title="New request">
        <p role="alert">
          You do not have permission to create business partner requests.
        </p>
      </BusinessPartnerPageFrame>
    );
  function changeRole(answers: Readonly<Record<string, string>>) {
    const nextRole = answers.requested_role;
    if (nextRole !== "supplier" && nextRole !== "customer") return;
    if (
      detailsDirty &&
      !window.confirm(
        "Changing the role will discard the entered details. Continue?",
      )
    )
      return;
    setTarget(undefined);
    setDetailsDirty(false);
    intake?.invalidate("partner");
    setRole(nextRole);
    resetSearch();
  }
  function chooseTarget(value: string) {
    if (
      detailsDirty &&
      value !== target &&
      !window.confirm(
        "Changing the partner will discard the entered details. Continue?",
      )
    )
      return;
    if (value !== target) setDetailsDirty(false);
    setTarget(value);
    intake?.next();
  }
  const hasLookup = surface?.sections.some(section => section.fields.some(field => field.control === "entityLookup"));
  const lookupAdapters: EntityLookupAdapters = {
    "business_partner.intake": {
      targetEntity: "business_partner",
      actions: ["select", "create", "view"],
      client: http,
      creationActions: ["request_partner"],
      resolveActions: async signal => {
        const descriptor = await http.request(entityApplicationDescriptorOperation, {
          params: { entityCode: "business_partner" }, signal,
        });
        const action = descriptor.actions.find(action => action.key === "new_supplier_request");
        const decision = { state: action?.state ?? "hidden" as const,
          ...(action?.disabledMessage ? { reason: action.disabledMessage.values[action.disabledMessage.defaultLocale] } : {}) };
        return { select: decision, creation: { request_partner: decision } };
      },
      validateSelection: async rows => Promise.all(rows.map(async row => {
        const current = await entityDescriptorClient.record(http, "business_partner", row.id);
        if (current.id !== row.id) throw Error("The selected partner is no longer available.");
        return row;
      })),
      select: row => chooseTarget(row.id),
      create: () => chooseTarget("new"),
      viewHref: row => `/mdg/business-partner/${encodeURIComponent(row.id)}`,
    },
  };
  return (
    <>
      <div hidden={Boolean(intake && intake.state.currentStep !== "partner")}>
        <BusinessPartnerPageFrame
          contentOnly={Boolean(intake)}
          title="New business partner request"
          description="Choose a role, check for an existing partner, then enter details and submit the request for approval."
          actions={
            <a
              className="a-button a-button--secondary"
              href="/mdg/business-partner/manage"
            >
              Cancel
            </a>
          }
        >
          {surface ? (
            <EntityIntakeSurface
              surface={surface}
              answers={{ requested_role: role }}
              onChange={changeRole}
              lookupAdapters={lookupAdapters}
            />
          ) : (
            <LegacyRequestedRole
              role={role}
              onChange={(value) => changeRole({ requested_role: value })}
            />
          )}
          {role && !hasLookup ? (
            <Card className="bp-section">
              <h2>Find an existing partner</h2>
              <p>
                Search across suppliers and customers to reuse an existing
                identity.
              </p>
              <form className="bp-form" onSubmit={search}>
                <Label htmlFor="bp-partner-search">Partner name or code</Label>
                <Input
                  id="bp-partner-search"
                  value={query}
                  required
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    resetSearch();
                  }}
                />
                <Button
                  type="submit"
                  loading={busy}
                  disabled={!query.trim() || busy}
                >
                  Search partners
                </Button>
              </form>
              {error ? <p role="alert">{error}</p> : null}
              {result ? (
                <div aria-live="polite">
                  <p>
                    {result.rows.length
                      ? "Select an existing partner to check its roles in your organization."
                      : "No matching partners were found in your authorized directory."}
                  </p>
                  <ul>
                    {result.rows.map((row) => (
                      <li key={row.id}>
                        <span>
                          {String(
                            row.values.displayName ??
                              row.values.name ??
                              row.values.legalName ??
                              row.values.code ??
                              row.id,
                          )}
                          {row.values.code ? ` · ${row.values.code}` : ""}
                        </span>{" "}
                        <Button
                          variant="secondary"
                          onClick={() => chooseTarget(row.id)}
                        >
                          Use existing partner
                        </Button>{" "}
                        <a
                          href={`/mdg/business-partner/${encodeURIComponent(row.id)}`}
                        >
                          View partner
                        </a>
                      </li>
                    ))}
                  </ul>
                  {result.pagination.hasNext ? (
                    <p>
                      More matches are available. Refine your search before
                      creating a new partner.
                    </p>
                  ) : null}
                  <p>
                    If this is a different organization, start a new {role}{" "}
                    request.
                  </p>
                  <Button onClick={() => chooseTarget("new")}>
                    New {role} request
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </BusinessPartnerPageFrame>
      </div>
      {role && target ? (
        <div
          key={`${role}:${target}`}
          hidden={intake?.state.currentStep === "partner"}
          onChangeCapture={() => setDetailsDirty(true)}
        >
          {target === "new" ? (
            role === "supplier" ? (
              <NewBusinessPartnerRequest onDirty={()=>setDetailsDirty(true)} onSaved={()=>setDetailsDirty(false)} />
            ) : (
              <NewCustomerRequest />
            )
          ) : (
            <GovernedBusinessPartnerRoleExtension
              businessPartnerId={target}
              requestedRole={role}
            />
          )}
        </div>
      ) : null}
    </>
  );
}

/** Compatibility with pre-surface publications; removed only after rollout is complete. */
function LegacyRequestedRole({
  role,
  onChange,
}: {
  readonly role: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Card className="bp-section">
      <Label htmlFor="bp-request-role">Role *</Label>
      <Select
        required
        id="bp-request-role"
        value={role}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">Select supplier or customer</option>
        <option value="supplier">Supplier — we buy from them</option>
        <option value="customer">Customer — we sell to them</option>
      </Select>
    </Card>
  );
}
