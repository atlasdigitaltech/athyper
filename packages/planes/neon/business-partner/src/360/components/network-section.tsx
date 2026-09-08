import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useEffect, useMemo, useState } from "react";
import {
  createBusinessPartner360NetworkClient,
  networkQueryKey,
  type NetworkSection as NetworkSectionContract,
} from "../business-partner-360-network-client";
import { useBusinessPartner360 } from "../business-partner-360-context";

export function NetworkSection() {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360(),
    client = useMemo(() => createBusinessPartner360NetworkClient(http), [http]),
    [value, setValue] = useState<NetworkSectionContract>(),
    [failed, setFailed] = useState(false),
    explicitAsOf =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("asOf"),
    query = {
      tenantId: identity.scope?.tenantId ?? "unbound",
      principalId: identity.scope?.principalId ?? "unbound",
      businessPartnerId: summary.identity.id,
      sectionCode: "network" as const,
      roleLens,
      authEpoch: identity.scope?.authEpoch ?? 0,
      ...(summary.scope.operatingOrganizationId
        ? { operatingOrganizationId: summary.scope.operatingOrganizationId }
        : {}),
      ...(summary.scope.companyCodeId
        ? { companyCodeId: summary.scope.companyCodeId }
        : {}),
      ...(summary.scope.legalEntityId
        ? { legalEntityId: summary.scope.legalEntityId }
        : {}),
      ...(explicitAsOf ? { asOf: summary.asOf } : {}),
    },
    key = networkQueryKey(query).join(":");
  useEffect(() => {
    const controller = new AbortController();
    setValue(undefined);
    setFailed(false);
    client
      .read(query, controller.signal)
      .then(setValue)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [client, key]);
  if (failed)
    return (
      <Card className="bp360-section-card">
        <h2>Network unavailable</h2>
        <p>
          The core Business Partner view and its local sections remain
          available.
        </p>
      </Card>
    );
  if (!value) return <Skeleton className="bp360-shell-skeleton" />;
  const local = record(value.data["local"]),
    live = record(value.data["live"]);
  if (!local)
    return (
      <Card className="bp360-section-card">
        <h2>No governed network relationship</h2>
        <p>
          A valid NEON account link is required before live MESH access is
          attempted.
        </p>
      </Card>
    );
  return (
    <div className="bp360-section-list">
      {value.state === "stale" ? (
        <Card className="bp360-section-card">
          <strong>Stale network evidence</strong>
          <p>
            Local evidence remains visible with its observed time. Other
            Business Partner sections are unaffected.
          </p>
        </Card>
      ) : null}
      <LocalEvidence value={local} />
      <LiveEvidence value={live} />
      <Provenance values={rows(local["provenance"])} />
    </div>
  );
}
function LocalEvidence({
  value,
}: {
  value: Readonly<Record<string, unknown>>;
}) {
  const link = record(value["accountLink"]),
    received = record(value["received"]),
    match = record(value["match"]),
    acceptance = record(value["acceptance"]),
    bank = record(value["bankDisclosure"]);
  return (
    <>
      <Card className="bp360-section-card">
        <h2>NEON network account link</h2>
        <Fields
          value={link}
          names={[
            "networkRelationshipId",
            "sourceTenantId",
            "sourceNetworkAccountId",
            "recipientNetworkAccountId",
            "proposedRole",
            "status",
            "approvedAt",
            "terminatedAt",
          ]}
        />
      </Card>
      <Card className="bp360-section-card">
        <h2>Received publication</h2>
        <Fields
          value={received}
          names={[
            "state",
            "publicationId",
            "publicationVersion",
            "lifecycleVersion",
            "snapshotId",
            "receivedAt",
          ]}
        />
        <p>
          Received and withdrawn describe this recipient-local projection; they
          do not assert full identity parity.
        </p>
      </Card>
      <Card className="bp360-section-card">
        <h2>Match and selective acceptance</h2>
        {match ? (
          <Fields
            value={match}
            names={[
              "state",
              "algorithmCode",
              "algorithmVersion",
              "matchedAt",
              "diffHash",
              "fieldPaths",
            ]}
          />
        ) : (
          <p>No pinned match evidence.</p>
        )}
        {acceptance ? (
          <>
            <Fields
              value={acceptance}
              names={[
                "state",
                "acceptedFields",
                "ignoredFields",
                "acceptanceHash",
                "preparedAt",
                "businessPartnerRequestId",
                "recordedAt",
              ]}
            />
            <p>
              Accepted fields entered the governed request path. Ignored fields
              remain source evidence only.
            </p>
          </>
        ) : (
          <p>No fields have been selectively accepted.</p>
        )}
      </Card>
      <Card className="bp360-section-card">
        <h2>Bank disclosure</h2>
        <Fields
          value={bank}
          names={[
            "present",
            "status",
            "disclosureVersion",
            "lifecycleVersion",
            "observedAt",
          ]}
        />
        <p>
          Only presence and lifecycle status are shown. Account details require
          separate bank governance.
        </p>
      </Card>
    </>
  );
}
function LiveEvidence({
  value,
}: {
  value?: Readonly<Record<string, unknown>>;
}) {
  const state = String(value?.["state"] ?? "unavailable"),
    summary = record(value?.["summary"]),
    relationship = record(summary?.["relationship"]),
    publication = record(summary?.["publication"]),
    authorization = record(summary?.["authorization"]);
  return (
    <Card className="bp360-section-card">
      <h2>Live MESH summary</h2>
      <p>
        Status: {label(state)}
        {value?.["reasonCode"] ? ` · ${String(value["reasonCode"])}` : ""}
      </p>
      {summary ? (
        <>
          <Fields
            value={authorization}
            names={["decision", "permissionCode", "networkRelationshipId"]}
          />
          <Fields
            value={relationship}
            names={[
              "status",
              "relationshipType",
              "direction",
              "effectiveFrom",
              "effectiveUntil",
            ]}
          />
          {publication ? (
            <Fields
              value={publication}
              names={[
                "status",
                "publicationVersion",
                "lifecycleVersion",
                "publishedAt",
                "withdrawnAt",
              ]}
            />
          ) : (
            <p>No live publication summary.</p>
          )}
          <Provenance values={rows(summary["provenance"])} />
        </>
      ) : (
        <p>
          The local safe projection remains authoritative for this page when
          MESH is denied, slow, incompatible, or unavailable.
        </p>
      )}
    </Card>
  );
}
function Provenance({
  values,
}: {
  values: readonly Readonly<Record<string, unknown>>[];
}) {
  return (
    <Card className="bp360-section-card">
      <h2>Authority and provenance</h2>
      {values.length ? (
        values.map((item, index) => (
          <dl key={`${String(item["sourceObject"])}:${index}`}>
            <Fields
              value={item}
              names={[
                "authority",
                "authorityTenantId",
                "sourceObject",
                "observedAt",
                "schemaCode",
                "schemaVersion",
                "fieldSetCode",
                "hash",
                "freshness",
              ]}
            />
          </dl>
        ))
      ) : (
        <p>No provenance available.</p>
      )}
    </Card>
  );
}
function Fields({
  value,
  names,
}: {
  value?: Readonly<Record<string, unknown>>;
  names: readonly string[];
}) {
  return value ? (
    <dl>
      {names.map((name) => (
        <div key={name}>
          <dt>{label(name)}</dt>
          <dd>{show(value[name])}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}
function rows(value: unknown) {
  return Array.isArray(value)
    ? (value.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      ) as readonly Readonly<Record<string, unknown>>[])
    : [];
}
function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}
function show(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return Array.isArray(value) ? value.join(", ") : String(value);
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}
