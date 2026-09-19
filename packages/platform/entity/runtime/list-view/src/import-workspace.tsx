"use client";

import type { EntityListDescriptorV1, EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { entityListDescriptorOperation, type HttpClient } from "@athyper/platform-api-client";
import { Button } from "@athyper/platform-ui";
import React, { useEffect, useMemo, useState } from "react";
import { ImportWizard } from "./data-operations";

export interface RecordImportWorkspaceProps {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly scopeCoordinate?: EntityListScopeCoordinateV1;
}

export function RecordImportWorkspace({ client, entityCode, scopeCoordinate }: RecordImportWorkspaceProps) {
  const [descriptor, setDescriptor] = useState<EntityListDescriptorV1>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const query = useMemo(() => ({
    ...(scopeCoordinate?.companyCodeId ? { companyCodeId: scopeCoordinate.companyCodeId } : {}),
    ...(scopeCoordinate?.legalEntityId ? { legalEntityId: scopeCoordinate.legalEntityId } : {}),
    ...(scopeCoordinate?.operatingOrganizationId ? { operatingOrganizationId: scopeCoordinate.operatingOrganizationId } : {}),
    ...(scopeCoordinate?.networkAccountId ? { networkAccountId: scopeCoordinate.networkAccountId } : {}),
  }), [scopeCoordinate]);

  useEffect(() => {
    let active = true;
    setDescriptor(undefined);
    setError("");
    if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(entityCode)) {
      setError("Choose an entity from its list view before starting an import.");
      return () => { active = false; };
    }
    void client.request(entityListDescriptorOperation, { params: { entityCode }, query })
      .then((value) => { if (active) setDescriptor(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "The import definition could not be loaded."); });
    return () => { active = false; };
  }, [client, entityCode, query]);

  return <main className="a-entity-list__import-workspace" aria-busy={!descriptor && !error}>
    <header><div><p>Data transfers</p><h1>Guided import</h1><span>Prepare, validate, review, and commit through the same governed pipeline.</span></div><Button variant="secondary" size="small" onClick={() => window.location.assign("/operations/data-transfers")}>Import and export activity</Button></header>
    {status ? <p role="status" className="a-entity-list__transfer-status">{status}</p> : null}
    {error ? <section className="a-entity-list__transfer-empty" role="alert"><h2>Import unavailable</h2><p>{error}</p><Button variant="secondary" size="small" onClick={() => window.history.back()}>Go back</Button></section> : null}
    {!descriptor && !error ? <section className="a-entity-list__transfer-empty"><p>Loading the authorized import definition…</p></section> : null}
    {descriptor?.dataOperations ? <ImportWizard client={client} descriptor={descriptor} scopeCoordinate={scopeCoordinate} open onOpenChange={(open) => { if (!open) window.location.assign("/operations/data-transfers"); }} onStatus={setStatus}/> : null}
  </main>;
}
